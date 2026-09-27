import type { Ctx } from '../context.js';
import { githubClient } from '../context.js';
import { boundedBytes } from '../bounded-body.js';
import { fail, validationFailure } from '../http.js';
import { materializationFiles } from '../knowledge-materialization.js';
import { validateEntity } from '../validate.js';
import { commitImmutableFiles } from '../write.js';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const KB_URL=/^http:\/\/127\.0\.0\.1:(?:4390|4391)\/?$/;

async function readKnowledge(ctx:Ctx,path:string):Promise<unknown>{
  const configured=ctx.env.KNOWLEDGE_BASE_URL;
  if(typeof configured!=='string'||!KB_URL.test(configured))throw fail('not_configured',{message:'菜谱知识库尚未连接'});
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),10000);
  try{
    const send=ctx.env.__knowledgeFetch??fetch;
    const response=await send(`${configured.replace(/\/$/,'')}/api/v1${path}`,{method:'GET',headers:{'X-KB-Client':'web'},redirect:'manual',signal:controller.signal});
    if(response.status===404)throw fail('not_found');
    if(response.status!==200||!/^application\/json(?:;|$)/i.test(response.headers.get('Content-Type')??''))throw fail('upstream_error',{message:'菜谱知识库未返回完整的审核资料'});
    const bytes=await boundedBytes(response.body,2*1024*1024,controller.signal);
    return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
  }catch(error){
    if(error instanceof Error&&error.name==='HttpError')throw error;
    throw fail('upstream_error',{message:'菜谱知识库暂时无法读取审核版本'});
  }finally{clearTimeout(timer);}
}

export async function handleKnowledgeMaterialization(ctx:Ctx){
  const candidateId=ctx.params.id??'';
  if(!UUID.test(candidateId)||ctx.url.search)throw fail('bad_id');
  if(!ctx.body||Array.isArray(ctx.body)||typeof ctx.body!=='object'||Object.keys(ctx.body).length)throw fail('bad_json');
  const candidate=await readKnowledge(ctx,`/favorites/candidates/${candidateId}`) as {id:string;status:string;recipeId?:string;recipeVersion?:number;reviewer?:string};
  if(candidate.id!==candidateId||candidate.status!=='approved'||!UUID.test(candidate.recipeId??'')||!Number.isSafeInteger(candidate.recipeVersion))throw fail('review_required',{message:'只有已审核的菜谱版本可以排进菜单'});
  const detail=await readKnowledge(ctx,`/recipes/${candidate.recipeId}/revisions/${candidate.recipeVersion}`) as Parameters<typeof materializationFiles>[1];
  let materialized;
  try{materialized=await materializationFiles(candidate,detail);}catch{throw fail('invalid_source',{message:'已审核的菜谱版本资料不完整，不能固定到菜单'});}
  for(const file of materialized.files){
    const kind=file.path.startsWith('data/dishes/')?'dish':'ingredient';
    const checked=validateEntity(kind,JSON.parse(file.text));
    if(!checked.valid)throw validationFailure(checked.errors);
  }
  const gh=githubClient(ctx);
  const outcome=await commitImmutableFiles(gh,materialized.files.map(file=>({path:file.path,bytes:new TextEncoder().encode(file.text)})),
    {subject:`data(knowledge): 固定菜谱 ${materialized.dishRef}`,role:ctx.role,endpoint:ctx.endpointConcrete});
  return {ok:true,dishRef:materialized.dishRef,recipeId:candidate.recipeId,recipeVersion:candidate.recipeVersion,
    candidateId,snapshotHash:materialized.snapshotHash,unresolvedCount:materialized.unresolvedCount,
    commit:outcome.commit,unchanged:outcome.unchanged};
}

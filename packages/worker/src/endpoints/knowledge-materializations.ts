import type { Ctx } from '../context.js';
import { githubClient } from '../context.js';
import { boundedBytes } from '../bounded-body.js';
import { fail, validationFailure } from '../http.js';
import { materializationFiles, type PinnedImage } from '../knowledge-materialization.js';
import { inspectImage } from '../image-integrity.js';
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

async function readKnowledgeImage(ctx:Ctx,assetId:string,expectedHash:string):Promise<PinnedImage>{
  const configured=ctx.env.KNOWLEDGE_BASE_URL;
  if(typeof configured!=='string'||!KB_URL.test(configured)||!UUID.test(assetId)||!/^[0-9a-f]{64}$/.test(expectedHash))throw fail('invalid_source');
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
  try{
    const send=ctx.env.__knowledgeFetch??fetch;
    const response=await send(`${configured.replace(/\/$/,'')}/api/v1/assets/${assetId}/content`,{method:'GET',headers:{'X-KB-Client':'web'},redirect:'manual',signal:controller.signal});
    const mime=response.headers.get('Content-Type')??'';
    if(response.status!==200||!/^image\/(?:png|jpeg|webp)(?:;|$)/i.test(mime))throw fail('invalid_source',{message:'知识库图片未返回有效的同版字节'});
    const bytes=await boundedBytes(response.body,8*1024*1024,controller.signal);
    const info=inspectImage(bytes);
    const expectedMime=info?.ext==='jpg'?'image/jpeg':info?`image/${info.ext}`:'';
    if(!info||mime.split(';')[0]?.toLowerCase()!==expectedMime)throw fail('invalid_source',{message:'知识库图片格式不完整'});
    const digest=await crypto.subtle.digest('SHA-256',new Uint8Array(bytes));
    const actual=[...new Uint8Array(digest)].map(value=>value.toString(16).padStart(2,'0')).join('');
    if(actual!==expectedHash)throw fail('invalid_source',{message:'知识库图片与固定版本的哈希不一致'});
    return {assetId,bytes,ext:info.ext,rights:{license:''}};
  }catch(error){
    if(error instanceof Error&&error.name==='HttpError')throw error;
    throw fail('invalid_source',{message:'知识库同版图片暂不可用'});
  }finally{clearTimeout(timer);}
}

export async function handleKnowledgeMaterialization(ctx:Ctx){
  const candidateId=ctx.params.id??'';
  if(!UUID.test(candidateId)||ctx.url.search)throw fail('bad_id');
  if(!ctx.body||Array.isArray(ctx.body)||typeof ctx.body!=='object')throw fail('bad_json');
  const body=ctx.body as Record<string,unknown>;
  if(Object.keys(body).some(key=>!['recipeVersion','reviewer','note'].includes(key)))throw fail('bad_json');
  const candidate=await readKnowledge(ctx,`/favorites/candidates/${candidateId}`) as {id:string;status:string;recipeId?:string;recipeVersion?:number;reviewer?:string};
  if(candidate.id!==candidateId||candidate.status!=='approved'||!UUID.test(candidate.recipeId??'')||!Number.isSafeInteger(candidate.recipeVersion))throw fail('review_required',{message:'只有已审核的菜谱版本可以排进菜单'});
  const original=await readKnowledge(ctx,`/recipes/${candidate.recipeId}/revisions/${candidate.recipeVersion}`) as Parameters<typeof materializationFiles>[1];
  let selected={...candidate};
  let detail=original;
  if(Object.keys(body).length){
    const version=body.recipeVersion;
    if(!Number.isSafeInteger(version)||typeof version!=='number'||version<=candidate.recipeVersion!||version>1000000||
      typeof body.reviewer!=='string'||!body.reviewer.trim()||body.reviewer.length>200||
      typeof body.note!=='string'||!body.note.trim()||body.note.length>2000)throw fail('bad_json',{message:'新版本需要准确版本号、审核人和对照说明'});
    detail=await readKnowledge(ctx,`/recipes/${candidate.recipeId}/revisions/${version}`) as typeof original;
    if(detail.id!==candidate.recipeId||detail.version!==version)throw fail('invalid_source',{message:'菜谱版本与请求不一致'});
    const approvedSources=new Set(original.recipe.sources?.map(ref=>(ref as {sourceId?:unknown}).sourceId).filter((id):id is string=>typeof id==='string'));
    if(!approvedSources.size||!detail.recipe.sources?.some(ref=>approvedSources.has((ref as {sourceId?:unknown}).sourceId as string)))
      throw fail('invalid_source',{message:'新版本已失去原审核作品的来源关联'});
    selected={...candidate,recipeVersion:version,review:{reviewer:body.reviewer.trim(),note:body.note.trim(),approvedCandidateVersion:candidate.recipeVersion}} as typeof selected;
  }
  const pinnedImages:PinnedImage[]=[];
  const media=detail.media??[];
  const used=new Set((detail.recipe.assets??[]).filter(ref=>ref.role==='cover'||ref.role==='step').map(ref=>ref.assetId));
  if(used.size>20)throw fail('invalid_source',{message:'此版本图片超过 20 张，请先整理菜谱'});
  let imageBytes=0;
  for(const item of media){
    if(!used.has(item.assetId)||item.kind!=='image'||item.status!=='ready'||
      !item.url?.startsWith('/api/v1/assets/')||!item.rights?.license||!item.rights.author)continue;
    const match=/^\/api\/v1\/assets\/([0-9a-f-]{36})\/content$/.exec(item.url);
    if(!match||match[1]!==item.assetId||!/^[0-9a-f]{64}$/.test(item.sha256??''))throw fail('invalid_source',{message:'菜谱图片缺少可核对的素材哈希'});
    const image=await readKnowledgeImage(ctx,item.assetId,item.sha256!);
    imageBytes+=image.bytes.length;
    if(imageBytes>32*1024*1024)throw fail('invalid_source',{message:'此版本图片合计超过 32 MiB'});
    image.rights=item.rights;
    pinnedImages.push(image);
  }
  let materialized;
  try{materialized=await materializationFiles(selected,detail,pinnedImages);}catch{throw fail('invalid_source',{message:'已审核的菜谱版本资料不完整，不能固定到菜单'});}
  for(const file of materialized.files){
    const kind=file.path.startsWith('data/dishes/')?'dish':'ingredient';
    const checked=validateEntity(kind,JSON.parse(file.text));
    if(!checked.valid)throw validationFailure(checked.errors);
  }
  const gh=githubClient(ctx);
  const outcome=await commitImmutableFiles(gh,[...materialized.files.map(file=>({path:file.path,bytes:new TextEncoder().encode(file.text)})),...materialized.imageFiles],
    {subject:`data(knowledge): 固定菜谱 ${materialized.dishRef}`,role:ctx.role,endpoint:ctx.endpointConcrete});
  return {ok:true,dishRef:materialized.dishRef,recipeId:candidate.recipeId,recipeVersion:detail.version,
    candidateId,snapshotHash:materialized.snapshotHash,unresolvedCount:materialized.unresolvedCount,
    commit:outcome.commit,unchanged:outcome.unchanged};
}

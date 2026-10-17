import type { Ctx } from '../context.js';
import { githubClient } from '../context.js';
import { boundedBytes } from '../bounded-body.js';
import { fail, validationFailure } from '../http.js';
import { contractHash, dependencyIds, recipeMaterializationFiles, type Detail, type KnowledgeTechnique, type PinnedDependencies, type PinnedImage } from '../knowledge-materialization.js';
import { inspectImage } from '../image-integrity.js';
import { validateEntity } from '../validate.js';
import { commitImmutableFiles } from '../write.js';
import { completeKnowledgeImageRights } from '@canteenos/core';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const KB_URL=/^http:\/\/127\.0\.0\.1:(?:4390|4391|4392)\/?$/;

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
  // reviewer / note are still accepted from older pages and ignored: approval is not part of freezing (ADR-0011).
  if(Object.keys(body).some(key=>!['recipeVersion','reviewer','note'].includes(key)))throw fail('bad_json');
  const candidate=await readKnowledge(ctx,`/favorites/candidates/${candidateId}`) as {id:string;recipeId?:string;recipeVersion?:number};
  if(candidate.id!==candidateId)throw fail('invalid_source');
  // A candidate is usable once it has been saved as a recipe; its source review state is not checked.
  if(!UUID.test(candidate.recipeId??'')||!Number.isSafeInteger(candidate.recipeVersion))throw fail('not_found',{message:'这条候选还没有存成菜谱'});
  const version=body.recipeVersion??candidate.recipeVersion;
  if(!Number.isSafeInteger(version)||typeof version!=='number'||version<1||version>1000000)throw fail('bad_json');
  return materializeSavedRecipe(ctx,candidate.recipeId!,version,candidateId);
}

export async function handleRecipeMaterialization(ctx:Ctx){
  const recipeId=ctx.params.id??'';
  if(!UUID.test(recipeId)||ctx.url.search)throw fail('bad_id');
  if(!ctx.body||Array.isArray(ctx.body)||typeof ctx.body!=='object')throw fail('bad_json');
  const body=ctx.body as Record<string,unknown>,version=body.recipeVersion;
  if(Object.keys(body).some(key=>key!=='recipeVersion')||!Number.isSafeInteger(version)||typeof version!=='number'||version<1||version>1000000)throw fail('bad_json');
  return materializeSavedRecipe(ctx,recipeId,version);
}

/** Which version is current and whether the recipe is archived; any approval record in the reply is ignored (ADR-0011). */
type RecipeState = {recipeId:string;recipeVersion:number;current:{version:number;archived:boolean}};
async function readRecipeState(ctx:Ctx,recipeId:string,version:number):Promise<RecipeState>{
  const value=await readKnowledge(ctx,`/recipes/${recipeId}/revisions/${version}/adoption`) as RecipeState;
  if(value.recipeId!==recipeId||value.recipeVersion!==version||!value.current||!Number.isSafeInteger(value.current.version)||value.current.version<version||typeof value.current.archived!=='boolean')throw fail('invalid_source');
  return value;
}
const ARCHIVED='已归档的菜谱不能排进菜单';

/** Read, at freeze time, the exact ingredient and technique revisions this recipe revision uses. */
async function readDependencies(ctx:Ctx,detail:Detail):Promise<PinnedDependencies>{
  const {ingredientIds,techniqueIds}=dependencyIds(detail);
  if(ingredientIds.length+techniqueIds.length>200||[...ingredientIds,...techniqueIds].some(id=>!UUID.test(id)))throw fail('invalid_source',{message:'菜谱引用的食材或技法不完整，不能固定到菜单'});
  const pinned=async (kind:'ingredients'|'techniques',id:string)=>{
    const current=await readKnowledge(ctx,`/${kind}/${id}`) as {id?:string;version?:number};
    if(current.id!==id||!Number.isSafeInteger(current.version)||current.version!<1)throw fail('invalid_source',{message:'菜谱引用的食材或技法不完整，不能固定到菜单'});
    const revision=await readKnowledge(ctx,`/${kind}/${id}/revisions/${current.version}`) as {id?:string;version?:number;ingredient?:Record<string,unknown>;technique?:KnowledgeTechnique;createdAt?:string};
    if(revision.id!==id||revision.version!==current.version)throw fail('invalid_source',{message:'菜谱引用的食材或技法不完整，不能固定到菜单'});
    return revision;
  };
  const ingredients:PinnedDependencies['ingredients']=[];
  for(const id of ingredientIds){
    const revision=await pinned('ingredients',id);
    if(!revision.ingredient||typeof revision.ingredient!=='object')throw fail('invalid_source',{message:'菜谱引用的食材或技法不完整，不能固定到菜单'});
    ingredients.push({id,version:revision.version!,ingredient:revision.ingredient,...(typeof revision.createdAt==='string'?{createdAt:revision.createdAt}:{})});
  }
  const techniques:PinnedDependencies['techniques']=[];
  for(const id of techniqueIds){
    const revision=await pinned('techniques',id);
    const technique=revision.technique;
    if(!technique||!['cut','heat','pretreat'].includes(technique.kind)||!technique.name)throw fail('invalid_source',{message:'菜谱引用的食材或技法不完整，不能固定到菜单'});
    techniques.push({id,hash:await contractHash(technique),technique});
  }
  return {ingredients,techniques};
}

async function materializeSavedRecipe(ctx:Ctx,recipeId:string,version:number,candidateId?:string){
  // Archive is checked just before writing, so a revision frozen before it was archived still replays as unchanged.
  await readRecipeState(ctx,recipeId,version);
  const detail=await readKnowledge(ctx,`/recipes/${recipeId}/revisions/${version}`) as Detail;
  if(detail.id!==recipeId||detail.version!==version)throw fail('invalid_source');
  const dependencies=await readDependencies(ctx,detail);
  const pinnedImages:PinnedImage[]=[];
  const media=detail.media??[];
  const used=new Set((detail.recipe.assets??[]).filter(ref=>ref.role==='cover'||ref.role==='step').map(ref=>ref.assetId));
  if(used.size>20)throw fail('invalid_source',{message:'此版本图片超过 20 张，请先整理菜谱'});
  let imageBytes=0;
  for(const item of media){
    if(!used.has(item.assetId)||item.kind!=='image'||item.status!=='ready'||
      !item.url?.startsWith('/api/v1/assets/')||!completeKnowledgeImageRights(item.rights))continue;
    const match=/^\/api\/v1\/assets\/([0-9a-f-]{36})\/content$/.exec(item.url);
    if(!match||match[1]!==item.assetId||!/^[0-9a-f]{64}$/.test(item.sha256??''))throw fail('invalid_source',{message:'菜谱图片缺少可核对的素材哈希'});
    const image=await readKnowledgeImage(ctx,item.assetId,item.sha256!);
    imageBytes+=image.bytes.length;
    if(imageBytes>32*1024*1024)throw fail('invalid_source',{message:'此版本图片合计超过 32 MiB'});
    image.rights=item.rights!;
    pinnedImages.push(image);
  }
  let materialized;
  try{materialized=await recipeMaterializationFiles(detail,dependencies,pinnedImages);}catch{throw fail('invalid_source',{message:'这一版菜谱资料不完整，不能固定到菜单'});}
  for(const file of materialized.files){
    const kind=file.path.startsWith('data/dishes/')?'dish':'ingredient';
    const checked=validateEntity(kind,JSON.parse(file.text));
    if(!checked.valid)throw validationFailure(checked.errors);
  }
  const gh=githubClient(ctx);
  const outcome=await commitImmutableFiles(gh,[...materialized.files.map(file=>({path:file.path,bytes:new TextEncoder().encode(file.text)})),...materialized.imageFiles],
    {subject:`data(knowledge): 固定菜谱 ${materialized.dishRef}`,role:ctx.role,endpoint:ctx.endpointConcrete,techniques:materialized.techniques,beforeWrite:async()=>{
      // Recheck just before the write: a recipe archived in the meantime is never frozen.
      if((await readRecipeState(ctx,recipeId,version)).current.archived)throw fail('review_required',{message:ARCHIVED});
    }});
  return {ok:true,dishRef:materialized.dishRef,recipeId,recipeVersion:detail.version,
    ...(candidateId?{candidateId}:{}),snapshotHash:materialized.snapshotHash,unresolvedCount:materialized.unresolvedCount,
    commit:outcome.commit,unchanged:outcome.unchanged};
}

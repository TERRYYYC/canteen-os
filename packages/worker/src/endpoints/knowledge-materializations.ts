import type { Ctx } from '../context.js';
import { githubClient } from '../context.js';
import { boundedBytes } from '../bounded-body.js';
import type { GitHubClient } from '../github.js';
import { fail, refusal, validationFailure, type Words } from '../http.js';
import { contractHash, dependencyIds, recipeMaterializationFiles, type Detail, type KnowledgeTechnique, type PinnedDependencies, type PinnedImage, type RuleReference } from '../knowledge-materialization.js';
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
const INCOMPLETE='这一版菜谱资料不完整，不能固定到菜单';
const RULES_UNREADABLE='师傅规则表格式不对，不能核对按规则填的值';

/** Why a revision cannot be frozen yet, in the kitchen's words (ADR-0012). */
const WORDS={
  unsourced:{zh:'份数按每份记的菜，每个用量都要写明出处',
    en:'For a dish counted per serving, every amount needs its source',
    uk:'Для страви, яку рахують на одну порцію, у кожної кількості має бути вказане джерело'},
  unclassified:{zh:'这一版有还没分类的「视频里没说清」条目，分完类再排进菜单',
    en:'This version has “not said in the video” items that are not sorted into a kind yet; sort them, then put it on a menu',
    uk:'У цій версії є пункти «у відео не сказано», яким ще не дали категорію; спершу розсортуйте їх, тоді додавайте в меню'},
  misplaced:{zh:'「视频里没说清」的条目指向这一版里没有的步骤或材料，改好存成新版本再排进菜单',
    en:'A “not said in the video” item points to a step or ingredient this version does not have; fix it and save a new version, then put it on a menu',
    uk:'Пункт «у відео не сказано» вказує на крок або продукт, якого в цій версії немає; виправте й збережіть нову версію, тоді додавайте в меню'},
  ruleMissing:{zh:'按师傅规则填的值，引用的规则不在规则表里',
    en:'A value filled by a chef rule cites a rule that is not in the rule list',
    uk:'Значення, заповнене за правилом шефа, посилається на правило, якого немає в списку правил'},
  ruleKind:{zh:'按师傅规则填的值引用错了规则：用量要引用每份用量规则，净料率要引用净料率规则，每个多少克要引用每个多少克规则',
    en:'A value filled by a chef rule cites the wrong kind of rule: an amount needs a per-serving rule, a yield a yield rule, grams per piece a grams-per-piece rule',
    uk:'Значення, заповнене за правилом шефа, посилається на правило іншого типу: кількість — на правило на порцію, вихід — на правило виходу, грами на штуку — на правило грамів на штуку'},
  ruleUnit:{zh:'按每份用量规则填的用量，单位要和规则一样',
    en:'An amount filled by a per-serving rule must use the rule\'s unit',
    uk:'Кількість, заповнена за правилом на порцію, має бути в тих самих одиницях, що й правило'},
} satisfies Record<string,Words>;

type ChefRule={id:string;kind:RuleReference['kind'];unit?:string};
/** The chef rules at the head being written on, read like data/techniques.json (missing file: no rules yet). */
async function readChefRules(gh:GitHubClient,head:string):Promise<Map<string,ChefRule>>{
  const file=await gh.getFile('data/chef-rules.json',head);
  let rules:ChefRule[];
  try{rules=file?JSON.parse(file.text):[];}catch{throw fail('invalid_source',{message:RULES_UNREADABLE});}
  if(!validateEntity('chef-rules',rules).valid||new Set(rules.map(rule=>rule.id)).size!==rules.length)throw fail('invalid_source',{message:RULES_UNREADABLE});
  return new Map(rules.map(rule=>[rule.id,rule]));
}

/** ADR-0012 §3: a rule value cites a rule that exists, of its kind, and (per serving) in the qty's unit. Same check as build-data. */
function checkRuleReferences(rules:Map<string,ChefRule>,references:RuleReference[]){
  const problems=references.flatMap(reference=>{
    const rule=rules.get(reference.ruleId);
    const words=!rule?WORDS.ruleMissing:rule.kind!==reference.kind?WORDS.ruleKind
      :reference.unit!==undefined&&rule.unit!==reference.unit?WORDS.ruleUnit:undefined;
    return words?[{path:reference.path,words,detail:reference.ruleId}]:[];
  });
  if(problems.length)throw refusal('rule_reference_invalid',problems);
}

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
  try{materialized=await recipeMaterializationFiles(detail,dependencies,pinnedImages);}catch{throw fail('invalid_source',{message:INCOMPLETE});}
  for(const file of materialized.files){
    const kind=file.path.startsWith('data/dishes/')?'dish':'ingredient';
    const checked=validateEntity(kind,JSON.parse(file.text));
    if(!checked.valid)throw validationFailure(checked.errors);
  }
  const gh=githubClient(ctx);
  const outcome=await commitImmutableFiles(gh,[...materialized.files.map(file=>({path:file.path,bytes:new TextEncoder().encode(file.text)})),...materialized.imageFiles],
    {subject:`data(knowledge): 固定菜谱 ${materialized.dishRef}`,role:ctx.role,endpoint:ctx.endpointConcrete,techniques:materialized.techniques,beforeWrite:async head=>{
      // Recheck just before the write: a recipe archived in the meantime is never frozen.
      if((await readRecipeState(ctx,recipeId,version)).current.archived)throw fail('review_required',{message:ARCHIVED});
      // ADR-0012 §1: a legacy revision whose servings say 1 has qty taken from the original recipe, with no source.
      // Like the archive check, this only stops new writes: a version written before still replays as unchanged.
      if(materialized.unsourcedQuantities.length)throw refusal('quantity_source_required',materialized.unsourcedQuantities.map(path=>({path,words:WORDS.unsourced})));
      // ADR-0012 §11: an item goes on the menu with its kind and place. One with no kind waits for #184 (never
      // guessed as "other"); one pointing at a step or row this version lacks has no place to go.
      if(materialized.misplacedUnknowns.length)throw refusal('recipe_unknowns_misplaced',materialized.misplacedUnknowns.map(path=>({path,words:WORDS.misplaced})));
      if(materialized.unclassifiedUnknowns.length)throw refusal('recipe_unknowns_unclassified',materialized.unclassifiedUnknowns.map(path=>({path,words:WORDS.unclassified})));
      if(materialized.ruleReferences.length)checkRuleReferences(await readChefRules(gh,head),materialized.ruleReferences);
    }});
  return {ok:true,dishRef:materialized.dishRef,recipeId,recipeVersion:detail.version,
    ...(candidateId?{candidateId}:{}),snapshotHash:materialized.snapshotHash,unresolvedCount:materialized.unresolvedCount,
    commit:outcome.commit,unchanged:outcome.unchanged};
}

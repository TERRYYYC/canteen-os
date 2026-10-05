/** Convert one human-approved SQLite revision into version-addressed Git inputs. */
import { stableSerialize, sortKeysDeep } from './serialize.js';
import { completeKnowledgeImageRights, type Technique } from '@canteenos/core';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
type Localized = { zh?: string; en?: string; uk?: string };
type Amount = { kind: 'unknown' | 'to_taste' | 'text' | 'exact'; raw?: string; value?: string; unit?: string };
type IngredientRow = { id: string; ingredientId?: string; name: Localized; amount: Amount; rawText?: string; role?: string; preparation?: Localized; kitchenPrep?: { techniqueId?: string; timing?: string; size?: string; note?: Localized } };
type StepRow = { id: string; text: Localized; techniqueId?: string };
type Candidate = { id: string; status: string; recipeId?: string; recipeVersion?: number; reviewer?: string;
  review?: { reviewer: string; note: string; approvedCandidateVersion: number }; unresolved?: string[] };
type AssetRef = { assetId: string; role: string; stepId?: string };
type Media = { assetId: string; kind: string; status: string; url: string; role?: string; sha256?: string; rights?: { license: string; author?: string; sourceUrl?: string } };
type Detail = { id: string; version: number; recipe: { title: Localized; description?: Localized; baseServings?: number; ingredients: IngredientRow[]; steps: StepRow[]; sources?: unknown[]; assets?: AssetRef[] }; media?: Media[]; sourceRecords?: unknown[] };
export type PinnedImage = { assetId: string; bytes: Uint8Array; ext: 'png'|'jpg'|'webp'; rights: { license: string; author?: string; sourceUrl?: string } };

export type KitchenApproval = {
  approvalVersion:'1';status:'approved';recipeId:string;recipeVersion:number;
  origin:{kind:'favorite'|'manual'|'legacy';candidateId?:string;originalRecipeVersion:number};
  approvalHash:string;recipeSnapshotHash:string;originalSnapshotHash:string;
  dependencies:{ingredients:{id:string;version:number;ingredient:Record<string,unknown>;createdAt:string}[];
    techniques:{id:string;hash:string;technique:{kind:'cut'|'heat'|'pretreat';name:Localized;note?:Localized}}[]};
  unresolved:string[];reviewer:string;note:string;actor:string;createdAt:string;
};
async function contractHash(value:unknown):Promise<string>{
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(sortKeysDeep(value))));
  return [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('');
}

/** Only a durable KB decision authorizes a new frozen recipe revision. */
export async function recipeMaterializationFiles(approval:KitchenApproval,detail:Detail,pinnedImages:PinnedImage[]=[]){
  if(!approval||approval.approvalVersion!=='1'||approval.status!=='approved'||approval.recipeId!==detail.id||approval.recipeVersion!==detail.version||
    !approval.origin||!['favorite','manual','legacy'].includes(approval.origin.kind)||!Number.isSafeInteger(approval.origin.originalRecipeVersion)||approval.origin.originalRecipeVersion<1||
    !approval.dependencies||!Array.isArray(approval.dependencies.ingredients)||!Array.isArray(approval.dependencies.techniques)||
    !/^[0-9a-f]{64}$/.test(approval.approvalHash)||!approval.reviewer)throw new Error('persistent_approval_required');
  const {approvalHash,...value}=approval;
  if(await contractHash(value)!==approvalHash||await contractHash(detail)!==approval.recipeSnapshotHash)throw new Error('approval_snapshot_mismatch');
  const ingredientIds=[...new Set(detail.recipe.ingredients.map(row=>row.ingredientId).filter(Boolean))].sort();
  if(JSON.stringify(ingredientIds)!==JSON.stringify(approval.dependencies.ingredients.map(x=>x.id).sort()))throw new Error('ingredient_dependency_mismatch');
  const techniqueIds=[...new Set([...detail.recipe.ingredients.map(row=>row.kitchenPrep?.techniqueId),...detail.recipe.steps.map(row=>row.techniqueId)].filter(Boolean))].sort();
  if(JSON.stringify(techniqueIds)!==JSON.stringify(approval.dependencies.techniques.map(x=>x.id).sort()))throw new Error('technique_dependency_mismatch');
  const techniques:Technique[]=[];
  for(const dep of approval.dependencies.techniques){
    if(!UUID.test(dep.id)||await contractHash(dep.technique)!==dep.hash)throw new Error('technique_snapshot_mismatch');
    techniques.push({id:`kbt-${dep.id.replaceAll('-','')}-${dep.hash.slice(0,12)}`,...dep.technique});
  }
  const result=await materializationFiles({id:approval.origin.candidateId??detail.id,status:'approved',recipeId:detail.id,recipeVersion:detail.version,reviewer:approval.reviewer,unresolved:approval.unresolved},detail,pinnedImages);
  const dishFile=result.files.find(file=>file.path===`data/dishes/${result.dishRef}.json`)!;
  const dish=JSON.parse(dishFile.text);
  const files:{path:string;text:string}[]=[];
  dish.components=detail.recipe.ingredients.map((row,index)=>{
    const dep=row.ingredientId?approval.dependencies.ingredients.find(x=>x.id===row.ingredientId):undefined;
    if(dep&&(!UUID.test(dep.id)||!Number.isSafeInteger(dep.version)||dep.version<1||!dep.ingredient?.name))throw new Error('ingredient_dependency_invalid');
    const ref=dep?`kbi-${dep.id.replaceAll('-','')}-v${dep.version}`:`kbi-${detail.id.replaceAll('-','')}-v${detail.version}-${index+1}`;
    const {aliases:_aliases,...spec}=dep?.ingredient??{name:row.name,trackStock:false,...(['main','seasoning'].includes(row.role??'')?{role:row.role}:{})};
    files.push({path:`data/ingredients/${ref}.json`,text:stableSerialize({schemaVersion:'3',...spec,...(dep?{canonicalIngredientId:dep.id,canonicalIngredientVersion:dep.version}:{})})});
    const component={...dish.components[index],ingredientRef:ref,...(dep?{canonicalIngredientId:dep.id,canonicalIngredientVersion:dep.version}:{}),...(['main','seasoning'].includes(row.role??'')?{role:row.role}:{})};
    if(row.kitchenPrep){const {techniqueId,...prep}=row.kitchenPrep;component.prep={...prep,...(techniqueId?{techniqueRef:techniques.find(t=>t.id.startsWith(`kbt-${techniqueId.replaceAll('-','')}-`))!.id}:{})};}
    return component;
  });
  detail.recipe.steps.forEach((row,index)=>{if(row.techniqueId)dish.steps[index].techniqueRef=techniques.find(t=>t.id.startsWith(`kbt-${row.techniqueId!.replaceAll('-','')}-`))!.id;});
  result.snapshotHash=await sha256({approvalHash,detail});
  dish.provenance={...dish.provenance,snapshotHash:result.snapshotHash,approvalHash,originKind:approval.origin.kind,originalRecipeVersion:approval.origin.originalRecipeVersion};
  if(!approval.origin.candidateId)delete dish.provenance.candidateId;
  files.push({path:dishFile.path,text:stableSerialize(dish)});
  return {...result,files,techniques};
}

const UNIT: Record<string, { unit: string; baseUnit: 'g' | 'ml' | 'pcs'; factor?: number }> = {
  g:{unit:'g',baseUnit:'g'}, 克:{unit:'g',baseUnit:'g'}, kg:{unit:'kg',baseUnit:'g'}, 千克:{unit:'kg',baseUnit:'g'}, 公斤:{unit:'kg',baseUnit:'g'},
  斤:{unit:'g',baseUnit:'g',factor:500},
  ml:{unit:'ml',baseUnit:'ml'}, 毫升:{unit:'ml',baseUnit:'ml'}, l:{unit:'l',baseUnit:'ml'}, 升:{unit:'l',baseUnit:'ml'},
  pcs:{unit:'pcs',baseUnit:'pcs'}, 个:{unit:'pcs',baseUnit:'pcs'}, 只:{unit:'pcs',baseUnit:'pcs'}, 片:{unit:'pcs',baseUnit:'pcs'},
};

async function sha256(value: unknown): Promise<string> {
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(stableSerialize(value)));
  return [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('');
}

function quantity(amount: Amount): { qty?: { value?: number; unit: string }; baseUnit:'g'|'ml'|'pcs'; originalAmount:string } {
  const originalAmount=amount.raw?.trim() || (amount.kind==='unknown'?'未录用量':amount.kind==='exact'?`${amount.value} ${amount.unit}`:'');
  if(amount.kind==='to_taste')return {qty:{unit:'to-taste'},baseUnit:'g',originalAmount:originalAmount||'适量'};
  if(amount.kind==='exact'&&typeof amount.unit==='string'&&typeof amount.value==='string'){
    const mapped=UNIT[amount.unit.trim().toLowerCase()] ?? UNIT[amount.unit.trim()];
    const value=Number(amount.value);
    const converted=value*(mapped?.factor??1);
    if(mapped&&Number.isFinite(converted)&&converted>0&&converted<=Number.MAX_SAFE_INTEGER)return {qty:{value:converted,unit:mapped.unit},baseUnit:mapped.baseUnit,originalAmount};
  }
  // A missing qty cannot enter arithmetic. The required baseUnit is only a
  // schema placeholder until a human records a usable unit and purchase spec.
  return {baseUnit:'g',originalAmount};
}

export async function materializationFiles(candidate: Candidate, detail: Detail, pinnedImages: PinnedImage[]=[]): Promise<{dishRef:string;snapshotHash:string;files:{path:string;text:string}[];imageFiles:{path:string;bytes:Uint8Array}[];unresolvedCount:number}> {
  if(candidate.status!=='approved'||!UUID.test(candidate.id)||!UUID.test(candidate.recipeId??'')||
    !Number.isSafeInteger(candidate.recipeVersion)||candidate.recipeVersion!<=0||
    candidate.recipeId!==detail.id||candidate.recipeVersion!==detail.version||
    !Array.isArray(detail.recipe?.ingredients)||!detail.recipe.ingredients.length||detail.recipe.ingredients.length>200||
    !Array.isArray(detail.recipe.steps)||!detail.recipe.title||!candidate.reviewer)throw new Error('approved_revision_required');
  const sourceGaps=candidate.unresolved??[];
  if(!Array.isArray(sourceGaps)||sourceGaps.length>100||sourceGaps.some(value=>typeof value!=='string'||!value.trim()||value.length>2000))throw new Error('invalid_source_gaps');
  const dishRef=`kb-${detail.id.replaceAll('-','')}-v${detail.version}`;
  const snapshotHash=await sha256({candidate:{id:candidate.id,recipeId:candidate.recipeId,recipeVersion:candidate.recipeVersion,reviewer:candidate.reviewer,review:candidate.review,unresolved:sourceGaps},detail});
  let unresolvedCount=sourceGaps.length;
  const files:{path:string;text:string}[]=[];
  const imageFiles:{path:string;bytes:Uint8Array}[]=[];
  const imageMap=new Map(pinnedImages.map(image=>[image.assetId,image]));
  function imageRef(assetId:string,name:string){
    const image=imageMap.get(assetId);if(!image)return undefined;
    const fileName=`${name}.${image.ext}`;
    imageFiles.push({path:`data/dishes/${dishRef}/images/${fileName}`,bytes:image.bytes});
    return {src:`${dishRef}/images/${fileName}`,...image.rights};
  }
  const components=detail.recipe.ingredients.map((row,index)=>{
    if(!UUID.test(row.id)||!row.name||!row.amount)throw new Error('invalid_recipe_ingredient');
    const ref=`kbi-${detail.id.replaceAll('-','')}-v${detail.version}-${index+1}`;
    const converted=quantity(row.amount);
    if(!converted.qty)unresolvedCount++;
    const ingredient={schemaVersion:'2',name:row.name,baseUnit:converted.baseUnit,
      ...(['main','seasoning'].includes(row.role??'')?{role:row.role}:{}),trackStock:false};
    files.push({path:`data/ingredients/${ref}.json`,text:stableSerialize(ingredient)});
    return {ingredientRef:ref,...(converted.qty?{qty:converted.qty}:{}),originalAmount:converted.originalAmount,
      ...(row.preparation?{originalPreparation:row.preparation}:{}),knowledgeIngredientId:row.id};
  });
  const steps=detail.recipe.steps.map((row,index)=>{
    if(!UUID.test(row.id)||!row.text)throw new Error('invalid_recipe_step');
    const stepAsset=detail.recipe.assets?.find(asset=>asset.role==='step'&&asset.stepId===row.id);
    return {text:row.text,...(stepAsset?{image:imageRef(stepAsset.assetId,`step-${index+1}`)}:{})};
  }).map(row=>row.image?row:{text:row.text});
  const cover=detail.recipe.assets?.find(asset=>asset.role==='cover');
  const coverImage=cover?imageRef(cover.assetId,'cover'):undefined;
  const coverMedia=cover?detail.media?.find(media=>media.assetId===cover.assetId):undefined;
  const coverState=coverImage?undefined:!cover?'needs-image':
    !coverMedia?'unavailable':
    /^https?:\/\//i.test(coverMedia.url)?'external-unpinned':
    !completeKnowledgeImageRights(coverMedia.rights)?'rights-pending':'unavailable';
  const dish={schemaVersion:'3',name:detail.recipe.title,...(detail.recipe.description?{description:detail.recipe.description}:{}),
    ...(coverImage?{image:coverImage}:{}),...(detail.recipe.baseServings?{baseServings:detail.recipe.baseServings}:{}),components,steps,
    provenance:{source:'knowledge',recipeId:detail.id,recipeVersion:detail.version,candidateId:candidate.id,snapshotHash,
      // Git inputs and the buyer-facing catalog are public projections. Raw
      // source records, quotes, media URLs and review notes stay in private KB.
      ...(sourceGaps.length?{sourceGapCount:sourceGaps.length}:{}),
      ...(coverState?{coverState}:{})},status:'active'};
  files.push({path:`data/dishes/${dishRef}.json`,text:stableSerialize(dish)});
  return {dishRef,snapshotHash,files,imageFiles,unresolvedCount};
}

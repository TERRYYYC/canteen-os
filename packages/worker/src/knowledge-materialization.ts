/** Convert one saved SQLite revision into version-addressed Git inputs (ADR-0011: no review or approval in the app). */
import { stableSerialize, sortKeysDeep } from './serialize.js';
import { completeKnowledgeImageRights, type Technique } from '@canteenos/core';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
type Localized = { zh?: string; en?: string; uk?: string };
type Amount = { kind: 'unknown' | 'to_taste' | 'text' | 'exact'; raw?: string; value?: string; unit?: string };
type IngredientRow = { id: string; ingredientId?: string; name: Localized; amount: Amount; rawText?: string; role?: string; preparation?: Localized; kitchenPrep?: { techniqueId?: string; timing?: string; size?: string; note?: Localized } };
type StepRow = { id: string; text: Localized; techniqueId?: string };
type AssetRef = { assetId: string; role: string; stepId?: string };
type Media = { assetId: string; kind: string; status: string; url: string; role?: string; sha256?: string; rights?: { license: string; author?: string; sourceUrl?: string } };
export type Detail = { id: string; version: number; recipe: { title: Localized; description?: Localized; baseServings?: number; ingredients: IngredientRow[]; steps: StepRow[]; sources?: unknown[]; assets?: AssetRef[] }; media?: Media[]; sourceRecords?: unknown[] };
export type PinnedImage = { assetId: string; bytes: Uint8Array; ext: 'png'|'jpg'|'webp'; rights: { license: string; author?: string; sourceUrl?: string } };
export type KnowledgeTechnique = { kind:'cut'|'heat'|'pretreat'; name:Localized; note?:Localized };
/** The standard ingredient and technique revisions a recipe revision uses, as read from the KB when it is frozen. */
export type PinnedDependencies = {
  ingredients:{id:string;version:number;ingredient:Record<string,unknown>;createdAt?:string}[];
  techniques:{id:string;hash:string;technique:KnowledgeTechnique}[];
};
const NO_DEPENDENCIES:PinnedDependencies={ingredients:[],techniques:[]};

/** The same content hash the KB used for technique snapshots, so frozen technique ids stay comparable. */
export async function contractHash(value:unknown):Promise<string>{
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(sortKeysDeep(value))));
  return [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('');
}

/** Standard ingredients and techniques this revision refers to: exactly what has to be pinned with it. */
export function dependencyIds(detail:Detail):{ingredientIds:string[];techniqueIds:string[]}{
  const rows=Array.isArray(detail?.recipe?.ingredients)?detail.recipe.ingredients:[],steps=Array.isArray(detail?.recipe?.steps)?detail.recipe.steps:[];
  const ingredientIds=[...new Set(rows.map(row=>row.ingredientId).filter((id):id is string=>Boolean(id)))].sort();
  const techniqueIds=[...new Set([...rows.map(row=>row.kitchenPrep?.techniqueId),...steps.map(row=>row.techniqueId)].filter((id):id is string=>Boolean(id)))].sort();
  return {ingredientIds,techniqueIds};
}

/**
 * Freeze one saved KB recipe revision as it is (ADR-0011). Source review and kitchen approval happen outside the app,
 * so nothing here asks for them. The revision is pinned together with the ingredient and technique revisions it uses;
 * the snapshot hash covers both, so the same inputs always give the same files and a changed input never reuses them.
 * The files depend on nothing else (not on the route or candidate that asked), so every route freezes a revision identically.
 */
export async function recipeMaterializationFiles(detail:Detail,dependencies:PinnedDependencies=NO_DEPENDENCIES,pinnedImages:PinnedImage[]=[]){
  if(!dependencies||!Array.isArray(dependencies.ingredients)||!Array.isArray(dependencies.techniques))throw new Error('invalid_dependencies');
  const {ingredientIds,techniqueIds}=dependencyIds(detail);
  if(JSON.stringify(ingredientIds)!==JSON.stringify(dependencies.ingredients.map(x=>x.id).sort()))throw new Error('ingredient_dependency_mismatch');
  if(JSON.stringify(techniqueIds)!==JSON.stringify(dependencies.techniques.map(x=>x.id).sort()))throw new Error('technique_dependency_mismatch');
  const techniques:Technique[]=[];
  for(const dep of dependencies.techniques){
    if(!UUID.test(dep.id)||await contractHash(dep.technique)!==dep.hash)throw new Error('technique_snapshot_mismatch');
    techniques.push({id:`kbt-${dep.id.replaceAll('-','')}-${dep.hash.slice(0,12)}`,...dep.technique});
  }
  const result=await dishFiles(detail,pinnedImages);
  const dishFile=result.files.find(file=>file.path===`data/dishes/${result.dishRef}.json`)!;
  const dish=JSON.parse(dishFile.text);
  const files:{path:string;text:string}[]=[];
  dish.components=detail.recipe.ingredients.map((row,index)=>{
    const dep=row.ingredientId?dependencies.ingredients.find(x=>x.id===row.ingredientId):undefined;
    if(dep&&(!UUID.test(dep.id)||!Number.isSafeInteger(dep.version)||dep.version<1||!dep.ingredient?.name))throw new Error('ingredient_dependency_invalid');
    const ref=dep?`kbi-${dep.id.replaceAll('-','')}-v${dep.version}`:`kbi-${detail.id.replaceAll('-','')}-v${detail.version}-${index+1}`;
    const {aliases:_aliases,...spec}=dep?.ingredient??{name:row.name,trackStock:false,...(['main','seasoning'].includes(row.role??'')?{role:row.role}:{})};
    files.push({path:`data/ingredients/${ref}.json`,text:stableSerialize({schemaVersion:'3',...spec,...(dep?{canonicalIngredientId:dep.id,canonicalIngredientVersion:dep.version}:{})})});
    const component={...dish.components[index],ingredientRef:ref,...(dep?{canonicalIngredientId:dep.id,canonicalIngredientVersion:dep.version}:{}),...(['main','seasoning'].includes(row.role??'')?{role:row.role}:{})};
    if(row.kitchenPrep){const {techniqueId,...prep}=row.kitchenPrep;component.prep={...prep,...(techniqueId?{techniqueRef:techniques.find(t=>t.id.startsWith(`kbt-${techniqueId.replaceAll('-','')}-`))!.id}:{})};}
    return component;
  });
  detail.recipe.steps.forEach((row,index)=>{if(row.techniqueId)dish.steps[index].techniqueRef=techniques.find(t=>t.id.startsWith(`kbt-${row.techniqueId!.replaceAll('-','')}-`))!.id;});
  result.snapshotHash=await sha256({dependencies,detail});
  dish.provenance={...dish.provenance,snapshotHash:result.snapshotHash};
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

/** The dish and per-row ingredient files of one revision; recipeMaterializationFiles pins its dependencies on top. */
async function dishFiles(detail: Detail, pinnedImages: PinnedImage[]=[]): Promise<{dishRef:string;snapshotHash:string;files:{path:string;text:string}[];imageFiles:{path:string;bytes:Uint8Array}[];unresolvedCount:number}> {
  if(!UUID.test(detail?.id??'')||!Number.isSafeInteger(detail?.version)||detail.version<=0||
    !Array.isArray(detail.recipe?.ingredients)||!detail.recipe.ingredients.length||detail.recipe.ingredients.length>200||
    !Array.isArray(detail.recipe.steps)||!detail.recipe.title)throw new Error('saved_revision_required');
  const dishRef=`kb-${detail.id.replaceAll('-','')}-v${detail.version}`;
  const snapshotHash=await sha256({detail});
  // Amounts that cannot enter arithmetic (spoons, free text); they stay as the recorded words. Not a review count.
  let unresolvedCount=0;
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
    provenance:{source:'knowledge',recipeId:detail.id,recipeVersion:detail.version,snapshotHash,
      // Git inputs and the buyer-facing catalog are public projections. Raw
      // source records, quotes and media URLs stay in private KB.
      ...(coverState?{coverState}:{})},status:'active'};
  files.push({path:`data/dishes/${dishRef}.json`,text:stableSerialize(dish)});
  return {dishRef,snapshotHash,files,imageFiles,unresolvedCount};
}

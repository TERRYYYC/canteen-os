/** Convert one saved SQLite revision into version-addressed Git inputs (ADR-0011: no review or approval in the app). */
import { stableSerialize, sortKeysDeep } from './serialize.js';
import { completeKnowledgeImageRights, type Technique } from '@canteenos/core';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
type Localized = { zh?: string; en?: string; uk?: string };
type Amount = { kind: 'unknown' | 'to_taste' | 'text' | 'exact'; raw?: string; value?: string; unit?: string };
/** KB format 3 numbers are decimal strings (#182). */
type DecimalQuantity = { value?: string; unit: string };
/** KB format 3 source: who measured or specified it is a real name there, and stays there. */
type KnowledgeSource = { kind: string; by?: string; date?: string; ruleId?: string };
/**
 * A legacy row (format 1/2) has one amount. A format 3 row (ADR-0012 §1) keeps the original recipe
 * (originalAmount, originalQty: display only) apart from the canteen amount (qty + qtySource).
 */
type IngredientRow = { id: string; ingredientId?: string; name: Localized; amount?: Amount;
  originalAmount?: string; originalQty?: DecimalQuantity; qty?: DecimalQuantity; qtySource?: KnowledgeSource;
  rawText?: string; role?: string; preparation?: Localized;
  kitchenPrep?: { techniqueId?: string; timing?: string; size?: string; note?: Localized; leadTime?: DecimalQuantity } };
type StepRow = { id: string; text: Localized; techniqueId?: string };
type AssetRef = { assetId: string; role: string; stepId?: string };
type Media = { assetId: string; kind: string; status: string; url: string; role?: string; sha256?: string; rights?: { license: string; author?: string; sourceUrl?: string } };
export type Detail = { id: string; version: number; recipe: { title: Localized; description?: Localized; recipeFormatVersion?: string; baseServings?: number; ingredients: IngredientRow[]; steps: StepRow[]; sources?: unknown[]; assets?: AssetRef[]; unknowns?: unknown[] }; media?: Media[]; sourceRecords?: unknown[] };
/** A value filled by a chef rule, as data/chef-rules.json must confirm it before the first write (ADR-0012 §3). */
export type RuleReference = { ruleId: string; kind: 'per-serving' | 'yield' | 'pcs-to-gram'; unit?: string; path: string };
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

/** A KB "not said in the video" item (#182 K3). `kind` is absent until it is sorted (#184); `text` is the quote. */
type KnowledgeUnknown = { kind?: unknown; action?: unknown; stepId?: unknown; ingredientRowId?: unknown; text?: unknown };
/** The same item as published: kind and position only (dish-v3 RecipeUnknown). */
type PublishedUnknown = { kind: string; action?: string; stepIndex?: number; componentIndex?: number };
const UNKNOWN_KINDS=new Set(['prep-ahead','amount','net-or-gross','cut-size','identity','heat','duration','doneness','other']);
const PREP_AHEAD_ACTIONS=new Set(['marinate','soak','brine','rest','cool','other']);

/** Two prep-ahead items at one place that name different actions: which place, which actions, and the first item that differs. */
export type ConflictingUnknowns = { path: string; place: 'step' | 'component' | 'dish'; actions: string[] };

/**
 * ADR-0012 §11: each item keeps its kind and becomes a position (step / ingredient row id → index from 0, none for
 * the whole dish). The quote stays in the KB (ADR-0010). One place, one kind: one item (D3 §2.2); the action only
 * adds to prep-ahead. Items at one place with one kind and the same action become one. With different actions they
 * cannot become one without dropping a thing to do ahead, so the place is listed for the pre-write check, as are
 * items not sorted yet or pointing at a step or row this revision lacks. No items (no key, or an empty list,
 * #182 K5) means no field at all.
 */
function recipeUnknowns(detail:Detail):{unknowns:PublishedUnknown[];unclassified:string[];misplaced:string[];conflicting:ConflictingUnknowns[]}{
  const items=detail.recipe.unknowns,unknowns:PublishedUnknown[]=[],unclassified:string[]=[],misplaced:string[]=[];
  const conflicts=new Map<string,ConflictingUnknowns>(),actionAt=new Map<string,string|undefined>();
  if(items===undefined)return {unknowns,unclassified,misplaced,conflicting:[]};
  if(!Array.isArray(items))throw new Error('invalid_unknowns');
  const steps=detail.recipe.steps.map(step=>step.id),rows=detail.recipe.ingredients.map(row=>row.id);
  items.forEach((raw,index)=>{
    if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('invalid_unknowns');
    const {kind,action,stepId,ingredientRowId}=raw as KnowledgeUnknown,path=`/recipe/unknowns/${index}`;
    if([stepId,ingredientRowId].some(id=>id!==undefined&&typeof id!=='string'))throw new Error('invalid_unknowns');
    if(kind!==undefined&&(!UNKNOWN_KINDS.has(kind as string)||(kind==='prep-ahead')!==(action!==undefined)))throw new Error('invalid_unknowns');
    if(action!==undefined&&!PREP_AHEAD_ACTIONS.has(action as string))throw new Error('invalid_unknowns');
    const stepIndex=stepId===undefined?undefined:steps.indexOf(stepId as string);
    const componentIndex=ingredientRowId===undefined?undefined:rows.indexOf(ingredientRowId as string);
    if(stepIndex===-1||componentIndex===-1){misplaced.push(path);return;}
    if(kind===undefined){unclassified.push(path);return;}
    const key=JSON.stringify([kind,stepIndex,componentIndex]);
    if(actionAt.has(key)){
      const first=actionAt.get(key);
      if(action!==first){
        const conflict=conflicts.get(key)??{path,place:componentIndex!==undefined?'component':stepIndex!==undefined?'step':'dish',actions:[first as string]};
        if(!conflict.actions.includes(action as string))conflict.actions.push(action as string);
        conflicts.set(key,conflict);
      }
      return;
    }
    actionAt.set(key,action as string|undefined);
    unknowns.push({kind:kind as string,...(action===undefined?{}:{action:action as string}),
      ...(stepIndex===undefined?{}:{stepIndex}),...(componentIndex===undefined?{}:{componentIndex})});
  });
  return {unknowns,unclassified,misplaced,conflicting:[...conflicts.values()]};
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
  const ruleReferences:RuleReference[]=[];
  const rule=(source:ValueSource|undefined,kind:RuleReference['kind'],path:string,unit?:string)=>{
    if(source?.kind==='rule')ruleReferences.push({ruleId:source.ruleId,kind,path,...(unit===undefined?{}:{unit})});
  };
  dish.components=detail.recipe.ingredients.map((row,index)=>{
    const dep=row.ingredientId?dependencies.ingredients.find(x=>x.id===row.ingredientId):undefined;
    if(dep&&(!UUID.test(dep.id)||!Number.isSafeInteger(dep.version)||dep.version<1||!dep.ingredient?.name))throw new Error('ingredient_dependency_invalid');
    const ref=dep?`kbi-${dep.id.replaceAll('-','')}-v${dep.version}`:`kbi-${detail.id.replaceAll('-','')}-v${detail.version}-${index+1}`;
    const {aliases:_aliases,yieldSource,pcsToGramSource,...spec}=(dep?.ingredient??{name:row.name,trackStock:false,...(['main','seasoning'].includes(row.role??'')?{role:row.role}:{})}) as Record<string,unknown>;
    // ADR-0012 §3: the standard ingredient's yield and grams per piece carry their source, published without the name.
    const sources={...(yieldSource===undefined?{}:{yieldSource:publicSource(yieldSource)}),...(pcsToGramSource===undefined?{}:{pcsToGramSource:publicSource(pcsToGramSource)})};
    rule(sources.yieldSource,'yield',`/recipe/ingredients/${index}/ingredientId`);
    rule(sources.pcsToGramSource,'pcs-to-gram',`/recipe/ingredients/${index}/ingredientId`);
    files.push({path:`data/ingredients/${ref}.json`,text:stableSerialize({schemaVersion:'3',...spec,...sources,...(dep?{canonicalIngredientId:dep.id,canonicalIngredientVersion:dep.version}:{})})});
    const component={...dish.components[index],ingredientRef:ref,...(dep?{canonicalIngredientId:dep.id,canonicalIngredientVersion:dep.version}:{}),...(['main','seasoning'].includes(row.role??'')?{role:row.role}:{})};
    rule(component.qtySource,'per-serving',`/recipe/ingredients/${index}/qtySource`,component.qty?.unit);
    if(row.kitchenPrep){const {techniqueId,leadTime,...prep}=row.kitchenPrep;component.prep={...prep,...(leadTime===undefined?{}:{leadTime:leadTimeOf(leadTime)}),...(techniqueId?{techniqueRef:techniques.find(t=>t.id.startsWith(`kbt-${techniqueId.replaceAll('-','')}-`))!.id}:{})};}
    return component;
  });
  detail.recipe.steps.forEach((row,index)=>{if(row.techniqueId)dish.steps[index].techniqueRef=techniques.find(t=>t.id.startsWith(`kbt-${row.techniqueId!.replaceAll('-','')}-`))!.id;});
  const {unknowns,unclassified:unclassifiedUnknowns,misplaced:misplacedUnknowns,conflicting:conflictingUnknowns}=recipeUnknowns(detail);
  if(unknowns.length)dish.unknowns=unknowns;
  result.snapshotHash=await sha256({dependencies,detail});
  dish.provenance={...dish.provenance,snapshotHash:result.snapshotHash};
  files.push({path:dishFile.path,text:stableSerialize(dish)});
  // ADR-0012 §1: a dish counted per serving computes every numeric qty, so each needs a source. A legacy
  // revision's qty came from the original recipe and has none. Checked before the first write only (see the endpoint).
  const unsourcedQuantities:string[]=dish.baseServings===1?dish.components.flatMap((component:{qty?:{value?:number};qtySource?:unknown},index:number)=>
    component.qty?.value!==undefined&&!component.qtySource?[`/recipe/ingredients/${index}`]:[]):[];
  // ADR-0012 §11: items not sorted into a kind yet (#184), pointing at a step or row this revision does not have, or
  // naming two things to do ahead at one place, cannot be written as signed; like the check above, the endpoint
  // refuses them before the first write only.
  return {...result,files,techniques,ruleReferences,unsourcedQuantities,unclassifiedUnknowns,misplacedUnknowns,conflictingUnknowns};
}

const UNIT: Record<string, { unit: string; baseUnit: 'g' | 'ml' | 'pcs'; factor?: number }> = {
  g:{unit:'g',baseUnit:'g'}, 克:{unit:'g',baseUnit:'g'}, kg:{unit:'kg',baseUnit:'g'}, 千克:{unit:'kg',baseUnit:'g'}, 公斤:{unit:'kg',baseUnit:'g'},
  斤:{unit:'g',baseUnit:'g',factor:500},
  ml:{unit:'ml',baseUnit:'ml'}, 毫升:{unit:'ml',baseUnit:'ml'}, l:{unit:'l',baseUnit:'ml'}, 升:{unit:'l',baseUnit:'ml'},
  pcs:{unit:'pcs',baseUnit:'pcs'}, 个:{unit:'pcs',baseUnit:'pcs'}, 只:{unit:'pcs',baseUnit:'pcs'}, 片:{unit:'pcs',baseUnit:'pcs'},
};

/** ADR-0012 §3 as published (sign-off A2): measured and specified values say only "chef" and the date; a rule value only its id. */
type ValueSource = { kind: 'measured' | 'specified'; by: 'chef'; date: string } | { kind: 'rule'; ruleId: string };
function publicSource(source: unknown): ValueSource {
  const value=(source??{}) as KnowledgeSource;
  if(value.kind==='rule'&&typeof value.ruleId==='string')return {kind:'rule',ruleId:value.ruleId};
  if((value.kind==='measured'||value.kind==='specified')&&typeof value.by==='string'&&value.by.trim()&&typeof value.date==='string')return {kind:value.kind,by:'chef',date:value.date};
  throw new Error('invalid_value_source');
}

const DECIMAL=/^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/;
function decimal(value: unknown): number {
  const number=typeof value==='string'&&DECIMAL.test(value)?Number(value):NaN;
  if(!Number.isFinite(number)||number<=0||number>Number.MAX_SAFE_INTEGER)throw new Error('invalid_decimal');
  return number;
}
function decimalQuantity(quantity: DecimalQuantity): { value?: number; unit: string } {
  if(!quantity||typeof quantity!=='object'||typeof quantity.unit!=='string')throw new Error('invalid_quantity');
  return quantity.value===undefined?{unit:quantity.unit}:{value:decimal(quantity.value),unit:quantity.unit};
}
function leadTimeOf(leadTime: DecimalQuantity): { value: number; unit: string } {
  if(!leadTime||typeof leadTime!=='object'||typeof leadTime.unit!=='string')throw new Error('invalid_lead_time');
  return {value:decimal(leadTime.value),unit:leadTime.unit};
}

/**
 * ADR-0012 §1 for a format 3 row: qty is the canteen amount and comes only from the row's own qty, with its source.
 * The original recipe (even an unambiguous "500 g") goes only to originalAmount / originalQty, for display.
 */
function canteenAmounts(row: IngredientRow): { qty?: { value?: number; unit: string }; fields: Record<string, unknown> } {
  if(row.amount!==undefined||(row.qty===undefined)!==(row.qtySource===undefined))throw new Error('invalid_recipe_ingredient');
  if(row.originalAmount!==undefined&&typeof row.originalAmount!=='string')throw new Error('invalid_recipe_ingredient');
  const qty=row.qty===undefined?undefined:decimalQuantity(row.qty);
  const originalAmount=row.originalAmount?.trim();
  return {qty,fields:{...(qty?{qty,qtySource:publicSource(row.qtySource)}:{}),...(originalAmount?{originalAmount}:{}),
    ...(row.originalQty===undefined?{}:{originalQty:decimalQuantity(row.originalQty)})}};
}

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
  const format3=detail.recipe.recipeFormatVersion==='3';
  const components=detail.recipe.ingredients.map((row,index)=>{
    if(!UUID.test(row.id)||!row.name||(!format3&&!row.amount))throw new Error('invalid_recipe_ingredient');
    const ref=`kbi-${detail.id.replaceAll('-','')}-v${detail.version}-${index+1}`;
    if(format3){
      const canteen=canteenAmounts(row);
      if(!canteen.qty)unresolvedCount++;
      return {ingredientRef:ref,...canteen.fields,...(row.preparation?{originalPreparation:row.preparation}:{}),knowledgeIngredientId:row.id};
    }
    // Legacy revisions are frozen exactly as before, so a replay of an already written version stays unchanged.
    const converted=quantity(row.amount!);
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

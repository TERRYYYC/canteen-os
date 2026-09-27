/** Convert one human-approved SQLite revision into version-addressed Git inputs. */
import { stableSerialize } from './serialize.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
type Localized = { zh?: string; en?: string; uk?: string };
type Amount = { kind: 'unknown' | 'to_taste' | 'text' | 'exact'; raw?: string; value?: string; unit?: string };
type IngredientRow = { id: string; name: Localized; amount: Amount; rawText?: string; role?: string; preparation?: Localized };
type StepRow = { id: string; text: Localized };
type Candidate = { id: string; status: string; recipeId?: string; recipeVersion?: number; reviewer?: string;
  review?: { reviewer: string; note: string; approvedCandidateVersion: number } };
type AssetRef = { assetId: string; role: string; stepId?: string };
type Media = { assetId: string; kind: string; status: string; url: string; role?: string; sha256?: string; rights?: { license: string; author?: string; sourceUrl?: string } };
type Detail = { id: string; version: number; recipe: { title: Localized; description?: Localized; baseServings?: number; ingredients: IngredientRow[]; steps: StepRow[]; sources?: unknown[]; assets?: AssetRef[] }; media?: Media[]; sourceRecords?: unknown[] };
export type PinnedImage = { assetId: string; bytes: Uint8Array; ext: 'png'|'jpg'|'webp'; rights: { license: string; author?: string; sourceUrl?: string } };

const UNIT: Record<string, { unit: string; baseUnit: 'g' | 'ml' | 'pcs' }> = {
  g:{unit:'g',baseUnit:'g'}, 克:{unit:'g',baseUnit:'g'}, kg:{unit:'kg',baseUnit:'g'}, 千克:{unit:'kg',baseUnit:'g'}, 公斤:{unit:'kg',baseUnit:'g'},
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
    if(mapped&&Number.isFinite(value)&&value>0&&value<=Number.MAX_SAFE_INTEGER)return {qty:{value,unit:mapped.unit},baseUnit:mapped.baseUnit,originalAmount};
  }
  // A missing qty cannot enter arithmetic. The required baseUnit is only a
  // schema placeholder until a human records a usable unit and purchase spec.
  return {baseUnit:'g',originalAmount};
}

export async function materializationFiles(candidate: Candidate, detail: Detail, pinnedImages: PinnedImage[]=[]): Promise<{dishRef:string;snapshotHash:string;files:{path:string;text:string}[];imageFiles:{path:string;bytes:Uint8Array}[];unresolvedCount:number}> {
  if(candidate.status!=='approved'||!UUID.test(candidate.id)||!UUID.test(candidate.recipeId??'')||
    !Number.isSafeInteger(candidate.recipeVersion)||candidate.recipeVersion!<=0||
    candidate.recipeId!==detail.id||candidate.recipeVersion!==detail.version||
    !Array.isArray(detail.recipe?.ingredients)||!detail.recipe.ingredients.length||detail.recipe.ingredients.length>100||
    !Array.isArray(detail.recipe.steps)||!detail.recipe.title||!candidate.reviewer)throw new Error('approved_revision_required');
  const dishRef=`kb-${detail.id.replaceAll('-','')}-v${detail.version}`;
  const snapshotHash=await sha256({candidate:{id:candidate.id,recipeId:candidate.recipeId,recipeVersion:candidate.recipeVersion,reviewer:candidate.reviewer,review:candidate.review},detail});
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
      originalText:row.rawText??'',...(row.preparation?{originalPreparation:row.preparation}:{}),knowledgeIngredientId:row.id};
  });
  const steps=detail.recipe.steps.map((row,index)=>{
    if(!UUID.test(row.id)||!row.text)throw new Error('invalid_recipe_step');
    const stepAsset=detail.recipe.assets?.find(asset=>asset.role==='step'&&asset.stepId===row.id);
    return {text:row.text,...(stepAsset?{image:imageRef(stepAsset.assetId,`step-${index+1}`)}:{})};
  }).map(row=>row.image?row:{text:row.text});
  const cover=detail.recipe.assets?.find(asset=>asset.role==='cover');
  const coverImage=cover?imageRef(cover.assetId,'cover'):undefined;
  const sourceUrl=(detail.sourceRecords as {url?:unknown}[]|undefined)?.find(source=>typeof source?.url==='string')?.url;
  const sourceRecords=detail.sourceRecords??[];
  const sourceRefs=detail.recipe.sources??[];
  const evidenceMedia=detail.media?.map(item=>{
    const selected=detail.recipe.assets?.find(ref=>ref.assetId===item.assetId&&ref.role==='cover')
      ??detail.recipe.assets?.find(ref=>ref.assetId===item.assetId);
    return selected?{...item,selectedRole:selected.role}:item;
  })??[];
  const dish={schemaVersion:'3',name:detail.recipe.title,...(detail.recipe.description?{description:detail.recipe.description}:{}),
    ...(coverImage?{image:coverImage}:{}),...(detail.recipe.baseServings?{baseServings:detail.recipe.baseServings}:{}),components,steps,
    provenance:{source:'knowledge',recipeId:detail.id,recipeVersion:detail.version,candidateId:candidate.id,snapshotHash,
      ...(candidate.review?{review:candidate.review}:{}),
      ...(typeof sourceUrl==='string'?{sourceUrl}:{}),
      ...(sourceRecords.length||sourceRefs.length||evidenceMedia.length?{evidence:{sourceRecords,sourceRefs,media:evidenceMedia}}:{})},status:'active'};
  files.push({path:`data/dishes/${dishRef}.json`,text:stableSerialize(dish)});
  return {dishRef,snapshotHash,files,imageFiles,unresolvedCount};
}

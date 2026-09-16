/** Static publication reader. It consumes approved build output; it never regenerates domain results. */
import type {BuildManifest, ImageRef, MenuSheet, PrepSheet, PurchaseSheet, ShoppingEstimate, TeamMealsProjection} from '@canteenos/core';

export class DataError extends Error {
  constructor(readonly url:string, readonly status:number|null, cause?:unknown) {
    super(status===null?`fetch failed: ${url}`:`HTTP ${status}: ${url}`,{cause});this.name='DataError';
  }
}
export type PublishedStage='manifest'|'projection'|'asset';
export class PublishedDataError extends DataError {
  constructor(readonly code:string, readonly stage:PublishedStage, url:string, status:number|null=null, readonly sourceRevision?:string, cause?:unknown) {
    super(url,status,cause);this.name='PublishedDataError';
  }
}
export interface TeamPublishedManifest {builtAt:string;commit:string;plans:string[];target:'team-meals';projectionVersion:'1'}
const publicationBrand: unique symbol = Symbol('publication');
export interface LegacyPublication {readonly [publicationBrand]:true;readonly kind:'legacy';readonly manifest:BuildManifest}
export interface TeamPublication {readonly [publicationBrand]:true;readonly kind:'team-meals';readonly manifest:TeamPublishedManifest}
export type Publication=LegacyPublication|TeamPublication;
export interface PublishedIssue {kind:'warning';code:string;[key:string]:unknown}
const planBrand: unique symbol = Symbol('published-plan');
export interface PublishedTeamPlan {
  readonly [planBrand]:true;readonly kind:'published';readonly target:'team-meals';readonly planId:string;
  readonly sourceRevision:string;readonly builtAt:string;readonly projection:TeamMealsProjection;
  readonly estimates:ShoppingEstimate;readonly issues:readonly PublishedIssue[];
}
export type PublishedAsset={kind:'available';sourceRevision:string;source:ImageRef;bytes:Blob}
  |{kind:'external-unpinned';sourceRevision:string;source:ImageRef}|{kind:'not-recorded'};
interface AssetBinding {ownerPath:string;jsonPointer:string;source:ImageRef;techniqueRef?:string;status:'available'|'external-unpinned';path?:string}
type ObjectMap=Record<string,any>;
const record=(v:unknown):v is ObjectMap=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const id=(v:unknown):v is string=>typeof v==='string'&&/^[a-z][a-z0-9-]*$/.test(v);
const sha=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{40}$/.test(v);
const own=(o:object,key:string)=>Object.hasOwn(o,key);
const frozen=<T>(v:T):T=>{if(v&&typeof v==='object'){Object.values(v).forEach(frozen);Object.freeze(v);}return v;};
const equal=(a:unknown,b:unknown):boolean=>{
  const canonical=(v:any):any=>Array.isArray(v)?v.map(canonical):record(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
  return JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
};
export const publicationKey=(p:Pick<Publication,'kind'|'manifest'>):string=>JSON.stringify([p.kind,p.manifest]);

/** A's path is a literal POSIX file path, not a URL. Never decode %, ?, # or rewrite Unicode. */
function repoImagePath(owner:string,src:string):string|null {
  if(!src||src.startsWith('/')||/[\\\0]/.test(src)||/^[a-z][a-z0-9+.-]*:/i.test(src))return null;
  const parts=(src.startsWith('data/')?src:owner.slice(0,owner.lastIndexOf('/')+1)+src).split('/');
  const stack:string[]=[];
  for(const part of parts){if(!part||part==='.')continue;if(part==='..'){if(!stack.length)return null;stack.pop();}else stack.push(part);}
  const path=stack.join('/');return path.startsWith('data/')&&/\.(png|jpe?g|webp)$/i.test(path)?path:null;
}
function imageSlots(p:TeamMealsProjection):Map<string,ImageRef> {
  const slots=new Map<string,ImageRef>();
  const add=(path:string,image:ImageRef|undefined)=>{if(image!==undefined)slots.set(path,image);};
  for(const [key,i] of Object.entries(p.ingredients))add(`/ingredients/${key}/image`,i.image);
  for(const [key,d] of Object.entries(p.dishes)) {
    add(`/dishes/${key}/image`,d.image);
    d.components?.forEach((c,i)=>add(`/dishes/${key}/components/${i}/prep/image`,c.prep?.image));
    d.steps?.forEach((s,i)=>add(`/dishes/${key}/steps/${i}/image`,s.image));
  }
  p.techniques.forEach((t,i)=>add(`/techniques/${i}/image`,t.image));return slots;
}
function validImagePointer(p:TeamMealsProjection,pointer:string):boolean {
  let m=/^\/(ingredients|dishes)\/([a-z][a-z0-9-]*)\/image$/.exec(pointer);
  if(m)return own(m[1]==='ingredients'?p.ingredients:p.dishes,m[2]!);
  m=/^\/dishes\/([a-z][a-z0-9-]*)\/(components|steps)\/(0|[1-9][0-9]*)\/(prep\/)?image$/.exec(pointer);
  if(m){const d=own(p.dishes,m[1]!)?p.dishes[m[1]!]:undefined;return !!d&&(m[2]==='components'?m[4]==='prep/'&&Number(m[3])<(d.components?.length??0):!m[4]&&Number(m[3])<(d.steps?.length??0));}
  m=/^\/techniques\/(0|[1-9][0-9]*)\/image$/.exec(pointer);return !!m&&Number(m[1])<p.techniques.length;
}

let readerSequence=0;
export function createPublishedData(options:{baseUrl:string;fetch?:typeof fetch;timeoutMs?:number}) {
  const base=new URL(options.baseUrl);if(!base.pathname.endsWith('/')||base.search||base.hash)throw new Error('Expected a data root URL ending in /');
  const network=options.fetch??fetch, reader=++readerSequence;
  let generation=0, refreshTag='', probeSequence=0;
  let cache=new Map<string,Promise<any>>();
  let publications=new WeakMap<Publication,number>(),plans=new WeakMap<PublishedTeamPlan,{generation:number;bindings:Map<string,AssetBinding>}>();
  const url=(path:string,tag=refreshTag)=>{const u=new URL(path.split('/').map(encodeURIComponent).join('/'),base);if(tag)u.searchParams.set('__publication',tag);return u.href;};
  function error(code:string,stage:PublishedStage,path:string,status:number|null=null,revision?:string,cause?:unknown):never {throw new PublishedDataError(code,stage,url(path),status,revision,cause);}
  async function withRevision<T>(promise:Promise<T>,revision:string):Promise<T> {
    try{return await promise;}catch(e){
      if(e instanceof PublishedDataError&&!e.sourceRevision)throw new PublishedDataError(e.code,e.stage,e.url,e.status,revision,e);
      throw e;
    }
  }
  function guard(g:number,stage:PublishedStage,path:string){if(g!==generation)error('publication_changed',stage,path);}
  function clearCache(){generation++;refreshTag=`${Date.now()}-${reader}-${generation}`;cache=new Map();publications=new WeakMap();plans=new WeakMap();}
  async function response<T>(path:string,stage:PublishedStage,consume:(response:Response)=>Promise<T>,tag=refreshTag):Promise<T> {
    const address=url(path,tag),controller=new AbortController();
    let timer:ReturnType<typeof setTimeout>|undefined;
    const deadline=new Promise<never>((_resolve,reject)=>{
      timer=setTimeout(()=>{controller.abort();reject(new PublishedDataError(stage==='asset'?'asset_unavailable':'unavailable',stage,address));},options.timeoutMs??15000);
    });
    try {
      return await Promise.race([deadline,(async()=>{
        const res=await network(address,{method:'GET',credentials:'omit',cache:'no-store',redirect:'error',signal:controller.signal});
        if(res.redirected||!res.ok)throw new PublishedDataError(stage==='asset'?'asset_unavailable':'unavailable',stage,address,res.status);
        return consume(res);
      })()]);
    } catch(e){if(e instanceof PublishedDataError)throw e;throw new PublishedDataError(stage==='asset'?'asset_unavailable':'unavailable',stage,address,null,undefined,e);}
    finally {clearTimeout(timer);}
  }
  async function json(path:string,stage:PublishedStage,tag=refreshTag):Promise<unknown> {
    return response(path,stage,async res=>{
      const invalid=(cause?:unknown):never=>{throw new PublishedDataError('invalid_data',stage,url(path,tag),res.status,undefined,cause);};
      if(!/^application\/json(?:;|$)/i.test(res.headers.get('Content-Type')??''))invalid();
      try{return await res.json();}catch(e){invalid(e);}
    },tag);
  }
  async function cached<T>(path:string,stage:PublishedStage,run:()=>Promise<T>):Promise<T> {
    const g=generation,key=`${g}:${path}`;let promise=cache.get(key) as Promise<T>|undefined;
    if(!promise){promise=run();cache.set(key,promise);}
    try {const result=await promise;guard(g,stage,path);return result;}
    catch(e){guard(g,stage,path);if(cache.get(key)===promise)cache.delete(key);throw e;}
  }
  function manifest(value:unknown):Publication {
    const fail=(code='invalid_data'):never=>error(code,'manifest','build.json');
    if(!record(value)||typeof value.builtAt!=='string'||Number.isNaN(Date.parse(value.builtAt))||typeof value.commit!=='string'||!value.commit||
      !Array.isArray(value.plans)||!value.plans.every(id)||new Set(value.plans).size!==value.plans.length)return fail();
    if(own(value,'target')) {
      if(value.target!=='team-meals')return fail('unsupported_target');
      if(value.projectionVersion!=='1')return fail('unsupported_version');
      if(!sha(value.commit))return fail();
      return frozen({[publicationBrand]:true,kind:'team-meals',manifest:value}) as TeamPublication;
    }
    if(own(value,'projectionVersion'))return fail('unsupported_version');
    if(value.readiness!==undefined&&!record(value.readiness))return fail();
    return frozen({[publicationBrand]:true,kind:'legacy',manifest:value}) as LegacyPublication;
  }
  async function loadPublication(opts:{fresh?:boolean}={}):Promise<Publication> {
    if(opts.fresh)clearCache();const g=generation;
    return cached('build.json','manifest',async()=>{const p=manifest(await json('build.json','manifest'));guard(g,'manifest','build.json');publications.set(p,g);return p;});
  }
  async function probePublication():Promise<Publication> {return manifest(await json('build.json','manifest',`probe-${Date.now()}-${reader}-${++probeSequence}`));}
  function requirePublication(p:Publication){if(!p||publications.get(p)!==generation)error('publication_changed','manifest','build.json');}
  function validateProjection(raw:unknown,publication:TeamPublication,planId:string,tag:string):{view:PublishedTeamPlan;bindings:Map<string,AssetBinding>} {
    const path=`team-meals/${planId}.json`,fail=(code='invalid_data'):never=>{throw new PublishedDataError(code,'projection',url(path,tag),null,publication.manifest.commit);};
    if(!record(raw))return fail();if(raw.sourceRevision!==publication.manifest.commit)return fail('revision_mismatch');
    if(raw.projectionVersion!=='1')return fail('unsupported_version');
    if(!record(raw.menuPlans)||Object.keys(raw.menuPlans).length!==1||!own(raw.menuPlans,planId)||!record(raw.menuPlans[planId])||!Array.isArray(raw.menuPlans[planId].meals)||
      !record(raw.dishes)||!record(raw.ingredients)||!Array.isArray(raw.techniques)||!Array.isArray(raw.selection)||!record(raw.collection)||!record(raw.estimates)||!Array.isArray(raw.assets)||!Array.isArray(raw.issues))return fail();
    if(!raw.selection.every((s:any)=>record(s)&&s.menuPlanRef===planId&&typeof s.date==='string'&&['breakfast','lunch','dinner'].includes(s.mealType)))return fail();
    for(const [key,d] of Object.entries(raw.dishes))if(!id(key)||!record(d)||!record(d.name)||(d.components!==undefined&&(!Array.isArray(d.components)||!d.components.every((c:any)=>record(c)&&id(c.ingredientRef)&&(c.prep===undefined||record(c.prep)))))||(d.steps!==undefined&&(!Array.isArray(d.steps)||!d.steps.every(record))))return fail();
    for(const [key,i] of Object.entries(raw.ingredients))if(!id(key)||!record(i)||!record(i.name)||typeof i.baseUnit!=='string')return fail();
    if(!raw.techniques.every((t:any)=>record(t)&&id(t.id))||new Set(raw.techniques.map((t:any)=>t.id)).size!==raw.techniques.length)return fail();
    const {items,issues,coverage}=raw.collection;
    if(!Array.isArray(items)||!items.every((i:any)=>record(i)&&id(i.ingredientRef)&&Array.isArray(i.sources)&&i.sources.every(record))||new Set(items.map((i:any)=>i.ingredientRef)).size!==items.length||!Array.isArray(issues)||!issues.every((i:any)=>record(i)&&typeof i.code==='string')||!record(coverage)||!['complete','incomplete'].includes(coverage.enumeration)||!['resolved','unresolved'].includes(coverage.references)||coverage.recipeCompleteness!=='unverified')return fail();
    const estimates=raw.estimates;
    if(!['complete','incomplete','not-applicable'].includes(estimates.budgetStatus)||!Array.isArray(estimates.items)||!estimates.items.every((i:any)=>record(i)&&id(i.ingredientRef)&&Array.isArray(i.reasons)&&i.reasons.every((r:any)=>record(r)&&typeof r.code==='string')&&(i.status==='complete'?Array.isArray(i.lines):i.status==='unavailable'&&!own(i,'lines')))||
      !equal(estimates.items.map((i:any)=>i.ingredientRef).sort(),items.map((i:any)=>i.ingredientRef).sort())||!raw.issues.every((i:any)=>record(i)&&i.kind==='warning'&&typeof i.code==='string'))return fail();
    const {assets,estimates:_estimates,issues:_issues,...projection}=raw;
    const bindings=new Map<string,AssetBinding>(),seen=new Set<string>(),slots=imageSlots(projection as TeamMealsProjection);
    for(const asset of assets) {
      const bad=():never=>fail('asset_binding_invalid');
      if(!record(asset)||typeof asset.ownerPath!=='string'||typeof asset.jsonPointer!=='string'||!record(asset.source)||typeof asset.source.src!=='string'||typeof asset.source.license!=='string')return bad();
      const key=JSON.stringify([asset.ownerPath,asset.jsonPointer]);if(seen.has(key))return bad();seen.add(key);
      let pointer:string;
      if(asset.ownerPath==='data/techniques.json') {
        if(!id(asset.techniqueRef)||!/^\/(0|[1-9][0-9]*)\/image$/.test(asset.jsonPointer))return bad();
        const index=raw.techniques.findIndex((t:any)=>t.id===asset.techniqueRef);if(index<0)return bad();pointer=`/techniques/${index}/image`;
      } else {
        const m=/^data\/(ingredients|dishes)\/([a-z][a-z0-9-]*)\.json$/.exec(asset.ownerPath);
        if(!m||own(asset,'techniqueRef'))return bad();pointer=`/${m[1]}/${m[2]}${asset.jsonPointer}`;
      }
      if(!validImagePointer(projection as TeamMealsProjection,pointer)||!slots.has(pointer)||!equal(slots.get(pointer),asset.source)||bindings.has(pointer))return bad();
      if(asset.status==='available') {
        const repo=repoImagePath(asset.ownerPath,asset.source.src);
        if(!repo||asset.path!==`assets/${raw.sourceRevision}/${repo}`)return bad();
      } else if(asset.status!=='external-unpinned'||own(asset,'path')||!/^https?:\/\//.test(asset.source.src))return bad();
      bindings.set(pointer,frozen(asset as AssetBinding));
    }
    if(bindings.size!==slots.size)return fail('asset_binding_invalid');
    const view:PublishedTeamPlan=frozen({[planBrand]:true,kind:'published',target:'team-meals',planId,sourceRevision:raw.sourceRevision,builtAt:publication.manifest.builtAt,
      projection:projection as TeamMealsProjection,estimates:estimates as ShoppingEstimate,issues:raw.issues});
    return {view,bindings};
  }
  async function loadPublishedTeamPlan(publication:TeamPublication,planId:string):Promise<PublishedTeamPlan> {
    requirePublication(publication);if(publication.kind!=='team-meals')error('unsupported_target','projection','build.json');
    if(!id(planId)||!publication.manifest.plans.includes(planId))error('plan_not_published','projection','build.json');
    const g=generation,path=`team-meals/${planId}.json`,tag=refreshTag,pinned=publication.manifest.commit;
    return withRevision(cached(path,'projection',async()=>{
      let raw:unknown,requestTag=tag;
      try {raw=await json(path,'projection',requestTag);}
      catch(e) {
        guard(g,'projection',path);
        if(!tag||!(e instanceof PublishedDataError)||e.code!=='unavailable'||e.status!==null)throw e;
        // A fresh manifest already fixed the revision. The installed ordinary URL
        // may supply it offline, but must pass the same complete validation below.
        requestTag='';raw=await json(path,'projection',requestTag);
      }
      let validated:ReturnType<typeof validateProjection>;
      try {validated=validateProjection(raw,publication,planId,requestTag);}
      catch(e) {
        if(requestTag===pinned||!(e instanceof PublishedDataError)||e.code!=='revision_mismatch')throw e;
        // A precached projection predates this manifest. Pinning the query to the commit
        // leaves the precache list so the network answers, and keeps one stable URL per
        // publication so HTTP and runtime caches still hit. Retried at most once.
        let repinned:unknown;
        try {repinned=await json(path,'projection',pinned);}
        catch(retry) {
          guard(g,'projection',path);
          // Offline keeps the mismatch that sent us here; the retry must not replace it.
          if(retry instanceof PublishedDataError&&retry.code==='unavailable'&&retry.status===null)throw e;
          throw retry;
        }
        guard(g,'projection',path);
        validated=validateProjection(repinned,publication,planId,pinned);
      }
      const {view,bindings}=validated;
      guard(g,'projection',path);plans.set(view,{generation:g,bindings});return view;
    }),publication.manifest.commit);
  }
  async function loadPublishedAsset(view:PublishedTeamPlan,pointer:string):Promise<PublishedAsset> {
    const entry=plans.get(view);if(!entry||entry.generation!==generation)error('publication_changed','asset','');
    if(!validImagePointer(view.projection,pointer))error('asset_binding_invalid','asset','');
    const binding=entry.bindings.get(pointer);if(!binding)return {kind:'not-recorded'};
    if(binding.status==='external-unpinned')return {kind:'external-unpinned',sourceRevision:view.sourceRevision,source:binding.source};
    const path=binding.path!;
    const bytes=await withRevision(cached(path,'asset',()=>response(path,'asset',async res=>{
      const mime=/^image\/(png|jpeg|webp)(?:;|$)/i.exec(res.headers.get('Content-Type')??'')?.[1]?.toLowerCase();
      if(!mime)error('asset_unavailable','asset',path,res.status,view.sourceRevision);
      const blob=await res.blob();if(!blob.size||blob.size>200*1024)error('asset_unavailable','asset',path,res.status,view.sourceRevision);
      // Transport sniffing only; A's approved build owns full raster decoding.
      const head=new Uint8Array(await blob.slice(0,12).arrayBuffer());
      const magic=mime==='png'?[137,80,78,71,13,10,26,10].every((n,i)=>head[i]===n):mime==='jpeg'?head[0]===255&&head[1]===216&&head[2]===255:
        [82,73,70,70].every((n,i)=>head[i]===n)&&[87,69,66,80].every((n,i)=>head[i+8]===n);
      if(!magic)error('asset_unavailable','asset',path,res.status,view.sourceRevision);
      return blob;
    },'')),view.sourceRevision);
    return {kind:'available',sourceRevision:view.sourceRevision,source:binding.source,bytes};
  }
  async function loadBuild():Promise<BuildManifest>{const p=await loadPublication();if(p.kind!=='legacy')error('unsupported_target','manifest','build.json');return structuredClone(p.manifest);}
  async function legacy<T>(kind:string,planId:string):Promise<T>{const p=await loadPublication();if(p.kind!=='legacy')error('unsupported_target','projection',`${kind}/${planId}.json`);if(!id(planId)||!p.manifest.plans.includes(planId))error('plan_not_published','projection','build.json');return structuredClone(await cached(`${kind}/${planId}.json`,'projection',()=>json(`${kind}/${planId}.json`,'projection'))) as T;}
  return {loadPublication,probePublication,loadPublishedTeamPlan,loadPublishedAsset,clearCache,loadBuild,
    loadMenu:(id:string)=>legacy<MenuSheet>('menu',id),loadPrep:(id:string)=>legacy<PrepSheet>('prep',id),loadPurchase:(id:string)=>legacy<PurchaseSheet>('purchase',id),generation:()=>generation};
}

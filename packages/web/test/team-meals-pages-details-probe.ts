import { renderTeamDetails, safeLink, quantityText } from '../src/pages/team-details.ts';
import { renderCandidates, shoppingCopy } from '../src/pages/purchase-list.ts';
import { projectTeamMeals, estimateShoppingList, createShoppingList } from '../../core/src/index.ts';
const A='a'.repeat(40),B='b'.repeat(40),at='2026-09-11T12:00:00Z';
const image={src:'https://do-not-fetch.example/image.jpg',license:'CC BY 4.0',author:'Review Author',sourceUrl:'javascript:alert(1)'};
const names={zh:'盐',en:'Salt',uk:'Сіль'},ingredients={salt:{schemaVersion:'2',name:names,role:'seasoning',baseUnit:'g',trackStock:true,onHand:99,image,purchase:{supplier:'Supplier',packSize:10,packUnit:'g',minPacks:1,lastPrice:{amount:2,currency:'CNY'}}}};
const dishes={soup:{schemaVersion:'3',name:{zh:'原汤',en:'Original Soup',uk:'Початковий суп'},baseServings:2,status:'active',image,components:[{ingredientRef:'salt',qty:{value:5,unit:'g'},prep:{techniqueRef:'mix',size:'2 cm',timing:'morning',note:{zh:'原备注'},image},confidence:{value:.7,source:'video'}},{ingredientRef:'missing'},{ingredientRef:'salt',qty:{unit:'to-taste'}}],steps:[{text:{zh:'混合',en:'Mix it',uk:'Змішайте'},techniqueRef:'mix',image,clip:{videoUrl:'https://example.org/watch',start:2,end:4}}],provenance:{source:'video',videoUrl:'https://example.org/recipe'}}};
const menuPlans={week:{schemaVersion:'3',meals:[{date:'2026-09-14',mealType:'lunch',dishRef:'soup',plannedServings:10}]}},techniques=[{id:'mix',kind:'pretreat',name:{zh:'拌',en:'Mix',uk:'Змішати'},note:{en:'Technique note'},image}];
const inputs={menuPlans,dishes,ingredients,techniques},basis={sourceRevision:A,selection:[{menuPlanRef:'week',date:'2026-09-14',mealType:'lunch'}]},projection=projectTeamMeals(inputs,basis),estimate=estimateShoppingList(inputs,basis.selection,at),list=createShoppingList('shop',basis,inputs);
const out=document.querySelector('#result')!,view=document.querySelector('#view')!,checks:{name:string,pass:boolean,detail?:string}[]=[];
const report=(name:string,pass:boolean,detail?:string)=>checks.push({name,pass,detail});
const calls:any[]=[];let created:string[]=[],revoked:string[]=[];
const originalCreate=URL.createObjectURL.bind(URL),originalRevoke=URL.revokeObjectURL.bind(URL);
URL.createObjectURL=(blob)=>{const url=originalCreate(blob);created.push(url);return url;};URL.revokeObjectURL=(url)=>{revoked.push(url);originalRevoke(url);};
const blob=new Blob(['<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="green"/></svg>'],{type:'image/svg+xml'});
const flush=async()=>{await new Promise(r=>setTimeout(r,15));};
function host(){const el=document.createElement('section');view.append(el);return el;}
const href=(kind:string,id:string)=>`#/${kind}/${encodeURIComponent(id)}`;
async function run(){
 checks.length=0;calls.length=0;created=[];revoked=[];view.replaceChildren();
 const el=host();const dispose=renderTeamDetails(el,{lang:'en',projection,kind:'ingredient',id:'salt',href,asset:async(owner,pointer)=>{calls.push({owner,pointer});return{bytes:blob,sourceRevision:A}}});await flush();
 report('all three ingredient names',Object.values(names).every(n=>el.textContent!.includes(n)));
 report('onHand is explicitly separate from list decision',el.textContent!.includes('Recorded on hand (separate from this list)')&&el.textContent!.includes('99 g'));
 report('role and purchase metadata',el.textContent!.includes('Seasoning')&&el.textContent!.includes('Supplier')&&el.textContent!.includes('10 g'));
 report('unsafe original image/source URLs are not assigned to DOM href/src',![...el.querySelectorAll('a,img')].some(n=>['src','href'].some(k=>(n.getAttribute(k)||'').startsWith('javascript:')||(n.getAttribute(k)||'').includes('do-not-fetch'))));
 report('same-version asset owner/pointer',calls[0]?.owner==='data/ingredients/salt.json'&&calls[0]?.pointer==='/image');
 const sourceLinks=[...el.querySelectorAll('a[href="#/dish/soup"]')];report('all recorded ingredient occurrences have source links',sourceLinks.length===2,String(sourceLinks.length));dispose();report('explicit dispose revokes image URLs',created.every(u=>revoked.includes(u)));
 const missing=host();renderTeamDetails(missing,{lang:'en',projection,kind:'ingredient',id:'missing',href,asset:async()=>{throw new Error('unexpected')}});report('unresolved ingredient keeps its known recipe navigation',!!missing.querySelector('a[href="#/dish/soup"]'),missing.textContent!);
 let finish:any;const late=host();renderTeamDetails(late,{lang:'en',projection,kind:'dish',id:'soup',href,asset:()=>new Promise(r=>finish=r)});const before=created.length;late.remove();await flush();finish({bytes:blob,sourceRevision:A});await flush();report('late asset after detach creates no URL',created.length===before);
 const wrong=host();const beforeWrong=created.length;renderTeamDetails(wrong,{lang:'en',projection,kind:'ingredient',id:'salt',href,asset:async()=>({bytes:blob,sourceRevision:B})});await flush();report('wrong revision rejects image without current fallback',created.length===beforeWrong&&!wrong.querySelector('img')&&wrong.textContent!.includes('Same-version image unavailable'));
 const recipe=host();renderTeamDetails(recipe,{lang:'en',projection,kind:'dish',id:'soup',href,techniqueAsset:async techniqueRef=>{calls.push({techniqueRef});return{bytes:blob,sourceRevision:A}},asset:async(owner,pointer)=>{calls.push({owner,pointer});return{bytes:blob,sourceRevision:A}}});await flush();report('every component and step is rendered',recipe.querySelectorAll('[data-component-index]').length===3&&recipe.querySelectorAll('[data-step-index]').length===1);report('raw quantity + base servings are shown without scaling',recipe.textContent!.includes('5 g')&&recipe.textContent!.includes('Original recipe quantities, unscaled')&&recipe.textContent!.includes('Original recipe servings2'));report('unknown and to-taste remain distinct',recipe.textContent!.includes('Quantity not recorded')&&recipe.textContent!.includes('To taste'));report('prep and step image provenance visible',recipe.textContent!.includes('CC BY 4.0')&&calls.some(c=>c.pointer==='/components/0/prep/image')&&calls.some(c=>c.pointer==='/steps/0/image'));report('clip and technique three names',recipe.textContent!.includes('2s–4s')&&['拌','Mix','Змішати'].every(n=>recipe.textContent!.includes(n)));
 report('technique image uses explicit reference resolver, not filtered array pointer',calls.filter(c=>c.techniqueRef==='mix').length===2);
 const candidates=renderCandidates({lang:'en',collection:projection.collection,estimate,ingredients,dishes,href});view.append(candidates);report('all candidates including unresolved and seasoning retained',candidates.querySelectorAll('[data-ingredient]').length===2);report('copy retains decisions and basis',shoppingCopy(list,projection,'en').includes(A)&&shoppingCopy(list,projection,'en').includes('Check'));
 out.textContent=JSON.stringify({summary:`${checks.filter(c=>c.pass).length}/${checks.length}`,checks,calls},null,2);
}
document.querySelector('#run')!.addEventListener('click',()=>void run());
(document.querySelector('#missing')as HTMLButtonElement).onclick=()=>{view.replaceChildren();renderTeamDetails(host(),{lang:'en',projection,kind:'ingredient',id:'missing',href,asset:async()=>({bytes:blob,sourceRevision:A})});};
(document.querySelector('#recipe')as HTMLButtonElement).onclick=()=>{view.replaceChildren();renderTeamDetails(host(),{lang:'en',projection,kind:'dish',id:'soup',href,asset:async()=>({bytes:blob,sourceRevision:A})});};

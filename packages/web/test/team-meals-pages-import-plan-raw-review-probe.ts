import '../src/tokens.css';import '../src/styles.css';
import {render as renderImport} from '../src/pages/admin/import.ts';import {createPlanRenderer} from '../src/pages/admin/plan.ts';import {createTeamMealsApi} from '../src/api/team-meals.ts';import {getDraftPlan,clearDraftPlan} from '../src/admin/store.ts';
const id='week-38',sha='a'.repeat(40),saved={schemaVersion:'3',meals:[{date:'2026-09-14',mealType:'lunch',dishRef:'soup',plannedServings:8}]};
const catalog={commit:sha,dishes:{soup:{schemaVersion:'3',name:{zh:'原汤',en:'Soup',uk:'Суп'},status:'active',components:[{ingredientRef:'salt'}]}},ingredients:{},techniques:[],suppliers:[],translations:{machine:0,human:0,stale:0}};
const app=document.querySelector('#app')!,out=document.querySelector('#result')!,checks:any[]=[],requests:any[]=[];
let api:any,planRenderer:any,lang='en',hold=false,release:any,pending=false;
const pause=()=>new Promise(r=>setTimeout(r,30));const ctx=()=>({lang,rest:id,route:'admin',planId:id,data:{},t:(x:string)=>x});
function connect(){api?.dispose();api=createTeamMealsApi('https://raw-counts-fixture.invalid',{mode:'mock',token:()=>'explicit-local-fixture',identity:()=>1,fetch:async(url,init)=>{const path=new URL(url).pathname;requests.push({method:init.method,path});if(init.method!=='GET')throw new Error('no remote writes');if(path==='/catalog')return Response.json(catalog);if(path===`/source/plan/${id}`){if(hold){pending=true;await new Promise(r=>release=r);pending=false;}return Response.json({content:saved,commit:sha,blobSha:'raw-counts'});}throw new Error('unexpected path');}});planRenderer=createPlanRenderer(api);}
async function paint(kind='import'){const el=document.createElement('section');app.replaceChildren(el);await(kind==='plan'?planRenderer:renderImport)(el,ctx(),id,api);}
async function reset(kind='import'){clearDraftPlan(id);lang='en';hold=false;pending=false;connect();await paint(kind);}
const $=(sel:string)=>app.querySelector(sel)as HTMLInputElement;function input(sel:string,value:string){const el=$(sel);el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}));}
function parse(text:string){input('#adm-import-text',text);$('.adm-import-parse').click();}
function check(name:string,pass:boolean,detail:any={}){checks.push({name,pass:!!pass,detail});out.textContent=JSON.stringify({checks,requests},null,2);}
async function run(){checks.length=0;requests.length=0;(document.querySelector('#run')as HTMLButtonElement).disabled=true;
try{
 for(const raw of ['2.0000000000000001','9007199254740993','9007199254740992','2.0000000000000001e1']){
  await reset();parse('周一午 原汤 8');input('.adm-import-servings',raw);
  check(`import rejects raw ${raw}`,$('.adm-import-servings').getAttribute('aria-invalid')==='true'&&$('.adm-import-submit').disabled,{value:$('.adm-import-servings').value});
  lang='uk';await paint();check(`import preserves invalid raw ${raw}`,$('.adm-import-servings').value===raw&&$('.adm-import-servings').getAttribute('aria-invalid')==='true',{value:$('.adm-import-servings').value});
  await reset('plan');input('[data-focus="servings-0"]',raw);
  check(`plan rejects raw ${raw}`,$('[data-focus="servings-0"]').getAttribute('aria-invalid')==='true',{value:$('[data-focus="servings-0"]').value});
  lang='uk';await paint('plan');check(`plan preserves invalid raw ${raw}`,$('[data-focus="servings-0"]').value===raw&&$('[data-focus="servings-0"]').getAttribute('aria-invalid')==='true');
 }
 for(const raw of ['1.5','','6']){await reset();parse('周一午 原汤 8');hold=true;$('.adm-import-submit').click();for(let n=0;!pending&&n<100;n++)await pause();if(!pending)throw new Error('Source not held');input('.adm-import-servings',raw);hold=false;release();await pause();check(`canceled import action follows current ${raw||'clear'}`,getDraftPlan(id)===null&&$('.adm-import-submit').disabled===(raw==='1.5')&&$('.adm-import-submit').getAttribute('aria-busy')===null,{disabled:$('.adm-import-submit').disabled,label:$('.adm-import-submit').textContent});}
 for(const text of ['周一午 原汤 2.5份','周一午 原汤 2.0000000000000001份','周一午 原汤 9007199254740993份']){await reset();parse(text);check(`core errors remain visible: ${text}`,!!app.querySelector('.adm-import-line-unparsed')&&app.textContent!.includes(text)&&$('.adm-import-submit').disabled&&app.textContent!.includes('份数'),{page:app.textContent});}
 check('all requests remain read-only',requests.every(x=>x.method==='GET'));
}catch(error){check('fixture completes',false,String(error));}finally{out.textContent=JSON.stringify({summary:`${checks.filter(x=>x.pass).length}/${checks.length}`,checks,requests},null,2);(document.querySelector('#run')as HTMLButtonElement).disabled=false;}}
document.querySelector('#run')!.addEventListener('click',()=>void run());

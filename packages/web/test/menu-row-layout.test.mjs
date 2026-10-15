import assert from 'node:assert/strict';
import {test,after} from 'node:test';
import {readFile,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {tmpdir} from 'node:os';
import {dirname,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {Element} from './team-meals-pages-unload-dom.mjs';

// #134: a dish name that wraps must push the "Ingredients & servings" summary down, never share its lines.
// CI has no browser, so this pins the CSS mechanism (postcss, as in the QR print test) and the row DOM it relies on.
const here=dirname(fileURLToPath(import.meta.url)),require=createRequire(import.meta.url),vr=createRequire(require.resolve('vite/package.json'));
const postcss=vr('postcss'),esbuild=await import(pathToFileURL(vr.resolve('esbuild')).href);
const sheets=await Promise.all(['menu.css','prep.css'].map(async name=>postcss.parse(await readFile(join(here,'../src/pages',name),'utf8'))));
const [menuCss]=sheets;
const ROW='[data-frozen-menu]>.menu-recipe-row.mlist',DESKTOP='(min-width:760px)';
const mediaOf=rule=>rule.parent?.type==='atrule'&&rule.parent.name==='media'?rule.parent.params:'';
/** Declarations for one exact selector in one media context; later rules win, as in the cascade. */
function declarations(selector,media=''){
 const out={};
 menuCss.walkRules(rule=>{if(mediaOf(rule)===media&&rule.selectors.includes(selector))rule.walkDecls(decl=>{out[decl.prop]=decl.value;});});
 return out;
}
const merged=(selector,media)=>media?{...declarations(selector),...declarations(selector,media)}:declarations(selector);
const px=value=>{const match=/^(-?\d+(?:\.\d+)?)px$/.exec(value??'');assert(match,`px value expected, got ${value}`);return Number(match[1]);};
const paddingLeft=decls=>decls['padding-left']!==undefined?px(decls['padding-left']):px((decls.padding??'').split(/\s+/)[3]??(decls.padding??'').split(/\s+/)[1]);

test('the record summary is never pinned at a fixed offset, so it always flows below the full name',()=>{
 const rules=[];
 for(const sheet of sheets)sheet.walkRules(rule=>{if(rule.selectors.some(selector=>/menu-row-record\s*>\s*summary\s*$|\.mlist\s*>\s*details\s*>\s*summary\s*$/.test(selector)))rules.push(rule);});
 assert(rules.length>=2,'menu and shared record summary rules are checked');
 for(const rule of rules)rule.walkDecls(decl=>{
  const where=`${mediaOf(rule)||'base'} ${rule.selector} ${decl.prop}:${decl.value}`;
  assert(!(decl.prop==='position'&&/absolute|fixed/.test(decl.value)),where);
  assert(!['top','bottom','inset','inset-block-start','inset-block-end'].includes(decl.prop),where);
 });
});

test('names wrap in full: no truncation or fixed row height on the name, its link or the row',()=>{
 for(const media of ['',DESKTOP]){
  const name=merged('.menu-recipe-row .n1',media),link=merged('.menu-recipe-row .mr',media),row=merged(ROW,media);
  for(const [what,decls] of [['name',name],['link',link],['row',row]]){
   assert.equal(decls.height,undefined,`${media||'base'} ${what}: fixed height`);assert.equal(decls['max-height'],undefined,`${media||'base'} ${what}: max-height`);
  }
  for(const prop of ['-webkit-line-clamp','text-overflow','white-space','overflow'])assert.equal(name[prop],undefined,`${media||'base'} name: ${prop}`);
 }
});

test('mobile and desktop rows reserve the thumbnail column and contain the thumbnail when the name is short',()=>{
 for(const media of ['',DESKTOP]){
  const thumb={...merged('.menu-thumbnail',media),...merged('.menu-recipe-row .menu-thumbnail',media)},row=merged(ROW,media),where=media||'base';
  assert(paddingLeft(row)>px(thumb.width),`${where}: the text column starts after the ${thumb.width} thumbnail`);
  if(thumb.position==='absolute'){
   assert.equal(row.position,'relative',`${where}: the row is the thumbnail's containing block`);
   assert.equal(merged('.menu-recipe-row .mr',media).position,'static',`${where}: the link does not become the containing block`);
   assert(px(thumb.top)+px(thumb.height)<=px(row['min-height']),`${where}: a short row still contains the thumbnail`);
  }
 }
});

// Presenter DOM the CSS above relies on: name, image and chevron in the link; the record summary right after it.
const dir=await mkdtemp(join(tmpdir(),'menu-row-layout-'));after(()=>rm(dir,{recursive:true,force:true}));
const bundle=await esbuild.build({stdin:{contents:"export {renderFrozenMenu} from './src/pages/menu';",resolveDir:join(here,'..')},bundle:true,write:false,format:'esm',platform:'browser',loader:{'.css':'empty'},define:{'import.meta.env.BASE_URL':'"/"'},logLevel:'silent'});
await writeFile(join(dir,'menu.mjs'),bundle.outputFiles[0].text);
const {renderFrozenMenu}=await import(pathToFileURL(join(dir,'menu.mjs')).href);
globalThis.document={body:new Element('body'),createElement:tag=>new Element(tag),createTextNode:text=>new Element('',text)};
globalThis.MutationObserver=class{observe(){}disconnect(){}};
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
const LONG={zh:'外婆家常番茄土豆炖牛腩配手工宽面与时令青菜（少辣版）',en:'Grandma’s home-style beef brisket braised with tomato and potato, hand-cut wide noodles and seasonal greens (mild)',uk:'Бабусина домашня тушкована яловича грудинка з томатами й картоплею, домашньою широкою локшиною та сезонною зеленню (неострий варіант)'};
const SHORT={zh:'番茄炒蛋',en:'Tomato and egg stir-fry',uk:'Смажені яйця з томатами'};
const source=freeze({mode:'real',projection:{projectionVersion:'1',sourceRevision:'d'.repeat(40),selection:[{menuPlanRef:'week',date:'2026-10-20',mealType:'lunch'}],
 menuPlans:{week:{schemaVersion:'3',meals:[{date:'2026-10-20',mealType:'lunch',dishRef:'long'},{date:'2026-10-20',mealType:'lunch',dishRef:'short',plannedServings:20}]}},
 dishes:{long:{schemaVersion:'3',name:LONG,status:'active',components:[{ingredientRef:'tomato',qty:{value:1500,unit:'g'}}]},short:{schemaVersion:'3',name:SHORT,status:'active',components:[{ingredientRef:'tomato'}]}},
 ingredients:{tomato:{schemaVersion:'2',name:{zh:'番茄',en:'Tomato',uk:'Помідор'},baseUnit:'g',trackStock:false}},techniques:[],
 collection:{items:[],issues:[],coverage:{enumeration:'complete',references:'resolved',recipeCompleteness:'unverified'}}}});
const RECORD={zh:'材料与份数',en:'Ingredients & servings',uk:'Інгредієнти й порції'};

test('each Menu row keeps the full name, image and chevron in its recipe link, followed by the record summary',()=>{
 for(const lang of ['zh','en','uk']){
  const el=new Element('main');document.body.append(el);
  const stop=renderFrozenMenu(el,source,{lang,selection:{menuPlanRef:'week'},recipeHref:row=>`#/menu/${row.meal.date}/${row.meal.dishRef}`});
  const rows=el.querySelectorAll('.menu-recipe-row');assert.equal(rows.length,2);
  for(const [row,name] of [[rows[0],LONG[lang]],[rows[1],SHORT[lang]]]){
   const [link,record]=row.children;
   assert.equal(link.tagName,'A');assert(link.matches('.mr'));
   assert.equal(link.querySelector('.n1').textContent,name,`${lang}: the whole name is kept`);
   assert(link.querySelector('.menu-thumbnail')&&link.querySelector('.menu-chevron'),`${lang}: image placeholder and chevron stay inside the link`);
   assert.equal(record.tagName,'DETAILS');assert(record.matches('.menu-row-record'));
   assert.equal(record.children[0].tagName,'SUMMARY');assert.equal(record.children[0].textContent,RECORD[lang]);
  }
  stop();el.remove();
 }
});

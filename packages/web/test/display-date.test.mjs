import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {tmpdir} from 'node:os';
import {dirname,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {test,after} from 'node:test';
const web=join(dirname(fileURLToPath(import.meta.url)),'..'),require=createRequire(import.meta.url);
const esbuild=await import(pathToFileURL(createRequire(require.resolve('vite/package.json')).resolve('esbuild')).href);
const dir=await mkdtemp(join(tmpdir(),'display-date-'));after(()=>rm(dir,{recursive:true,force:true}));
const built=await esbuild.build({stdin:{contents:"export * from './src/display-date';",resolveDir:web},bundle:true,write:false,format:'esm',platform:'node',logLevel:'silent'});
const file=join(dir,'display-date.mjs');await writeFile(file,built.outputFiles[0].text);
const {displayDate,displayDateRange}=await import(pathToFileURL(file).href);
const tag={zh:'zh-Hans',en:'en',uk:'uk'};
const fmt=(lang,iso,o)=>new Intl.DateTimeFormat(tag[lang],{...o,timeZone:'UTC'}).format(new Date(`${iso}T12:00:00Z`));
const langs=['zh','en','uk'];

test('single day: month and day, optional weekday, in each language',()=>{
 for(const lang of langs){
  const plain=displayDate('2026-10-05',lang),week=displayDate('2026-10-05',lang,{weekday:true});
  assert.equal(plain,fmt(lang,'2026-10-05',{month:'short',day:'numeric'}));
  assert.equal(week,fmt(lang,'2026-10-05',{weekday:'short',month:'short',day:'numeric'}));
  assert.doesNotMatch(plain+week,/2026|-10-/);
  assert.ok(week.length>plain.length);
 }
 assert.match(displayDate('2026-10-05','zh'),/10/);
 assert.match(displayDate('2026-10-05','zh'),/5/);
});

test('UTC parsing never shifts the day, whatever the process time zone',()=>{
 for(const lang of langs){
  assert.equal(displayDate('2026-01-01',lang),fmt(lang,'2026-01-01',{month:'short',day:'numeric'}));
  assert.equal(displayDate('2026-12-31',lang),fmt(lang,'2026-12-31',{month:'short',day:'numeric'}));
 }
 assert.match(displayDate('2026-03-01','en'),/\b1\b/);
 assert.match(displayDate('2026-12-31','en'),/\b31\b/);
});

test('ranges: same day is written once, same month and cross month stay year-free',()=>{
 for(const lang of langs){
  assert.equal(displayDateRange('2026-10-05','2026-10-05',lang),displayDate('2026-10-05',lang));
  for(const [a,b] of [['2026-10-05','2026-10-11'],['2026-09-28','2026-10-04']]){
   const out=displayDateRange(a,b,lang);
   assert.doesNotMatch(out,/2026|\//);
   if(lang==='zh')continue;
   const expected=new Intl.DateTimeFormat(tag[lang],{month:'short',day:'numeric',timeZone:'UTC'});
   const ref=expected.formatRange?expected.formatRange(new Date(`${a}T12:00:00Z`),new Date(`${b}T12:00:00Z`)):`${fmt(lang,a,{month:'short',day:'numeric'})} – ${fmt(lang,b,{month:'short',day:'numeric'})}`;
   assert.equal(out,ref);
  }
 }
 assert.match(displayDateRange('2026-10-05','2026-10-11','en'),/5/);
 assert.match(displayDateRange('2026-10-05','2026-10-11','en'),/11/);
});

test('ranges across a year boundary carry the year',()=>{
 for(const lang of langs){
  const out=displayDateRange('2026-12-28','2027-01-03',lang);
  assert.match(out,/2026/);
  assert.match(out,/2027/);
 }
});

test('invalid input is returned untouched and never throws',()=>{
 for(const lang of langs){
  for(const bad of ['','abc','2026-13-40','2026-02-30','2026/10/05','2026-10-05T00:00:00Z']){
   assert.equal(displayDate(bad,lang),bad);
   assert.equal(displayDate(bad,lang,{weekday:true}),bad);
   assert.doesNotThrow(()=>displayDateRange(bad,'2026-10-05',lang));
   assert.doesNotThrow(()=>displayDateRange('2026-10-05',bad,lang));
  }
  assert.match(displayDateRange('x','2026-10-05',lang),/x/);
 }
});

test('Chinese ranges keep the 月日 style of single dates (ICU would write 10/19 – 10/25)',()=>{
 assert.equal(displayDateRange('2026-10-19','2026-10-25','zh'),'10月19日–25日');
 assert.equal(displayDateRange('2026-09-28','2026-10-04','zh'),'9月28日–10月4日');
 assert.equal(displayDateRange('2026-12-28','2027-01-03','zh'),'2026年12月28日–2027年1月3日');
});

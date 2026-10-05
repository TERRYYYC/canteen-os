import assert from 'node:assert/strict';
import {test,after} from 'node:test';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {publishedFixture} from './published-fixture.mjs';
import {runBuild} from '../../../scripts/build-data.mjs';

const root=dirname(fileURLToPath(new URL('../package.json',import.meta.url)));
const require=createRequire(import.meta.url),esbuild=await import(pathToFileURL(createRequire(require.resolve('vite/package.json')).resolve('esbuild')).href);
const temp=await mkdtemp(join(tmpdir(),'published-ingredient-v3-'));after(()=>rm(temp,{recursive:true,force:true}));
const bundle=await esbuild.build({stdin:{contents:"export * from './src/view-models/published';",resolveDir:root},bundle:true,write:false,format:'esm',platform:'browser',logLevel:'silent'});
await writeFile(join(temp,'reader.mjs'),bundle.outputFiles[0].text);
const {createPublishedData}=await import(pathToFileURL(join(temp,'reader.mjs')).href);

// The approved producer consumes a schema-valid unknown-unit v3 source in isolated Git.
// Preserve its real image so the compatibility branch must retain asset validation.
const fixture=publishedFixture('image-a');after(()=>fixture.cleanup());
const file=join(fixture.root,'data/ingredients/tomato.json'),previous=JSON.parse(await readFile(file,'utf8'));
const unknown={schemaVersion:'3',name:previous.name,image:previous.image,trackStock:false};
await writeFile(file,JSON.stringify(unknown));
const git=args=>execFileSync('git',args,{cwd:fixture.root,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
git(['add','data']);git(['-c','user.name=Published v3 fixture','-c','user.email=fixture@example.invalid','-c','commit.gpgsign=false','commit','--quiet','-m','Unknown-unit frozen ingredient']);
const revision=git(['rev-parse','HEAD']);
const built=runBuild({root:fixture.root,commit:revision,target:'team-meals',at:'September 11, 2026 00:00:00 GMT',write:false});
assert.equal(built.issues.some(issue=>issue.kind==='error'),false,JSON.stringify(built.issues));
const projection=JSON.parse(JSON.stringify(built.sheets['week-41'].teamMeals));
assert.deepEqual(projection.ingredients.tomato,unknown);
const json=value=>new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}});
function setup(mutate=()=>{}) {
 const raw=structuredClone(projection);mutate(raw);const calls=[];
 const api=createPublishedData({baseUrl:'https://static.example.invalid/data/',fetch:async address=>{
  const url=new URL(address);calls.push(url);
  if(url.pathname.endsWith('/build.json'))return json(built.build);
  if(url.pathname.endsWith('/team-meals/week-41.json'))return json(raw);
  const path=decodeURIComponent(url.pathname.slice('/data/'.length));
  const source=path.replace(`assets/${revision}/`,'');
  return new Response(await readFile(join(fixture.root,source)),{headers:{'Content-Type':'image/png'}});
 }});
 return {api,calls};
}
const load=async api=>api.loadPublishedTeamPlan(await api.loadPublication(),'week-41');

test('actual producer unknown-unit v3 projection remains readable without inventing quantities',async()=>{
 const {api,calls}=setup(),view=await load(api);
 assert.equal(view.sourceRevision,revision);assert.deepEqual(view.projection.ingredients.tomato,unknown);
 assert.equal(Object.hasOwn(view.projection.ingredients.tomato,'baseUnit'),false);
 assert.deepEqual(view.estimates,projection.estimates);assert.deepEqual(view.issues,projection.issues);
 assert(view.estimates.items.find(item=>item.ingredientRef==='tomato').reasons.some(reason=>reason.code==='missing-base-unit'));
 assert.throws(()=>{view.projection.ingredients.tomato.baseUnit='g';},TypeError);
 const asset=await api.loadPublishedAsset(view,'/ingredients/tomato/image');
 assert.equal(asset.kind,'available');assert.equal(asset.sourceRevision,revision);
 assert.deepEqual(Buffer.from(await asset.bytes.arrayBuffer()),await readFile(join(fixture.root,'data/images/A %2F?# 雪.png')));
 assert.equal(calls.length,3);
});

test('explicit v3 accepts exactly its optional unit enum, including the unknown source',async()=>{
 for(const unit of [undefined,'g','ml','pcs']) {
  const {api}=setup(raw=>{if(unit!==undefined)raw.ingredients.tomato.baseUnit=unit;});
  const view=await load(api);assert.equal(view.projection.ingredients.tomato.baseUnit,unit);
 }
});

test('v3 null/invalid units and non-v3 absent units still fail closed',async()=>{
 for(const unit of [null,'kg','',3,{},[]]) {
  const {api}=setup(raw=>{raw.ingredients.tomato.baseUnit=unit;});
  await assert.rejects(load(api),{code:'invalid_data',stage:'projection',sourceRevision:revision});
 }
 for(const version of [undefined,'2',3,'future']) {
  const {api}=setup(raw=>{if(version===undefined)delete raw.ingredients.tomato.schemaVersion;else raw.ingredients.tomato.schemaVersion=version;});
  await assert.rejects(load(api),{code:'invalid_data',stage:'projection',sourceRevision:revision});
 }
 for(const version of [undefined,'2'])for(const unit of ['g','kg','l','pack','tbsp']) {
  const {api}=setup(raw=>{if(version===undefined)delete raw.ingredients.tomato.schemaVersion;else raw.ingredients.tomato.schemaVersion=version;raw.ingredients.tomato.baseUnit=unit;});
  assert.equal((await load(api)).projection.ingredients.tomato.baseUnit,unit);
 }
});

test('the v3 compatibility path preserves revision and complete image binding guards',async()=>{
 for(const [mutate,code] of [
  [raw=>{raw.sourceRevision='b'.repeat(40);},'revision_mismatch'],
  [raw=>{raw.assets.find(asset=>asset.ownerPath==='data/ingredients/tomato.json').source.src='../images/other.png';},'asset_binding_invalid'],
  [raw=>{raw.assets=raw.assets.filter(asset=>asset.ownerPath!=='data/ingredients/tomato.json');},'asset_binding_invalid'],
 ]) {
  const {api,calls}=setup(mutate);await assert.rejects(load(api),{code,stage:'projection',sourceRevision:revision});
  assert(calls.every(url=>!url.pathname.includes('/assets/')));
 }
});

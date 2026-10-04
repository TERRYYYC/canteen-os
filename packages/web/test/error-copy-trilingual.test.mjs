// #113 方案 B：错误文案按 code 三语化 + 字段级拼接（当前合同补充，历史 ADR 不变）。
// 打包真实 src/admin/kit.ts 跑，不复制文案：任何一列被删掉或改错，这里立刻红。
import assert from 'node:assert/strict';
import {readFile, mkdtemp, writeFile, rm} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {test, after} from 'node:test';
const here = dirname(fileURLToPath(import.meta.url)), require = createRequire(import.meta.url);
const esbuild = await import(pathToFileURL(createRequire(require.resolve('vite/package.json')).resolve('esbuild')));
const dir = await mkdtemp(join(tmpdir(), 'error-copy-'));after(() => rm(dir, {recursive:true,force:true}));
const bundle = await esbuild.build({stdin:{contents:`export {fieldErrorText,apiMessage} from './src/admin/kit';export {ApiError} from './src/api/types';export {reasonText} from './src/pages/purchase-list';`,resolveDir:join(here,'..')},bundle:true,write:false,format:'esm',platform:'browser',loader:{'.css':'empty'},define:{'import.meta.env.VITE_WORKER_URL':'""'},logLevel:'silent'});
await writeFile(join(dir,'kit.mjs'), bundle.outputFiles[0].text);
const mod = await import(pathToFileURL(join(dir,'kit.mjs')));
const LANGS = ['zh','en','uk'];
const err = (code, message = '', path = '') => ({path, code, message});
// issue #113 评论第 1 节的 17 条：worker 能发出、前端原先没有译文的全部 code。
const REGISTERED = ['bad_id','bad_path','bad_json','bad_image','unauthorized','forbidden','not_found','too_large','rate_limited','upstream_error','dispatch_unavailable','not_configured','internal_error','unresolved_reference','required','type','enum'];

test('每个新登记的 code 在三语里都有自己的文案，且不是 worker 发来的中文 message',()=>{
 for(const code of REGISTERED){
  const shown = LANGS.map(lang=>mod.fieldErrorText(err(code,'RAW MESSAGE FROM WORKER'),lang));
  assert.equal(new Set(shown).size,3,`${code} 的三语文案必须互不相同：${JSON.stringify(shown)}`);
  for(const text of shown){assert.ok(text.length>0,code);assert.doesNotMatch(text,/RAW MESSAGE FROM WORKER/,code);}
 }
});

test('已登记 code 的三语译文逐字照抄 issue #113 的表（zh / en / uk 各一条）',()=>{
 assert.equal(mod.fieldErrorText(err('rate_limited','操作太频繁，等几分钟再试'),'zh'),'操作太频繁，等几分钟再试');
 assert.equal(mod.fieldErrorText(err('not_configured','这项功能还没配好，找 Terry'),'en'),'This feature is not configured yet. Ask Terry');
 assert.equal(mod.fieldErrorText(err('dispatch_unavailable','发布功能暂时关着'),'uk'),'Публікацію наразі вимкнено');
 assert.equal(mod.fieldErrorText(err('unauthorized','链接失效了，找 Terry 要新的'),'uk'),'Посилання недійсне. Попросіть у Террі нове');
 // apiMessage 与字段位走同一张表
 for(const lang of LANGS) assert.equal(mod.apiMessage(new mod.ApiError(429,'rate_limited','操作太频繁，等几分钟再试'),lang),mod.fieldErrorText(err('rate_limited','操作太频繁，等几分钟再试'),lang));
});

test('未登记的 code 仍原样显示 message，一个字都不改',()=>{
 for(const lang of LANGS){
  assert.equal(mod.fieldErrorText(err('minLength','Name needs at least two letters'),lang),'Name needs at least two letters');
  assert.equal(mod.fieldErrorText(err('maxItems','最多 20 项'),lang),'最多 20 项');
  assert.equal(mod.apiMessage(new mod.ApiError(400,'pattern','Only lowercase letters'),lang),'Only lowercase letters');
 }
});

test('字段级 code 在译文之后拼上 message 里分隔符后的具体值（issue #113 第 2 节）',()=>{
 const e = err('enum','只能选：en / uk','/targets');
 assert.equal(mod.fieldErrorText(e,'zh'),'这一项只能从给定的几个选项里选：en / uk');
 assert.equal(mod.fieldErrorText(e,'en'),'Choose one of the allowed options: en / uk');
 assert.equal(mod.fieldErrorText(e,'uk'),'Виберіть один із дозволених варіантів: en / uk');
 // worker 真实发出的另外两条字段级 message（image.ts:134 / validate.ts）
 assert.equal(mod.fieldErrorText(err('required','这项必须填：license','/license'),'en'),'This field is required: license');
 assert.equal(mod.fieldErrorText(err('required','这项必须填：license','/license'),'uk'),"Це поле обов'язкове: license");
 assert.equal(mod.fieldErrorText(err('type','这里应该是一组字段',''),'en'),'This value has the wrong format');
 // 半角冒号同样算分隔符；没有分隔符就只剩译文，不把中文 message 拼回来
 assert.equal(mod.fieldErrorText(err('enum','allowed: a / b','/x'),'en'),'Choose one of the allowed options: a / b');
 assert.equal(mod.fieldErrorText(err('required','这项必须填','/name'),'zh'),'这项必须填');
 for(const lang of LANGS) assert.doesNotMatch(mod.fieldErrorText(err('type','这里应该是一组字段',''),lang),/这里应该是一组字段/);
});

test('非字段级的已登记 code 不拼接：整条 message 由译文替换',()=>{
 assert.equal(mod.fieldErrorText(err('bad_id','名称只能用小写字母、数字和短横线：Salt'),'en'),'Names may use lowercase letters, digits and hyphens only');
 assert.equal(mod.fieldErrorText(err('not_found','没找到这个版本：abc'),'uk'),'Цю версію не знайдено');
});

test('canonical ingredient gaps have human words in all three languages',()=>{
 for(const code of ['missing-base-unit','ingredient-spec-conflict']){
  const shown=LANGS.map(lang=>mod.reasonText(code,lang));
  assert.equal(new Set(shown).size,3);
  for(const text of shown)assert.notEqual(text,code);
 }
});

test('save-service failure gives kitchen users a next step without implementation setup',()=>{
 for(const lang of LANGS){
  const text=mod.fieldErrorText(err('upstream_error','RAW'),lang);
  assert.doesNotMatch(text,/GitHub|PAT/);
 }
});

test('knowledge approval and standard-ingredient errors have registered trilingual words',()=>{
 for(const code of ['INVALID_INGREDIENT','INVALID_APPROVAL','INVALID_INGREDIENT_VERSION','RECIPE_FORMAT_REQUIRED','INGREDIENT_NOT_FOUND','INGREDIENT_REVISION_NOT_FOUND','INGREDIENT_VERSION_CONFLICT','SOURCE_REVIEW_REQUIRED','ALREADY_APPROVED','FORMAT_DOWNGRADE','VERSION_CONFLICT','IDEMPOTENCY_KEY_REUSED','RECIPE_ARCHIVED','RECIPE_INCOMPLETE','INVALID_INGREDIENT_BINDINGS','TECHNIQUE_NOT_FOUND']){
  const shown=LANGS.map(lang=>mod.fieldErrorText(err(code,'RAW KNOWLEDGE ERROR'),lang));
  assert.equal(new Set(shown).size,3,code);
  for(const text of shown)assert.notEqual(text,'RAW KNOWLEDGE ERROR',code);
 }
});

test('zh 一列与 packages/worker/src/http.ts 的 MESSAGES 现状逐字一致（改了也算二次编造）',async()=>{
 const http = await readFile(join(here,'../../worker/src/http.ts'),'utf8');
 const block = /const MESSAGES: Record<ErrorCode, string> = \{([\s\S]*?)\n\};/.exec(http);
 assert.ok(block,'worker 的 MESSAGES 表结构变了，这条守卫要跟着改');
 const worker = Object.fromEntries([...block[1].matchAll(/^\s*([a-z_]+): "([^"]*)",$/gm)].map(m=>[m[1],m[2]]));
 assert.ok(Object.keys(worker).length>=25,Object.keys(worker).length);
 let checked = 0;
 for(const code of REGISTERED){
  if(!(code in worker)||code==='upstream_error') continue; // source text is retained internally; kitchen copy avoids infrastructure setup
  assert.equal(mod.fieldErrorText(err(code,'IGNORED'),'zh'),worker[code],code);
  checked++;
 }
 assert.equal(checked,12,'除已登记的人话例外外，MESSAGES 有 12 条保持原中文');
});

test('两份历史契约指向当前补充，原 ADR 不被改写',async()=>{
 const docs = ['../../../docs/specs/v03-worker-contract.md','../../../docs/specs/v03-admin-frontend-contract.md'];
 const clauses = [];
 for(const rel of docs){
  const text = await readFile(join(here,rel),'utf8');
  const line = text.split('\n').find(l=>l.includes('当前本地化呈现补充'));
  assert.ok(line,`${rel} 缺少 #113 的例外条文`);
  clauses.push(line);
 }
 assert.equal(new Set(clauses).size,1,'两处引用必须一致');
 const current=await readFile(join(here,'../../../docs/current-contract.md'),'utf8');
 assert.match(current,/未知错误/);
 assert.match(current,/`required`、`type`、`enum`/);
 const adr=await readFile(join(here,'../../../docs/adr/0007-write-channel.md'),'utf8');
 assert.doesNotMatch(adr,/当前本地化呈现补充|例外（2026-09-16，见 #113）/);
});

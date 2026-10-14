import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';

const require=createRequire(import.meta.url),vr=createRequire(require.resolve('vite/package.json'));
const {build}=await import(pathToFileURL(vr.resolve('esbuild')));
const out=await build({entryPoints:[new URL('../src/pages/quantity-text.ts',import.meta.url).pathname],bundle:true,write:false,format:'esm',platform:'node',loader:{'.css':'empty'},logLevel:'silent'});
const mod=await import(`data:text/javascript;base64,${Buffer.from(out.outputFiles[0].text).toString('base64')}`);
const {displayQuantity:d}=mod;
const nf=(lang,max,n)=>new Intl.NumberFormat({uk:'uk',zh:'zh-Hans',en:'en'}[lang],{maximumFractionDigits:max}).format(n);

test('three-language unit names',()=>{
 assert.equal(d({value:5,unit:'g'},'zh'),`5 克`);assert.equal(d({value:5,unit:'g'},'uk'),'5 г');assert.equal(d({value:5,unit:'g'},'en'),'5 g');
 assert.equal(d({value:5,unit:'ml'},'zh'),'5 毫升');assert.equal(d({value:5,unit:'ml'},'uk'),'5 мл');assert.equal(d({value:5,unit:'ml'},'en'),'5 ml');
 assert.equal(d({value:5,unit:'kg'},'zh'),'5 千克');assert.equal(d({value:5,unit:'l'},'zh'),'5 升');assert.equal(d({value:5,unit:'l'},'uk'),'5 л');
});
test('g rolls over to kg from 1000',()=>{
 assert.equal(d({value:999,unit:'g'},'zh'),'999 克');
 assert.equal(d({value:1000,unit:'g'},'zh'),'1 千克');
 assert.equal(d({value:1500,unit:'g'},'zh'),`${nf('zh',1,1.5)} 千克`);
 assert.equal(d({value:93176.5,unit:'g'},'zh'),`${nf('zh',1,93.1765)} 千克`);
 assert.equal(d({value:93176.5,unit:'g'},'en'),`${nf('en',1,93.1765)} kg`);
 assert.equal(d({value:18000,unit:'g'},'zh'),'18 千克');
 assert.equal(d({value:7500,unit:'g'},'zh'),`${nf('zh',1,7.5)} 千克`);
});
test('ml rolls over to litres, uk uses a decimal comma',()=>{
 assert.equal(d({value:999,unit:'ml'},'zh'),'999 毫升');
 assert.equal(d({value:1500,unit:'ml'},'zh'),`${nf('zh',1,1.5)} 升`);
 assert.equal(d({value:1500,unit:'ml'},'en'),`${nf('en',1,1.5)} L`);
 assert.equal(d({value:9600,unit:'g'},'uk'),`${nf('uk',1,9.6)} кг`);
 assert.match(d({value:9600,unit:'g'},'uk'),/^9,6 кг$/);
 assert.match(d({value:9600,unit:'g'},'zh'),/^9\.6 千克$/);
});
test('pcs, to-taste, missing value',()=>{
 assert.equal(d({value:3,unit:'pcs'},'zh'),'3 个');assert.equal(d({value:3,unit:'pcs'},'uk'),'3 шт');assert.equal(d({value:3,unit:'pcs'},'en'),'3 pcs');
 assert.equal(d({unit:'to-taste'},'zh'),'适量');assert.equal(d({unit:'to-taste'},'en'),'To taste');assert.equal(d({unit:'to-taste'},'uk'),'За смаком');
 assert.equal(d({unit:'g'},'zh'),'用量未录');assert.equal(d({unit:'g'},'en'),'Quantity not recorded');assert.equal(d({unit:'g'},'uk'),'Кількість не записано');
 assert.equal(d(undefined,'zh'),'用量未录');
});
test('quantityText follows the shared display; recorded originalAmount is not part of it',()=>{
 assert.equal(mod.quantityText({value:1500,unit:'g'},'en'),d({value:1500,unit:'g'},'en'));
 assert.equal(d({value:2,unit:'pcs',originalAmount:'两斤'},'zh'),'2 个');
});

import {publishedFixture} from './packages/web/test/published-fixture.mjs';
import {createRequire} from 'node:module';
const require=createRequire(new URL('./packages/web/package.json',import.meta.url));
const {build}=await import(require.resolve('vite/package.json').replace('package.json','dist/node/index.js'));
import {writeFile} from 'node:fs/promises';
const web=new URL('./browser-web/',import.meta.url).pathname;
const f=publishedFixture('image-a');f.publish(web+'public/data');process.env.VITE_D1_PHOTO_URL='./data/assets/'+f.revision+'/data/images/'+encodeURIComponent('A %2F?# 雪.png');f.cleanup();
process.env.VITE_WORKER_URL='https://application-api.local.invalid';process.env.VITE_REVIEW_HEAD_SHA='df992aad3807638c2ef1a092cdb38d01b9d60f6d';
await build({root:web,configFile:new URL('./packages/web/vite.config.ts',import.meta.url).pathname,plugins:[{name:'observe-review-graph',generateBundle(_opts,bundle){this.emitFile({type:'asset',fileName:'reviewer-module-graph.json',source:JSON.stringify(Object.values(bundle).filter(x=>x.type==='chunk').map(x=>({file:x.fileName,imports:x.imports,dynamicImports:x.dynamicImports,modules:Object.keys(x.modules)})),null,2)});}}],build:{outDir:web+'dist',emptyOutDir:true}});

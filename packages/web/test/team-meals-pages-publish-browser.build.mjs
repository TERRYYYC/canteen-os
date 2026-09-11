/** D-only reproducible browser fixture: no production module is modified. */
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {dirname,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const here=dirname(fileURLToPath(import.meta.url)),entry=join(here,'../src/pages/admin/publish.ts');
const require=createRequire(import.meta.url),viteRequire=createRequire(require.resolve('vite/package.json')),esbuild=await import(pathToFileURL(viteRequire.resolve('esbuild')));
const source=await readFile(entry,'utf8'),hash=createHash('sha256').update(source).digest('hex');
const injected={
 '../../api/client':'export const getApi=()=>globalThis.__publishBrowser.legacy;',
 '../../api/team-meals':'export const getTeamMealsApi=()=>globalThis.__publishBrowser.team;',
 '../admin':'export const adminHref=(...parts)=>"#/admin"+(parts.length?"/"+parts.map(encodeURIComponent).join("/"):"");',
};
const bundle=await esbuild.build({stdin:{contents:source+`\nexport {createTeamMealsApi} from ${JSON.stringify(join(here,'../src/api/team-meals.ts'))}; export {HttpAdminApi} from ${JSON.stringify(join(here,'../src/api/client.ts'))}; export {clearToken as changeAuth} from ${JSON.stringify(join(here,'../src/admin/token.ts'))}; export {setLang} from ${JSON.stringify(join(here,'../src/i18n.ts'))};`,loader:'ts',resolveDir:dirname(entry)},plugins:[{name:'D-publish-browser-getters',setup(build){build.onResolve({filter:/^\.\.\//},args=>injected[args.path]&&(args.importer===''||args.importer==='<stdin>'||args.importer.endsWith('publish.ts'))?{path:args.path,namespace:'D-publish-browser'}:undefined);build.onLoad({filter:/.*/,namespace:'D-publish-browser'},args=>({contents:injected[args.path],loader:'js'}));}}],bundle:true,write:false,format:'esm',platform:'browser',loader:{'.css':'empty'},minify:true,define:{'import.meta.env.VITE_WORKER_URL':'""','import.meta.env.BASE_URL':'"/"'},logLevel:'silent'});
await writeFile(join(here,'team-meals-pages-publish-browser.generated.mjs'),`// D-only generated fixture; actual publish.ts SHA256 ${hash}\n// Rebuild: node packages/web/test/team-meals-pages-publish-browser.build.mjs\n${bundle.outputFiles[0].text}\nexport const publishSourceHash=${JSON.stringify(hash)};\n`);
console.log(`D publish browser fixture generated from ${hash}`);

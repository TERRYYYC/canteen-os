/** Q-owned deterministic browser input. Never writes production/frozen fixture files. */
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,readdirSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {materializeFixture,CONTRACTS_ROOT} from '../../../../../scripts/validate-contract-fixtures.mjs';
import {validateData} from '../../../../../scripts/validate-schemas.mjs';
import {runBuild} from '../../../../../scripts/build-data.mjs';
import {FakeRepo,makeEnv,gitBlobSha} from '../../../../worker/test/helpers.mjs';

export const fixedAt='2026-09-10T00:00:00.000Z';
export const json=value=>JSON.stringify(value,null,2)+'\n';
export function filesUnder(root,relative='data') {
  return Object.fromEntries(readdirSync(join(root,relative),{withFileTypes:true}).flatMap(entry=>{
    const file=`${relative}/${entry.name}`;
    return entry.isDirectory()?Object.entries(filesUnder(root,file)):[[file,readFileSync(join(root,file))]];
  }));
}
export function currentFiles(repo) {
  return Object.fromEntries([...repo.trees.get(repo.commits.get(repo.head).tree)].map(([file,sha])=>[file,repo.blobs.get(sha)]));
}
export function createPageFixture() {
  const root=mkdtempSync(join(tmpdir(),'rcq-page-fixture-'));
  materializeFixture('local-image',root);
  for(const [from,to] of [['menu-plan-v3.json','menu-plans/team-week.json'],['dish-v3.json','dishes/second-dish.json']]) {
    writeFileSync(join(root,'data',to),readFileSync(join(CONTRACTS_ROOT,'pending-a1/valid',from)));
  }
  // Explicit synthetic manual-entry variant: example provenance is forbidden by
  // the real producer. Original example fixtures remain byte-for-byte untouched.
  for(const id of ['first-dish','second-dish','name-only']) {
    const file=join(root,'data/dishes',`${id}.json`),dish=JSON.parse(readFileSync(file));
    dish.provenance={source:'manual'};
    writeFileSync(file,json(dish));
  }
  const golden=JSON.parse(readFileSync(join(CONTRACTS_ROOT,'valid/golden/data/dishes/tomato-egg-stir-fry.json')));
  const techniques=JSON.parse(readFileSync(join(CONTRACTS_ROOT,'valid/golden/data/techniques.json')));
  const technique=structuredClone(techniques.find(t=>t.id===golden.components[0].prep.techniqueRef));
  technique.image=JSON.parse(readFileSync(join(root,'data/ingredients/tomato.json'))).image;
  writeFileSync(join(root,'data/techniques.json'),json([{id:'unused-leading',kind:'cut',name:{zh:'未引用技法',en:'Unselected technique',uk:'Невикористаний прийом'}},technique]));
  const firstPath=join(root,'data/dishes/first-dish.json'),first=JSON.parse(readFileSync(firstPath));
  first.components[0].prep={techniqueRef:technique.id};
  first.steps=[{text:{zh:'按原始记录准备番茄。',en:'Prepare tomatoes using the recorded instructions.',uk:'Підготуйте томати за записаними вказівками.'},techniqueRef:technique.id}];
  writeFileSync(firstPath,json(first));
  // Preserve independent old PO bytes as a sentinel. It is not a team shopping list.
  mkdirSync(join(root,'data/purchase-orders'),{recursive:true});
  const po=readdirSync(join(CONTRACTS_ROOT,'valid/golden/data/purchase-orders')).find(f=>f.endsWith('.json'));
  writeFileSync(join(root,'data/purchase-orders',po),readFileSync(join(CONTRACTS_ROOT,'valid/golden/data/purchase-orders',po)));
  const schemaDir=new URL('../../../../../schemas/',import.meta.url).pathname;
  const validation=validateData({root,schemaDir});
  assert.equal(validation.failed,0,JSON.stringify(validation.results.filter(r=>!r.valid)));
  const git=args=>execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe'],env:{...process.env,GIT_AUTHOR_DATE:fixedAt,GIT_COMMITTER_DATE:fixedAt}}).trim();
  git(['init','--quiet']);git(['add','data']);
  git(['-c','user.name=RC-Q local fixture','-c','user.email=rcq-fixture@example.invalid','-c','commit.gpgsign=false','commit','--quiet','-m','Deterministic Q manual-entry page fixture']);
  const revision=git(['rev-parse','HEAD']),files=filesUnder(root);
  const publicDir=join(root,'published');
  const built=runBuild({root,outDir:publicDir,commit:revision,target:'team-meals',at:fixedAt,write:true});
  assert.deepEqual(built.issues.filter(i=>i.kind==='error'),[],'formal producer must accept the published fixture');
  const repo=new FakeRepo(),model=repo.commit(files,'Q browser fixture');
  const commit=repo.commits.get(model);
  repo.commits.delete(model);repo.commits.set(revision,{...commit,sha:revision});repo.head=revision;
  for(const [file,bytes] of Object.entries(files)) {
    const actual=git(['rev-parse',`${revision}:${file}`]);
    assert.equal(gitBlobSha(bytes),actual,file);
    assert.equal(repo.trees.get(commit.tree).get(file),actual,file);
  }
  const {env}=makeEnv(repo);
  const fakeFetch=env.__fetch;
  env.__fetch=(input,init)=>{
    const url=new URL(typeof input==='string'?input:input.url);
    assert.equal(url.origin,'https://api.github.com','only the existing GitHub model may receive Worker external requests');
    return fakeFetch(input,init);
  };
  // Test-only published metadata for the real changes handler's existing fake endpoint.
  repo.buildJson=built.build;
  return {root,revision,files,repo,env,publicDir,built,validation};
}

/** Q-only opt-in fixture. Local Git/build artifacts, with GitHub HTTP still modeled. */
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {FakeRepo,makeEnv,REPO} from '../../../../worker/test/helpers.mjs';
import {CONTRACTS_ROOT} from '../../../../../scripts/validate-contract-fixtures.mjs';
import {runBuild} from '../../../../../scripts/build-data.mjs';
import {json,filesUnder} from './page-fixture.mjs';

const fixedAt='2026-09-12T00:00:00.000Z';
const fixtureNotice={
  zh:'演示／未核验：沿用仓库番茄炒蛋资料，BV1example888 是占位视频，并无人工核验或厨房可用结论。',
  en:'Demo / unverified: repository tomato-and-egg data; BV1example888 is a placeholder video. No human recipe verification or kitchen readiness claim.',
  uk:'Демо / не перевірено: дані страви з репозиторію; BV1example888 — відеозаповнювач. Рецепт не перевірено людиною для використання на кухні.',
};

/** Keep the existing fake GitHub routes, but store real blobs, trees and commits.
 * No Git remote is configured. Only the test repository under mkdtemp is written.
 */
class SavedGitRepo extends FakeRepo {
  constructor(root) {
    super();this.root=root;
    this.git(['init','--quiet','--initial-branch=main','--object-format=sha1']);
  }
  git(args,input,date=fixedAt) {
    return execFileSync('git',args,{cwd:this.root,input,stdio:['pipe','pipe','pipe'],env:{...process.env,
      GIT_AUTHOR_NAME:'RC-Q local fixture',GIT_AUTHOR_EMAIL:'rcq-fixture@example.invalid',
      GIT_COMMITTER_NAME:'RC-Q local fixture',GIT_COMMITTER_EMAIL:'rcq-fixture@example.invalid',
      GIT_AUTHOR_DATE:date,GIT_COMMITTER_DATE:date}}).toString().trim();
  }
  addBlob(bytes) {
    const sha=super.addBlob(bytes);
    assert.equal(this.git(['hash-object','-w','--stdin'],bytes),sha);
    return sha;
  }
  registerTree(flat) {
    const root=new Map();
    for(const [path,sha] of flat) {
      assert.match(path,/^[a-zA-Z0-9_-][a-zA-Z0-9_./-]*$/);
      const parts=path.split('/');assert.ok(parts.every(p=>p&&p!=='.'&&p!=='..'));
      assert.ok(this.blobs.has(sha),`missing blob: ${path}`);
      let dir=root;
      for(const part of parts.slice(0,-1)) {
        if(!dir.has(part))dir.set(part,new Map());
        dir=dir.get(part);assert.ok(dir instanceof Map);
      }
      assert.ok(!dir.has(parts.at(-1)));dir.set(parts.at(-1),sha);
    }
    const tree=dir=>this.git(['mktree','-z'],[...dir].map(([name,value])=>value instanceof Map
      ?`040000 tree ${tree(value)}\t${name}\0`:`100644 blob ${value}\t${name}\0`).join(''));
    const sha=tree(root);this.trees.set(sha,new Map(flat));return sha;
  }
  createCommit(tree,message,parents) {
    assert.ok(this.trees.has(tree));assert.ok(parents.every(p=>this.commits.has(p)));
    const date=new Date(Date.parse(fixedAt)+ ++this.counter*1000).toISOString();
    const sha=this.git(['-c','commit.gpgsign=false','commit-tree',tree,...parents.flatMap(p=>['-p',p])],message+'\n',date);
    this.commits.set(sha,{sha,tree,parents,message,date});return sha;
  }
  commitTree(tree,message) {
    const sha=this.createCommit(tree,message,this.head?[this.head]:[]);
    this.head=sha;this.syncHead();return sha;
  }
  syncHead(){this.git(['update-ref','refs/heads/main',this.head]);}
}

export function createLocalPublicationFixture() {
  const root=mkdtempSync(join(tmpdir(),'rcq-local-publication-'));
  const golden=join(CONTRACTS_ROOT,'valid/golden/data');
  const write=(file,bytes)=>{const dest=join(root,file);mkdirSync(join(dest,'..'),{recursive:true});writeFileSync(dest,bytes);};
  const recipe=JSON.parse(readFileSync(join(golden,'dishes/tomato-egg-stir-fry.json')));
  for(const [lang,notice] of Object.entries(fixtureNotice)) {
    recipe.name[lang]+={zh:'（演示／未核验）',en:' (demo / unverified)',uk:' (демо / не перевірено)'}[lang];
    recipe.description[lang]=`${notice} ${recipe.description[lang]}`;
  }
  // Preserve original components, steps, confidence, status and video provenance.
  // There is deliberately no unrelated dish photograph or human-review flag.
  write('data/dishes/tomato-egg-stir-fry.json',json(recipe));
  for(const ref of new Set(recipe.components.map(c=>c.ingredientRef)))write(`data/ingredients/${ref}.json`,readFileSync(join(golden,`ingredients/${ref}.json`)));
  write('data/techniques.json',readFileSync(join(golden,'techniques.json')));
  write('data/dishes/needs-details.json',json({schemaVersion:'3',name:{zh:'待补资料菜（演示）',en:'Recipe needs details (demo)',uk:'Страва потребує даних (демо)'},
    description:{zh:'用于检查缺食材和步骤时的提示；不能据此采购或下厨。',en:'Missing ingredients and steps, for recovery checks only.',uk:'Бракує інгредієнтів і кроків; лише перевірка відновлення.'},status:'draft',provenance:{source:'manual'}}));
  write('data/menu-plans/team-week.json',json({schemaVersion:'3',name:{zh:'9月12–13日餐食演示（未核验）',en:'September 12–13 meal demo (unverified)',uk:'Демо меню 12–13 вересня (не перевірено)'},
    dateRange:{start:'2026-09-12',end:'2026-09-13'},meals:[
      {date:'2026-09-12',mealType:'lunch',dishRef:'tomato-egg-stir-fry'},
      {date:'2026-09-12',mealType:'lunch',dishRef:'needs-details'},
    ]}));
  const files=filesUnder(root),repo=new SavedGitRepo(root),revision=repo.commit(files,'Q local unverified tomato-and-egg demo');
  const publicDir=join(root,'published');
  const built=runBuild({root,outDir:publicDir,commit:revision,target:'team-meals',at:fixedAt,write:true});
  assert.equal(built.issues.filter(i=>i.kind==='error').length,0,JSON.stringify(built.issues));
  const attempts=[];
  const publication={
    snapshot:()=>({kind:'local-generation-only',savedRevision:repo.head,publicRevision:repo.buildJson.commit,fixtureNotice,attempts}),
    update(expectedRevision) {
      const attempt={kind:'local-generation-only',expectedRevision,savedRevision:repo.head,previousPublicRevision:repo.buildJson.commit};
      if(expectedRevision!==repo.head)Object.assign(attempt,{status:409,error:'saved_revision_changed'});
      else try {
        const result=runBuild({root,outDir:publicDir,commit:repo.head,target:'team-meals',at:fixedAt,write:true});
        Object.assign(attempt,{status:result.issues.some(i=>i.kind==='error')?422:200,issues:result.issues,written:result.written});
        if(attempt.status===200)repo.buildJson=result.build;
      } catch(error){Object.assign(attempt,{status:422,error:String(error)});}
      attempt.publicRevision=repo.buildJson.commit;attempts.push(attempt);return attempt;
    },
  };
  repo.buildJson=built.build;
  const commitRoute=`POST /repos/${REPO}/git/commits`;
  const {env}=makeEnv(repo,{__extraRoutes:{[commitRoute]:(_url,body)=>new Response(json({sha:repo.createCommit(body.tree,body.message,body.parents)}),{status:201,headers:{'Content-Type':'application/json'}})}});
  const fakeFetch=env.__fetch;
  env.__fetch=async(input,init={})=>{
    const url=new URL(typeof input==='string'?input:input.url),method=init.method??'GET';
    // Answer only this exact publication probe locally. No request is sent there.
    const localBuildProbe=url.href===`${env.PAGES_BASE_URL}data/build.json`&&method==='GET';
    assert.ok(url.origin==='https://api.github.com'||localBuildProbe,'only modeled GitHub and the local build probe are allowed');
    assert.ok(!url.pathname.endsWith('/dispatches'),'No workflow dispatch in the local publication fixture');
    const response=await fakeFetch(input,init);
    if(method==='PATCH'&&url.pathname===`/repos/${REPO}/git/refs/heads/main`&&response.ok)repo.syncHead();
    return response;
  };
  return {root,revision,files,repo,env,publicDir,built,fixedAt,fixtureNotice,publication};
}

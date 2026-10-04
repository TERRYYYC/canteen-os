import test from 'node:test';
import assert from 'node:assert/strict';
import { commitImmutableFiles } from '../dist/write.js';
import { FakeRepo, makeEnv } from './helpers.mjs';
import { GitHubClient } from '../dist/github.js';

test('new dish atomically reuses an already frozen identical dependency, including repeated rows',async()=>{
  const repo = new FakeRepo(); repo.commit({'README.md':'base'});
  const {env}=makeEnv(repo);
  const gh = new GitHubClient({repo:env.GITHUB_REPO,branch:'main',apiBase:env.GITHUB_API_BASE,token:env.GITHUB_PAT,fetch:env.__fetch});
  const encode = text => new TextEncoder().encode(text);
  const shared = {path:'data/ingredients/kbi-shared-v1.json',bytes:encode('{"same":"dependency"}')};
  const opts = {subject:'test shared snapshot',role:'chef',endpoint:'POST /knowledge-materializations/recipes/:id'};
  await commitImmutableFiles(gh,[shared,{path:'data/dishes/kb-a-v1.json',bytes:encode('{"first":true}')}],opts);
  const second = [shared,{path:'data/dishes/kb-b-v1.json',bytes:encode('{"second":true}')}];
  const result = await commitImmutableFiles(gh,second,opts);
  assert.equal(result.unchanged,false);
  assert.equal((await commitImmutableFiles(gh,[shared,...second],opts)).unchanged,true);
  assert.equal(repo.fileText('data/ingredients/kbi-shared-v1.json'),'{"same":"dependency"}');
  assert(repo.fileText('data/dishes/kb-b-v1.json'));
  const before = repo.head;
  await assert.rejects(()=>commitImmutableFiles(gh,[{...shared,bytes:encode('{"changed":true}')},{path:'data/dishes/kb-c-v1.json',bytes:encode('{}')}],opts));
  assert.equal(repo.head,before);
  assert.equal(repo.fileText('data/dishes/kb-c-v1.json'),null);
});

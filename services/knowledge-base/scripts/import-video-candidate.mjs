#!/usr/bin/env node
import { createReadStream, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildVideoImport } from '../apps/api/video-candidate.mjs';

function parseArgs(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (key === '--dry-run') { options.dryRun = true; continue; }
    if (!['--api-base','--item-id','--source','--evidence','--candidate','--media','--source-method','--output'].includes(key) || !argv[i + 1]) throw new Error(`Unknown or incomplete option: ${key}`);
    options[key.slice(2).replace(/-([a-z])/g,(_m,letter) => letter.toUpperCase())] = argv[++i];
  }
  for (const key of ['apiBase','itemId','source','evidence','candidate','media','sourceMethod']) if (!options[key]) throw new Error(`Missing --${key.replace(/[A-Z]/g,letter => `-${letter.toLowerCase()}`)}`);
  return options;
}

async function mediaHash(path) {
  const hash = createHash('sha256'); let bytes = 0;
  for await (const chunk of createReadStream(path)) { hash.update(chunk); bytes += chunk.length; }
  return { sha256:hash.digest('hex'),bytes };
}

async function api(base, path, method = 'GET', body) {
  const url = new URL(path,`${base.replace(/\/$/,'')}/api/v1/`);
  if (!['127.0.0.1','localhost','::1','[::1]'].includes(url.hostname) || url.protocol !== 'http:') throw new Error('KB import API must be reached over a local loopback or SSH tunnel');
  const response = await fetch(url,{method,headers:body ? {'content-type':'application/json','x-kb-client':'agent'} : {},body:body ? JSON.stringify(body) : undefined});
  const data = await response.json();
  if (!response.ok) throw new Error(`${method} ${url.pathname}: ${response.status} ${JSON.stringify(data)}`);
  return { data, replayed:response.status === 200 && method === 'POST' };
}

export async function runImport(options) {
  const source = JSON.parse(readFileSync(resolve(options.source),'utf8'));
  const evidence = JSON.parse(readFileSync(resolve(options.evidence),'utf8'));
  const candidate = JSON.parse(readFileSync(resolve(options.candidate),'utf8'));
  const media = await mediaHash(resolve(options.media));
  if (media.sha256 !== source.sha256 || media.bytes !== source.byteCount) throw new Error('Local media bytes do not match source manifest');
  const {data:item} = await api(options.apiBase,`favorites/items/${options.itemId}`);
  const imported = buildVideoImport({item,source,evidence,candidate,sourceMethod:options.sourceMethod});
  if (options.output) writeFileSync(resolve(options.output),JSON.stringify(imported,null,2)+'\n');
  if (options.dryRun) return {dryRun:true,contentId:item.contentId,mediaSha256:source.sha256,
    evidenceCount:imported.capture.evidence.segments.length,ingredientCount:imported.proposal.recipe.ingredients.length,
    stepCount:imported.proposal.recipe.steps.length,unresolvedCount:imported.proposal.unresolved.length,
    unknownCount:imported.proposal.recipe.unknowns?.length ?? 0};
  const captured = await api(options.apiBase,`favorites/items/${item.id}/captures`,'POST',imported.capture);
  const proposed = await api(options.apiBase,`favorites/items/${item.id}/candidates`,'POST',{captureId:captured.data.id,...imported.proposal});
  return {contentId:item.contentId,mediaSha256:source.sha256,captureId:captured.data.id,captureReplayed:captured.replayed,
    candidateId:proposed.data.id,candidateReplayed:proposed.replayed,status:proposed.data.status,
    ingredientCount:proposed.data.recipe.ingredients.length,stepCount:proposed.data.recipe.steps.length,
    unresolvedCount:proposed.data.unresolved.length,unknownCount:proposed.data.recipe.unknowns?.length ?? 0};
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runImport(parseArgs(process.argv.slice(2))).then(result => console.log(JSON.stringify(result,null,2)),error => { console.error(error.message); process.exitCode = 1; });
}

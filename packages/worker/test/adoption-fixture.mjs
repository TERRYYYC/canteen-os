import { createHash } from 'node:crypto';
import { sortKeysDeep } from '../dist/serialize.js';
const hash=value=>createHash('sha256').update(JSON.stringify(sortKeysDeep(value))).digest('hex');
/** A modeled durable KB record for engineering tests, never a user approval. */
export function fixtureApproval(detail,candidateId){
  const value={approvalVersion:'1',status:'approved',recipeId:detail.id,recipeVersion:detail.version,
    origin:{kind:'favorite',candidateId,originalRecipeVersion:1},recipeSnapshotHash:hash(detail),originalSnapshotHash:hash(detail),
    dependencies:{ingredients:[],techniques:[]},unresolved:[],reviewer:'engineering-test-only',note:'test fixture stored approval',actor:'web',createdAt:'2026-10-05T00:00:00.000Z'};
  return {...value,approvalHash:hash(value)};
}

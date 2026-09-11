/** Q-UI-T01-02: assertion over native-browser captures, not a synthetic UI replay.
 * Reproduce the documented actions and pass a fresh evidence directory to verify a repair.
 */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
const dir=process.argv[2]??fileURLToPath(new URL('../../../../../docs/field-test/team-meals/page-browser/',import.meta.url));
const before=await readFile(join(dir,'T01-import-unrelated-edit-before.txt'),'utf8');
const after=await readFile(join(dir,'T01-import-unrelated-edit-lost.txt'),'utf8');
const value=text=>text.match(/spinbutton "份数（选填）"(?: \[active\])?: "(\d+)"/)?.[1];
assert.equal(value(before),'11','The captured initial local edit must be eleven servings');
console.log(JSON.stringify({layer:'assertion over native DOM captures',before:value(before),after:value(after),expected:'11',input:'2026-09-15 午 第一道样本菜'}));
assert.equal(value(after),'11','Importing a different date must retain the prior unsaved eleven-serving edit');

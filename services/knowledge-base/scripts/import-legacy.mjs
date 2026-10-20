#!/usr/bin/env node
import { dirname, join, resolve } from 'node:path';
import { openDatabase } from '../apps/api/database.mjs';
import { readLegacyBundle, importLegacyBundle } from '../apps/api/legacy-import.mjs';

export function runImport(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (key === '--apply') { args.apply = true; continue; }
    if (!['--source','--revision','--namespace','--db','--uploads'].includes(key) || !argv[i + 1] || argv[i + 1].startsWith('--') || args[key.slice(2)] !== undefined) throw new Error('Usage: import-legacy.mjs --source DATA_DIRECTORY --revision GIT_SHA --namespace STABLE_ID [--db DATABASE --uploads DIRECTORY --apply]');
    args[key.slice(2)] = argv[++i];
  }
  if (!args.source || !args.revision || !args.namespace || (args.apply && !args.db)) throw new Error('source, revision, namespace are required; apply also requires db');
  const bundle = readLegacyBundle({ sourceDir: args.source, namespace: args.namespace, revision: args.revision });
  if (!args.apply) return { mode: 'inventory', namespace: bundle.namespace, sourceRevision: bundle.revision, manifestHash: bundle.manifestHash, manifest: bundle.manifest, counts: bundle.counts,
    note: 'Inventory only; full reference/recipe validation occurs in the atomic apply transaction. No database opened.' };
  const dbPath = resolve(args.db), uploadsDir = resolve(args.uploads ?? join(dirname(dbPath), 'uploads'));
  const { db } = openDatabase(dbPath);
  try { return importLegacyBundle({ db, uploadsDir, bundle }); } finally { db.close(); }
}

if (import.meta.main) {
  try { console.log(JSON.stringify(runImport(process.argv.slice(2)), null, 2)); }
  catch (error) { console.error(JSON.stringify({ error: { code: error.code ?? 'LEGACY_IMPORT_FAILED', message: error.message } })); process.exitCode = 1; }
}

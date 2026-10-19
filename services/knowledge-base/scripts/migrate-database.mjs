#!/usr/bin/env node
// Use the application's own transactional migration runner before switching code.
import path from 'node:path';
import * as fs from 'node:fs/promises';
import { openDatabase } from '../apps/api/database.mjs';
import { noLinks, checkRuntime } from './sqlite-ops.mjs';

try {
  checkRuntime();
  const [dataDir, expectedVersionText] = process.argv.slice(2);
  if (!dataDir || !/^[1-9]\d*$/.test(expectedVersionText || '')) throw new Error('Usage: migrate-database.mjs DATA_DIRECTORY EXPECTED_SCHEMA_VERSION');
  const bundledMigrations = (await fs.readdir(new URL('../db/', import.meta.url))).filter(name => /^\d{3}_[a-z0-9_]+\.sql$/.test(name));
  if (bundledMigrations.length !== Number(expectedVersionText)) throw new Error('Manifest schema version differs from bundled migrations');
  const data = await noLinks(dataDir);
  const database = path.join(data, 'knowledge.sqlite');
  await noLinks(database, { allowMissing: true });
  await fs.mkdir(path.join(data, 'uploads'), { recursive: true, mode: 0o700 });
  await noLinks(path.join(data, 'uploads'));
  const opened = openDatabase(database);
  try {
    if (opened.schemaVersion !== Number(expectedVersionText)) throw new Error('Migration version differs from release manifest');
    console.log(JSON.stringify({ migrated: true, sqliteVersion: opened.sqliteVersion, schemaVersion: opened.schemaVersion }));
  } finally { opened.db.close(); }
} catch (error) {
  console.error(`Migration failed: ${error.message}`);
  process.exitCode = 1;
}

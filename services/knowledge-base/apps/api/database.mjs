import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync, readdirSync, chmodSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

export function transaction(db, fn, write = true) {
  db.exec(write ? 'BEGIN IMMEDIATE' : 'BEGIN');
  try {
    const result = fn();
    if (result && typeof result.then === 'function') throw new Error('SQLite transactions must be synchronous');
    db.exec('COMMIT');
    return result;
  } catch (error) {
    if (db.isTransaction) db.exec('ROLLBACK');
    throw error;
  }
}

export function assertSQLiteVersion(version) {
  const parts = version.split('.').map(Number);
  const minimum = [3, 51, 3];
  for (let i = 0; i < 3; i++) {
    if (!Number.isInteger(parts[i])) throw new Error('Cannot determine SQLite runtime version');
    if (parts[i] > minimum[i]) return;
    if (parts[i] < minimum[i]) throw new Error('SQLite runtime must be >= 3.51.3 (WAL reset fix)');
  }
}

function migrationBody(sql) {
  // Bundled DDL is also CLI-runnable and has its own transaction/pragmas.
  // Remove ONLY its exact top-level framing lines, not trigger BEGIN/END.
  let starts = 0, commits = 0;
  const body = sql.replace(/^PRAGMA (?:foreign_keys\s*=\s*ON|busy_timeout\s*=\s*5000|synchronous\s*=\s*FULL|recursive_triggers\s*=\s*ON);[ \t]*$/gm, '')
    .replace(/^BEGIN IMMEDIATE;[ \t]*$/gm, () => { starts++; return ''; })
    .replace(/^COMMIT;[ \t]*$/gm, () => { commits++; return ''; });
  if (starts !== commits || starts > 1 || /^PRAGMA\b/im.test(body)) throw new Error('Unsupported migration framing');
  return body;
}

export function openDatabase(dbPath, migrationsDir = fileURLToPath(new URL('../../db/', import.meta.url))) {
  mkdirSync(dirname(dbPath), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(dbPath);
  try {
    chmodSync(dbPath, 0o600);
    const sqliteVersion = db.prepare('SELECT sqlite_version() AS version').get().version;
    assertSQLiteVersion(sqliteVersion);
    db.exec('PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON; PRAGMA recursive_triggers=ON; PRAGMA synchronous=FULL;');
    if (db.prepare('PRAGMA journal_mode=WAL').get().journal_mode !== 'wal') throw new Error('SQLite WAL mode unavailable');
    const files = readdirSync(migrationsDir).filter(name => /^\d{3}_[a-z0-9_]+\.sql$/.test(name)).sort();
    if (!files.length) throw new Error('No bundled migrations');
    const schemaVersion = transaction(db, () => {
      db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, sha256 TEXT NOT NULL, applied_at TEXT NOT NULL) STRICT');
      const applied = db.prepare('SELECT version,name,sha256 FROM schema_migrations ORDER BY version').all();
      if (applied.length > files.length) throw new Error('Database schema is newer than this application');
      files.forEach((name, index) => {
        const version = Number(name.slice(0, 3));
        if (version !== index + 1) throw new Error('Migration versions must be contiguous');
        const sql = readFileSync(join(migrationsDir, name), 'utf8');
        const sha256 = createHash('sha256').update(sql).digest('hex');
        if (applied[index]) {
          if (applied[index].version !== version || applied[index].name !== name || applied[index].sha256 !== sha256) throw new Error('Applied migration differs from application release');
        } else {
          db.exec(migrationBody(sql));
          db.prepare('INSERT INTO schema_migrations(version,name,sha256,applied_at) VALUES(?,?,?,?)').run(version, name, sha256, new Date().toISOString());
        }
      });
      return files.length;
    });
    return { db, sqliteVersion, schemaVersion };
  } catch (error) { db.close(); throw error; }
}

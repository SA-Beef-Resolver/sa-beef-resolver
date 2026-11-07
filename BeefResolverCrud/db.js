const { execFileSync } = require('node:child_process');
const { existsSync, readFileSync, unlinkSync } = require('node:fs');
const path = require('node:path');

const DB_PATH = process.env.BEEF_DB_PATH || path.join(__dirname, 'beef-resolver.db');
const readSql = (name) => readFileSync(path.join(__dirname, name), 'utf8');

// Scripts go through stdin, so a path with spaces (common on Windows) cannot break the sqlite3 CLI.
function sqlite(args, input) {
  return execFileSync('sqlite3', args, { encoding: 'utf8', input });
}

function sqlValue(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function query(sql) {
  const result = sqlite(['-json', DB_PATH, sql]);
  return result.trim() ? JSON.parse(result) : [];
}

function run(sql) {
  sqlite([DB_PATH, sql]);
}

// Older databases have no account-id columns (and a UNIQUE name pair), so rebuild the table once.
function migrateIfNeeded() {
  const columns = query('PRAGMA table_info(beefs)').map((column) => column.name);
  if (columns.includes('person_a_id')) return;
  sqlite([DB_PATH], `BEGIN;
ALTER TABLE beefs RENAME TO beefs_old;
${readSql('schema.sql')}
INSERT INTO beefs (id, person_a, person_b, reason, status, created_at, updated_at)
  SELECT id, person_a, person_b, reason, status, created_at, updated_at FROM beefs_old;
DROP TABLE beefs_old;
COMMIT;`);
  console.log('Migrated beefs table to account-linked schema.');
}

function initialiseDatabase() {
  const fresh = !existsSync(DB_PATH);
  sqlite([DB_PATH], readSql('schema.sql'));
  migrateIfNeeded();
  if (fresh && process.env.SEED_MOCK_DATA !== 'false') {
    sqlite([DB_PATH], readSql('seed.sql'));
    console.log('Created database and inserted mock data.');
  } else if (fresh) {
    console.log('Created empty database.');
  }
}

function resetDatabase() {
  if (existsSync(DB_PATH)) unlinkSync(DB_PATH);
  initialiseDatabase();
}

module.exports = { DB_PATH, sqlValue, query, run, initialiseDatabase, resetDatabase };

// Applies versioned database migrations: each .sql file in /migrations runs once, in filename order.
// Applied files are recorded in schema_migrations, so running this again only applies new files.
// Run with: npm run migrate (Render also runs it on every deploy; see render.yaml).

const fs = require('node:fs');
const path = require('node:path');
const { pool } = require('../src/db');

const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');

async function migrate() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`);
  const { rows } = await pool.query('SELECT version FROM schema_migrations');
  const applied = new Set(rows.map((row) => row.version));

  const files = fs.readdirSync(MIGRATIONS_DIR).filter((file) => file.endsWith('.sql')).sort();
  for (const file of files) {
    if (applied.has(file)) continue;

    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    const client = await pool.connect();
    try {
      // Run the file and record it in one transaction: a migration is applied completely or not at all.
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [file]);
      await client.query('COMMIT');
      console.log(`Applied ${file}`);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
  console.log('Migrations are up to date.');
}

migrate()
  .catch((err) => {
    console.error('Migration failed:', err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());

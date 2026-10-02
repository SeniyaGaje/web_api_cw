const { Pool, types } = require('pg');
const { attachDatabasePool } = require('@vercel/functions');
const config = require('./config');

// By default pg returns some Postgres types as strings. Convert the two we use so the JSON is right:
// bigint (reading_id, COUNT(*)) becomes a number - safe, our values stay far below JavaScript's 2^53 limit;
// date (commissioned_on) stays the plain 'YYYY-MM-DD' string instead of becoming a midnight Date in local time.
types.setTypeParser(types.builtins.INT8, Number);
types.setTypeParser(types.builtins.DATE, (value) => value);

// One shared pool of connections for the whole process.
// TLS is set by the connection string: Neon's URL ends in ?sslmode=verify-full.
const pool = new Pool({ connectionString: config.databaseUrl });

// On Vercel, a function instance is suspended between requests. This lets Vercel close our idle connections
// before it suspends the instance, so connections are not left open. Outside Vercel it does nothing.
attachDatabasePool(pool);

// Inserts many rows using one multi-row INSERT per batch, which means far fewer round trips to the hosted database.
// Postgres allows at most 65,535 parameters per statement, so each batch stays at about 30,000.
// `table` and `columns` always come from our own code, never from a request, so building the SQL text is safe;
// every value still goes in as a $n parameter.
// `db` is the pool, or a client that is inside a transaction.
async function insertMany(db, table, columns, rows, suffix = '') {
  const batchSize = Math.floor(30000 / columns.length);
  let inserted = 0;

  for (let start = 0; start < rows.length; start += batchSize) {
    const batch = rows.slice(start, start + batchSize);
    const values = [];
    const tuples = batch.map((row) => {
      const placeholders = columns.map((column) => {
        values.push(row[column]);
        return `$${values.length}`;
      });
      return `(${placeholders.join(', ')})`;
    });

    const result = await db.query(
      `INSERT INTO ${table} (${columns.join(', ')}) VALUES ${tuples.join(', ')} ${suffix}`,
      values
    );
    inserted += result.rowCount;
  }

  return inserted;
}

module.exports = { pool, insertMany };

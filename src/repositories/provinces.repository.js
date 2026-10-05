// SQL for provinces. List functions return one page as { count, lastModified, results };
// find functions return one row (including updated_at, for the Last-Modified header) or null.
const { pool } = require('../db/pool');

async function listProvinces({ limit, offset }) {
  const totals = await pool.query('SELECT count(*) AS count, max(updated_at) AS last_modified FROM provinces');
  const { rows } = await pool.query(
    'SELECT province_id, name FROM provinces ORDER BY province_id LIMIT $1 OFFSET $2',
    [limit, offset]
  );
  return { count: totals.rows[0].count, lastModified: totals.rows[0].last_modified, results: rows };
}

async function findProvince(provinceId) {
  const { rows } = await pool.query('SELECT province_id, name, updated_at FROM provinces WHERE province_id = $1', [
    provinceId,
  ]);
  return rows[0] || null;
}

module.exports = { listProvinces, findProvince };

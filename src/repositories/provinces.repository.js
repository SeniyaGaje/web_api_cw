// SQL for provinces. List functions return one page as { count, lastModified, results };
// find functions return one row (including updated_at, for the Last-Modified header) or null.
const { pool } = require('../db/pool');

// "$1::text IS NULL OR ..." means: when the filter was not given ($1 is null), don't filter on it.
const LIST_FROM_WHERE = 'FROM provinces WHERE ($1::text IS NULL OR province_id = $1)';

async function listProvinces({ provinceId, limit, offset }) {
  const totals = await pool.query(`SELECT count(*) AS count, max(updated_at) AS last_modified ${LIST_FROM_WHERE}`, [
    provinceId,
  ]);
  const { rows } = await pool.query(
    `SELECT province_id, name ${LIST_FROM_WHERE} ORDER BY province_id LIMIT $2 OFFSET $3`,
    [provinceId, limit, offset]
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

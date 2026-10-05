// SQL for districts. List functions return one page as { count, lastModified, results };
// find functions return one row (including updated_at, for the Last-Modified header) or null.
const { pool } = require('../db/pool');

// "$1::text IS NULL OR ..." means: when the filter was not given ($1 is null), don't filter on it.
const LIST_FROM_WHERE = 'FROM districts WHERE ($1::text IS NULL OR province_id = $1)';

async function listDistricts({ provinceId, limit, offset }) {
  const totals = await pool.query(`SELECT count(*) AS count, max(updated_at) AS last_modified ${LIST_FROM_WHERE}`, [
    provinceId,
  ]);
  const { rows } = await pool.query(
    `SELECT district_id, name, province_id ${LIST_FROM_WHERE} ORDER BY district_id LIMIT $2 OFFSET $3`,
    [provinceId, limit, offset]
  );
  return { count: totals.rows[0].count, lastModified: totals.rows[0].last_modified, results: rows };
}

async function findDistrict(districtId) {
  const { rows } = await pool.query(
    'SELECT district_id, name, province_id, updated_at FROM districts WHERE district_id = $1',
    [districtId]
  );
  return rows[0] || null;
}

module.exports = { listDistricts, findDistrict };

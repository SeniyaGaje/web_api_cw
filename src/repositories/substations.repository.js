// SQL for grid substations. List functions return one page as { count, lastModified, results };
// find functions return one row (including updated_at, for the Last-Modified header) or null.
const { pool } = require('../db/pool');

// A substation knows its district; the join to districts lets us also filter by province.
// "$1::text IS NULL OR ..." means: when that filter was not given, don't filter on it.
const LIST_FROM_WHERE = `
  FROM substations s
  JOIN districts d ON d.district_id = s.district_id
  WHERE ($1::text IS NULL OR d.province_id = $1)
    AND ($2::text IS NULL OR s.district_id = $2)`;

async function listSubstations({ provinceId, districtId, limit, offset }) {
  const totals = await pool.query(`SELECT count(*) AS count, max(s.updated_at) AS last_modified ${LIST_FROM_WHERE}`, [
    provinceId,
    districtId,
  ]);
  const { rows } = await pool.query(
    `SELECT s.substation_id, s.name, s.district_id ${LIST_FROM_WHERE} ORDER BY s.substation_id LIMIT $3 OFFSET $4`,
    [provinceId, districtId, limit, offset]
  );
  return { count: totals.rows[0].count, lastModified: totals.rows[0].last_modified, results: rows };
}

async function findSubstation(substationId) {
  const { rows } = await pool.query(
    'SELECT substation_id, name, district_id, updated_at FROM substations WHERE substation_id = $1',
    [substationId]
  );
  return rows[0] || null;
}

module.exports = { listSubstations, findSubstation };

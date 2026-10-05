// SQL for grid substations. List functions return one page as { count, lastModified, results };
// find functions return one row (including updated_at, for the Last-Modified header) or null.
// province_id comes from the district, so jurisdiction checks need no extra query.
const { pool } = require('../db/pool');

const COLUMNS = 's.substation_id, s.name, s.district_id, d.province_id';

// "$1::text IS NULL OR ..." means: when that filter was not given, don't filter on it.
const LIST_FROM_WHERE = `
  FROM substations s
  JOIN districts d ON d.district_id = s.district_id
  WHERE ($1::text IS NULL OR d.province_id = $1)
    AND ($2::text IS NULL OR s.district_id = $2)`;

async function listSubstations({ provinceId, districtId, limit, offset }) {
  const filters = [provinceId, districtId];
  const totals = await pool.query(`SELECT count(*) AS count, max(s.updated_at) AS last_modified ${LIST_FROM_WHERE}`, filters);
  const { rows } = await pool.query(
    `SELECT ${COLUMNS} ${LIST_FROM_WHERE} ORDER BY s.substation_id LIMIT $3 OFFSET $4`,
    [...filters, limit, offset]
  );
  return { count: totals.rows[0].count, lastModified: totals.rows[0].last_modified, results: rows };
}

async function findSubstation(substationId) {
  const { rows } = await pool.query(
    `SELECT ${COLUMNS}, s.updated_at
       FROM substations s
       JOIN districts d ON d.district_id = s.district_id
      WHERE s.substation_id = $1`,
    [substationId]
  );
  return rows[0] || null;
}

module.exports = { listSubstations, findSubstation };

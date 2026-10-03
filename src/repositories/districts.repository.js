// SQL for districts. find functions return one row or null.
const { pool } = require('../db/pool');

async function listDistricts() {
  const { rows } = await pool.query('SELECT district_id, name, province_id FROM districts ORDER BY district_id');
  return rows;
}

async function findDistrict(districtId) {
  const { rows } = await pool.query('SELECT district_id, name, province_id FROM districts WHERE district_id = $1', [
    districtId,
  ]);
  return rows[0] || null;
}

module.exports = { listDistricts, findDistrict };

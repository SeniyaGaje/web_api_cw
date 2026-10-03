// SQL for provinces. find functions return one row or null.
const { pool } = require('../db/pool');

async function listProvinces() {
  const { rows } = await pool.query('SELECT province_id, name FROM provinces ORDER BY province_id');
  return rows;
}

async function findProvince(provinceId) {
  const { rows } = await pool.query('SELECT province_id, name FROM provinces WHERE province_id = $1', [provinceId]);
  return rows[0] || null;
}

module.exports = { listProvinces, findProvince };

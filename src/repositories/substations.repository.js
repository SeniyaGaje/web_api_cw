// SQL for grid substations. find functions return one row or null.
const { pool } = require('../db/pool');

async function listSubstations() {
  const { rows } = await pool.query('SELECT substation_id, name, district_id FROM substations ORDER BY substation_id');
  return rows;
}

async function findSubstation(substationId) {
  const { rows } = await pool.query(
    'SELECT substation_id, name, district_id FROM substations WHERE substation_id = $1',
    [substationId]
  );
  return rows[0] || null;
}

module.exports = { listSubstations, findSubstation };

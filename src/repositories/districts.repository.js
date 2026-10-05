// SQL for districts. List functions return one page as { count, lastModified, results };
// find functions return one row (including updated_at, for the Last-Modified header) or null.
const { pool } = require('../db/pool');
const { findLatestReadings } = require('./readings.repository');

const REPORTING_WINDOW_MS = 30 * 60 * 1000; // an installation is "reporting" if its latest reading is this recent

// "$1::text IS NULL OR ..." means: when that filter was not given, don't filter on it.
const LIST_FROM_WHERE = `
  FROM districts
  WHERE ($1::text IS NULL OR province_id = $1)
    AND ($2::text IS NULL OR district_id = $2)`;

async function listDistricts({ provinceId, districtId, limit, offset }) {
  const filters = [provinceId, districtId];
  const totals = await pool.query(`SELECT count(*) AS count, max(updated_at) AS last_modified ${LIST_FROM_WHERE}`, filters);
  const { rows } = await pool.query(
    `SELECT district_id, name, province_id ${LIST_FROM_WHERE} ORDER BY district_id LIMIT $3 OFFSET $4`,
    [...filters, limit, offset]
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

// §4.5 processing function: live totals across every active installation in the district.
async function getGenerationSummary(districtId) {
  const asOf = new Date();
  const { rows } = await pool.query(
    `SELECT i.installation_id
       FROM installations i
       JOIN substations s ON s.substation_id = i.substation_id
      WHERE s.district_id = $1 AND i.deleted_at IS NULL`,
    [districtId]
  );
  const ids = rows.map((row) => row.installation_id);

  // Current power: the shared latest-reading rule, counting only installations that reported recently.
  const latest = await findLatestReadings(ids);
  const reporting = [...latest.values()].filter((reading) => asOf - reading.timestamp <= REPORTING_WINDOW_MS);
  const currentPowerKw = reporting.reduce((total, reading) => total + reading.power_kw, 0);

  // Today's energy: energy_kwh only ever grows, so each meter's output today is its max minus min since
  // midnight in Sri Lanka (Asia/Colombo).
  const today = await pool.query(
    `SELECT coalesce(sum(day_kwh), 0) AS energy_kwh
       FROM (SELECT max(energy_kwh) - min(energy_kwh) AS day_kwh
               FROM readings
              WHERE installation_id = ANY($1)
                AND timestamp >= date_trunc('day', $2::timestamptz AT TIME ZONE 'Asia/Colombo') AT TIME ZONE 'Asia/Colombo'
              GROUP BY installation_id) AS per_installation`,
    [ids, asOf]
  );

  return {
    district_id: districtId,
    as_of: asOf,
    installation_count: ids.length,
    reporting_installations: reporting.length,
    current_total_power_kw: round3(currentPowerKw),
    today_energy_kwh: round3(today.rows[0].energy_kwh),
  };
}

const round3 = (value) => Math.round(value * 1000) / 1000;

module.exports = { listDistricts, findDistrict, getGenerationSummary };

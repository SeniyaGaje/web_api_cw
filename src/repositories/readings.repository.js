// SQL for generation readings: an append-only time series. There is deliberately no update or delete here.
const { pool } = require('../db/pool');

// A reading as the API shows it.
const READING_COLUMNS = 'reading_id, installation_id, timestamp, received_at, power_kw, energy_kwh, voltage_v';

// One installation's history (§4.6 scoped collection), newest first.
async function listReadings(installationId) {
  const { rows } = await pool.query(
    `SELECT ${READING_COLUMNS} FROM readings WHERE installation_id = $1 ORDER BY timestamp DESC`,
    [installationId]
  );
  return rows;
}

// One reading, only if it belongs to the given installation (so the URI cannot mix installations up).
async function findReading(installationId, readingId) {
  const { rows } = await pool.query(
    `SELECT ${READING_COLUMNS} FROM readings WHERE reading_id = $1 AND installation_id = $2`,
    [readingId, installationId]
  );
  return rows[0] || null;
}

// Appends a reading. received_at is filled in by the database (DEFAULT now()): the server's clock, not the device's.
// A second reading with the same installation and timestamp breaks the UNIQUE constraint (error code 23505).
async function insertReading(installationId, reading) {
  const { rows } = await pool.query(
    `INSERT INTO readings (installation_id, timestamp, power_kw, energy_kwh, voltage_v)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING ${READING_COLUMNS}`,
    [installationId, reading.timestamp, reading.power_kw, reading.energy_kwh, reading.voltage_v]
  );
  return rows[0];
}

// The ONE definition of "latest reading" in this API: an installation's newest reading by timestamp
// (ORDER BY timestamp DESC LIMIT 1). The backfill, the installation composite and /last-reading all use it
// (and the district summary will), so the rule can never differ between them.
//
// For each id, the LATERAL subquery runs once and uses the (installation_id, timestamp) index to jump
// straight to the newest row, so it stays fast however long the history grows.
// Returns a Map of installation_id -> reading. Installations with no readings are left out.
// `db` is the pool by default, or a client that is inside a transaction (the backfill passes its own).
async function findLatestReadings(installationIds, db = pool) {
  const { rows } = await db.query(
    `SELECT latest.*
       FROM unnest($1::text[]) AS ids (installation_id)
       CROSS JOIN LATERAL (
         SELECT ${READING_COLUMNS}
           FROM readings
          WHERE readings.installation_id = ids.installation_id
          ORDER BY timestamp DESC
          LIMIT 1
       ) AS latest`,
    [installationIds]
  );
  return new Map(rows.map((reading) => [reading.installation_id, reading]));
}

// The latest reading of a single installation, or null. Uses the shared rule above.
async function findLatestReading(installationId) {
  const latest = await findLatestReadings([installationId]);
  return latest.get(installationId) || null;
}

module.exports = { listReadings, findReading, insertReading, findLatestReadings, findLatestReading };

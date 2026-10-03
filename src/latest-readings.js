const { pool } = require('./db');

// The ONE definition of "latest reading" in this API: an installation's newest reading by timestamp
// (ORDER BY timestamp DESC LIMIT 1). The backfill uses it now; the installation composite, /last-reading and
// the district summary will reuse it, so the rule can never differ between them.
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
         SELECT reading_id, installation_id, timestamp, received_at, power_kw, energy_kwh, voltage_v
           FROM readings
          WHERE readings.installation_id = ids.installation_id
          ORDER BY timestamp DESC
          LIMIT 1
       ) AS latest`,
    [installationIds]
  );
  return new Map(rows.map((reading) => [reading.installation_id, reading]));
}

module.exports = { findLatestReadings };

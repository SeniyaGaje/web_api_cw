const { pool, insertMany } = require('../db/pool');
const { findLatestReadings } = require('../repositories/readings.repository');
const { SLOT_MS, READING_COLUMNS, createRng, floorToSlot, simulateReading } = require('./reading-simulator');

const FLUSH_EVERY = 5000; // insert in chunks so a catch-up never holds too many rows in memory
const MAX_CATCH_UP_MS = 24 * 60 * 60 * 1000; // never generate more than one day in one go (see below)
const BACKFILL_LOCK_ID = 2026; // any fixed number: it names the database lock that "the backfill" takes

// Stands in for the fleet of meters, because nothing runs between requests on a serverless host.
// For every active installation, it generates the readings the meter would have pushed, from the slot after its
// newest stored reading up to the latest 15-minute slot before `now`. Returns the number of readings inserted.
//
// Vercel may run several copies (instances) of the API at once, so the work happens inside a transaction holding
// a database lock: a second caller waits until the first has committed, then finds nothing left to add. Without
// it, two instances could build the same slots from different random numbers and mix up the energy totals.
async function backfillReadings(now) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock($1)', [BACKFILL_LOCK_ID]); // released automatically at COMMIT
    const inserted = await addMissingReadings(client, now);
    await client.query('COMMIT');
    return inserted;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function addMissingReadings(client, now) {
  const lastSlot = floorToSlot(now).getTime();
  // After a long idle period, only the last day is filled in. Older missing slots stay as a gap, as if the meters
  // had been offline, which keeps the request that triggers the catch-up down to a few seconds.
  const earliestSlot = lastSlot - MAX_CATCH_UP_MS + SLOT_MS;

  const { rows: installations } = await client.query(
    'SELECT installation_id, capacity_kw FROM installations WHERE deleted_at IS NULL'
  );
  const latest = await findLatestReadings(installations.map((installation) => installation.installation_id), client);
  const rng = createRng(lastSlot / SLOT_MS);

  let pending = [];
  let inserted = 0;
  for (const installation of installations) {
    const newest = latest.get(installation.installation_id);
    if (!newest) continue; // it has never reported (for example, just registered), so there is nothing to continue

    let energyKwh = newest.energy_kwh;
    const firstSlot = Math.max(floorToSlot(newest.timestamp).getTime() + SLOT_MS, earliestSlot);
    for (let t = firstSlot; t <= lastSlot; t += SLOT_MS) {
      const reading = simulateReading(installation, new Date(t), energyKwh, rng);
      energyKwh = reading.energy_kwh;
      pending.push(reading);
    }

    if (pending.length >= FLUSH_EVERY) {
      inserted += await insertReadings(client, pending);
      pending = [];
    }
  }
  inserted += await insertReadings(client, pending);
  return inserted;
}

// ON CONFLICT DO NOTHING: if a reading for that installation and timestamp already exists (for example,
// one a device pushed itself), keep it. Readings are append-only, so nothing is ever overwritten.
function insertReadings(client, rows) {
  return insertMany(client, 'readings', READING_COLUMNS, rows, 'ON CONFLICT (installation_id, timestamp) DO NOTHING');
}

module.exports = { backfillReadings };

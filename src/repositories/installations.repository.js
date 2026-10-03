// SQL for solar installations. Soft-deleted installations (deleted_at set) are invisible everywhere:
// every query below includes "deleted_at IS NULL".
const { pool } = require('../db/pool');
const { findLatestReading } = require('./readings.repository');

// The installation's own fields, as the API shows them. device_secret_hash and deleted_at are never exposed.
const INSTALLATION_COLUMNS =
  'i.installation_id, i.meter_id, i.substation_id, i.capacity_kw, i.address, i.commissioned_on, i.created_at, i.updated_at';

async function listInstallations() {
  const { rows } = await pool.query(
    `SELECT ${INSTALLATION_COLUMNS} FROM installations i WHERE i.deleted_at IS NULL ORDER BY i.installation_id`
  );
  return rows;
}

// The installation on its own (no related data), or null if it does not exist or was deleted.
async function findInstallation(installationId) {
  const { rows } = await pool.query(
    `SELECT ${INSTALLATION_COLUMNS} FROM installations i WHERE i.installation_id = $1 AND i.deleted_at IS NULL`,
    [installationId]
  );
  return rows[0] || null;
}

// §4.3 composite resource: the installation together with its most relevant related data, retrieved in one call:
// where it sits in the hierarchy (substation, district, province) and its latest reading.
// The reading history is deliberately NOT embedded: that is the readings sub-collection's job.
async function findInstallationComposite(installationId) {
  const { rows } = await pool.query(
    `SELECT ${INSTALLATION_COLUMNS},
            s.name AS substation_name,
            d.district_id, d.name AS district_name,
            p.province_id, p.name AS province_name
       FROM installations i
       JOIN substations s ON s.substation_id = i.substation_id
       JOIN districts d ON d.district_id = s.district_id
       JOIN provinces p ON p.province_id = d.province_id
      WHERE i.installation_id = $1 AND i.deleted_at IS NULL`,
    [installationId]
  );
  const row = rows[0];
  if (!row) return null;

  return {
    installation_id: row.installation_id,
    meter_id: row.meter_id,
    substation_id: row.substation_id,
    capacity_kw: row.capacity_kw,
    address: row.address,
    commissioned_on: row.commissioned_on,
    created_at: row.created_at,
    updated_at: row.updated_at,
    substation: { substation_id: row.substation_id, name: row.substation_name },
    district: { district_id: row.district_id, name: row.district_name },
    province: { province_id: row.province_id, name: row.province_name },
    last_reading: await findLatestReading(installationId), // one nested reading object, or null if none yet
  };
}

// Creates an installation and returns its new id. The server assigns the id: one more than the highest
// number used so far (deleted installations included, so an id is never reused).
async function createInstallation(installation, deviceSecretHash) {
  const { rows } = await pool.query(
    `INSERT INTO installations (installation_id, meter_id, substation_id, capacity_kw, address, commissioned_on, device_secret_hash)
     SELECT 'INS-' || lpad(next_number::text, greatest(4, length(next_number::text)), '0'), $1, $2, $3, $4, $5, $6
       FROM (SELECT coalesce(max(substring(installation_id FROM 5)::int), 0) + 1 AS next_number FROM installations) AS n
     RETURNING installation_id`,
    [
      installation.meter_id,
      installation.substation_id,
      installation.capacity_kw,
      installation.address,
      installation.commissioned_on,
      deviceSecretHash,
    ]
  );
  return rows[0].installation_id;
}

// §7.2 PUT is a full replacement: every writable field is overwritten, so an optional field that the client
// left out (address, commissioned_on) becomes null here rather than keeping its old value.
async function replaceInstallation(installationId, installation) {
  await pool.query(
    `UPDATE installations
        SET meter_id = $2, substation_id = $3, capacity_kw = $4, address = $5, commissioned_on = $6, updated_at = now()
      WHERE installation_id = $1 AND deleted_at IS NULL`,
    [
      installationId,
      installation.meter_id,
      installation.substation_id,
      installation.capacity_kw,
      installation.address,
      installation.commissioned_on,
    ]
  );
}

// Soft delete: the row stays (with deleted_at set) so its readings keep their owner and remain as history.
// Returns { installation_id, deleted_at }, or null if there was nothing to delete.
async function softDeleteInstallation(installationId) {
  const { rows } = await pool.query(
    `UPDATE installations SET deleted_at = now(), updated_at = now()
      WHERE installation_id = $1 AND deleted_at IS NULL
      RETURNING installation_id, deleted_at`,
    [installationId]
  );
  return rows[0] || null;
}

module.exports = {
  listInstallations,
  findInstallation,
  findInstallationComposite,
  createInstallation,
  replaceInstallation,
  softDeleteInstallation,
};

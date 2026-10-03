// Loads a deterministic, foreign-key-consistent dataset (coursework brief §4).
// It can be re-run: it empties every table and reloads, all in one transaction.
// A fixed RNG seed means the same provinces, substations, installations and secrets are produced every run;
// only the reading timestamps move, because the 7 days always end at the latest 15-minute slot.
// Run with: npm run seed

const fs = require('node:fs');
const path = require('node:path');
const bcrypt = require('bcryptjs');
const { pool, insertMany } = require('../src/db/pool');
const { SLOT_MS, READING_COLUMNS, createRng, floorToSlot, simulateReading } = require('../src/simulation/reading-simulator');

const RNG_SEED = 2026;
const HISTORY_DAYS = 7;
const INSTALLATION_COUNT = 220;
const BCRYPT_ROUNDS = 10;
const DAY_MS = 24 * 60 * 60 * 1000;

// Sri Lanka's 9 provinces and 25 districts, each district with its grid substations (named after local towns).
// Districts are numbered in the Department of Census and Statistics order: DT-01 Colombo ... DT-25 Kegalle.
const GEOGRAPHY = [
  { province: 'Western Province', districts: { Colombo: ['Kolonnawa', 'Dehiwala', 'Maharagama'], Gampaha: ['Biyagama', 'Negombo'], Kalutara: ['Panadura'] } },
  { province: 'Central Province', districts: { Kandy: ['Kiribathkumbura', 'Pallekele'], Matale: ['Ukuwela'], 'Nuwara Eliya': ['Nuwara Eliya'] } },
  { province: 'Southern Province', districts: { Galle: ['Galle'], Matara: ['Matara'], Hambantota: ['Hambantota'] } },
  { province: 'Northern Province', districts: { Jaffna: ['Chunnakam'], Mannar: ['Mannar'], Vavuniya: ['Vavuniya'], Mullaitivu: ['Mullaitivu'], Kilinochchi: ['Kilinochchi'] } },
  { province: 'Eastern Province', districts: { Batticaloa: ['Batticaloa'], Ampara: ['Ampara'], Trincomalee: ['Trincomalee'] } },
  { province: 'North Western Province', districts: { Kurunegala: ['Kurunegala', 'Kuliyapitiya'], Puttalam: ['Puttalam'] } },
  { province: 'North Central Province', districts: { Anuradhapura: ['Anuradhapura'], Polonnaruwa: ['Polonnaruwa'] } },
  { province: 'Uva Province', districts: { Badulla: ['Badulla'], Monaragala: ['Monaragala'] } },
  { province: 'Sabaragamuwa Province', districts: { Ratnapura: ['Ratnapura'], Kegalle: ['Kegalle'] } },
];

const CAPACITIES_KW = [3, 3, 4, 5, 5, 5, 6, 8, 10, 10, 12, 15, 20]; // typical rooftop sizes; small systems are most common
const STREETS = ['Temple Road', 'Station Road', 'Main Street', 'Lake Road', 'School Lane', 'Church Road', 'Hospital Road', 'Galle Road', 'Kandy Road', 'Park Avenue'];

// Coursework test accounts only (listed in docs/test-credentials.md). Colombo is DT-01 and Gampaha is DT-02.
const USERS = [
  { user_id: 'USR-001', username: 'national.analyst', password: 'SolarNational26', role: 'national', jurisdiction_id: null },
  { user_id: 'USR-002', username: 'western.operator', password: 'SolarWestern26', role: 'provincial', jurisdiction_id: 'PV-01' },
  { user_id: 'USR-003', username: 'colombo.operator', password: 'SolarColombo26', role: 'district', jurisdiction_id: 'DT-01' },
  { user_id: 'USR-004', username: 'gampaha.operator', password: 'SolarGampaha26', role: 'district', jurisdiction_id: 'DT-02' },
  { user_id: 'USR-005', username: 'slsea.admin', password: 'SolarAdmin26', role: 'admin', jurisdiction_id: null },
];

const pad = (number, width) => String(number).padStart(width, '0');
const pick = (rng, list) => list[Math.floor(rng() * list.length)];

function randomHex(rng, length) {
  let hex = '';
  while (hex.length < length) hex += Math.floor(rng() * 16).toString(16);
  return hex;
}

function buildHierarchy() {
  const provinces = [];
  const districts = [];
  const substations = [];
  GEOGRAPHY.forEach((entry, index) => {
    const province_id = `PV-${pad(index + 1, 2)}`;
    provinces.push({ province_id, name: entry.province });
    for (const [districtName, towns] of Object.entries(entry.districts)) {
      const district_id = `DT-${pad(districts.length + 1, 2)}`;
      districts.push({ district_id, name: districtName, province_id });
      for (const town of towns) {
        substations.push({ substation_id: `SS-${pad(substations.length + 1, 3)}`, name: `${town} Grid Substation`, district_id, town });
      }
    }
  });
  return { provinces, districts, substations };
}

function buildInstallations(rng, substations) {
  const installations = [];
  const deviceSecrets = [];
  for (let n = 1; n <= INSTALLATION_COUNT; n++) {
    const substation = substations[(n - 1) % substations.length]; // round-robin: every substation gets 7 or 8 sites
    const installation_id = `INS-${pad(n, 4)}`;
    const deviceSecret = randomHex(rng, 32);
    const commissionedOn = new Date(Date.UTC(2016, 0, 1) + Math.floor(rng() * 3650) * DAY_MS); // 2016 to 2025

    installations.push({
      installation_id,
      meter_id: `MTR-${100000 + n}`,
      substation_id: substation.substation_id,
      capacity_kw: pick(rng, CAPACITIES_KW),
      address: `No. ${1 + Math.floor(rng() * 250)}, ${pick(rng, STREETS)}, ${substation.town}`,
      commissioned_on: commissionedOn.toISOString().slice(0, 10),
      device_secret_hash: bcrypt.hashSync(deviceSecret, BCRYPT_ROUNDS),
    });
    deviceSecrets.push({ installation_id, meter_id: `MTR-${100000 + n}`, substation: substation.name, deviceSecret });
  }
  return { installations, deviceSecrets };
}

// 7 days of readings every 15 minutes (672 per installation), ending at the latest 15-minute slot before `now`.
function buildReadings(rng, installations, now) {
  const lastSlot = floorToSlot(now).getTime();
  const firstSlot = lastSlot - HISTORY_DAYS * DAY_MS + SLOT_MS;
  const readings = [];
  for (const installation of installations) {
    // Start the meter at a realistic lifetime total: capacity x days in service x about 4 kWh per kW per day.
    const daysInService = (firstSlot - Date.parse(installation.commissioned_on)) / DAY_MS;
    let energyKwh = Math.round(installation.capacity_kw * daysInService * (3.5 + rng()));
    for (let t = firstSlot; t <= lastSlot; t += SLOT_MS) {
      const reading = simulateReading(installation, new Date(t), energyKwh, rng);
      energyKwh = reading.energy_kwh;
      readings.push(reading);
    }
  }
  return readings;
}

function writeTestCredentials(provinces, districts, deviceSecrets) {
  const names = new Map([
    ...provinces.map((province) => [province.province_id, province.name]),
    ...districts.map((district) => [district.district_id, district.name]),
  ]);
  const lines = [
    '# Test credentials',
    '',
    '> Coursework test data only, generated by `npm run seed`. These accounts and secrets exist only in the seeded',
    '> database. A real deployment would issue each device a random secret once and never store it in plain text.',
    '',
    '## SLSEA users (token request with `grant_type: password`)',
    '',
    '| user_id | username | password | role | jurisdiction |',
    '|---|---|---|---|---|',
    ...USERS.map((u) => `| ${u.user_id} | ${u.username} | ${u.password} | ${u.role} | ${u.jurisdiction_id ? `${names.get(u.jurisdiction_id)} (${u.jurisdiction_id})` : 'all of Sri Lanka'} |`),
    '',
    '## Metering devices (token request with `grant_type: device`)',
    '',
    '| installation_id | meter_id | substation | device_secret |',
    '|---|---|---|---|',
    ...deviceSecrets.map((d) => `| ${d.installation_id} | ${d.meter_id} | ${d.substation} | ${d.deviceSecret} |`),
    '',
  ];
  const docsDir = path.join(__dirname, '..', 'docs');
  fs.mkdirSync(docsDir, { recursive: true });
  fs.writeFileSync(path.join(docsDir, 'test-credentials.md'), lines.join('\n'));
}

async function seed() {
  const now = new Date();
  const rng = createRng(RNG_SEED);

  console.log('Building the dataset (hashing device secrets takes a few seconds)...');
  const { provinces, districts, substations } = buildHierarchy();
  const { installations, deviceSecrets } = buildInstallations(rng, substations);
  const readings = buildReadings(rng, installations, now);
  const users = USERS.map((u) => ({ ...u, password_hash: bcrypt.hashSync(u.password, BCRYPT_ROUNDS) }));

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Empty everything so the script can be re-run. Readings are append-only through the API;
    // only this development tool ever removes them.
    await client.query('TRUNCATE readings, installations, substations, districts, provinces, users RESTART IDENTITY');
    await insertMany(client, 'provinces', ['province_id', 'name'], provinces);
    await insertMany(client, 'districts', ['district_id', 'name', 'province_id'], districts);
    await insertMany(client, 'substations', ['substation_id', 'name', 'district_id'], substations);
    await insertMany(client, 'installations', ['installation_id', 'meter_id', 'substation_id', 'capacity_kw', 'address', 'commissioned_on', 'device_secret_hash'], installations);
    console.log(`Inserting ${readings.length} readings...`);
    await insertMany(client, 'readings', READING_COLUMNS, readings);
    await insertMany(client, 'users', ['user_id', 'username', 'password_hash', 'role', 'jurisdiction_id'], users);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  writeTestCredentials(provinces, districts, deviceSecrets);
  console.log(
    `Seeded ${provinces.length} provinces, ${districts.length} districts, ${substations.length} substations, ` +
      `${installations.length} installations, ${readings.length} readings and ${users.length} users.`
  );
  console.log('Test credentials written to docs/test-credentials.md');
}

seed()
  .catch((err) => {
    console.error('Seeding failed:', err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());

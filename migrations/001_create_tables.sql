-- 001: the data model (design guidelines §3), implemented from the domain model:
--   Province 1-* District 1-* GridSubstation 1-* SolarInstallation 1-* GenerationReading
--   User (role + jurisdiction): reads data inside its jurisdiction.

CREATE TABLE provinces (
  province_id text PRIMARY KEY,            -- e.g. PV-01
  name        text NOT NULL UNIQUE
);

CREATE TABLE districts (
  district_id text PRIMARY KEY,            -- e.g. DT-01
  name        text NOT NULL UNIQUE,
  province_id text NOT NULL REFERENCES provinces (province_id)
);

CREATE TABLE substations (
  substation_id text PRIMARY KEY,          -- e.g. SS-001
  name          text NOT NULL,
  district_id   text NOT NULL REFERENCES districts (district_id)
);

-- A rooftop solar site. meter_id is an attribute of the installation, not a separate Device entity:
-- each site has exactly one meter, which exists only to report for that site.
-- There are deliberately no last_power / last_energy columns: the current state is derived from readings.
CREATE TABLE installations (
  installation_id    text PRIMARY KEY,     -- e.g. INS-0001
  meter_id           text NOT NULL UNIQUE,
  substation_id      text NOT NULL REFERENCES substations (substation_id),
  capacity_kw        double precision NOT NULL CHECK (capacity_kw > 0),
  address            text,                 -- optional
  commissioned_on    date,                 -- optional
  device_secret_hash text NOT NULL,        -- bcrypt hash; the plain device secret is never stored
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  deleted_at         timestamptz           -- soft delete: set instead of removing the row, so readings keep their owner
);

-- Append-only time series: one row per meter report, never updated or deleted through the API.
CREATE TABLE readings (
  reading_id      bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,  -- bigint: a national fleet at 96 readings a day outgrows a 32-bit int
  installation_id text NOT NULL REFERENCES installations (installation_id),  -- no ON DELETE CASCADE: history is kept
  timestamp       timestamptz NOT NULL,    -- when the meter measured (device clock); used for analytics
  received_at     timestamptz NOT NULL DEFAULT now(),  -- when the server received it; audit, and shows late or buffered uploads
  power_kw        double precision NOT NULL CHECK (power_kw >= 0),    -- instantaneous power
  energy_kwh      double precision NOT NULL CHECK (energy_kwh >= 0),  -- cumulative meter total; never decreases
  voltage_v       double precision NOT NULL CHECK (voltage_v >= 0),
  -- At most one reading per installation per instant, so a repeated upload is rejected.
  -- The index this constraint creates on (installation_id, timestamp) also serves every history and
  -- latest-reading query, so no separate index is needed.
  UNIQUE (installation_id, timestamp)
);

-- SLSEA people who read data. jurisdiction_id holds a province_id (provincial users), a district_id
-- (district users) or NULL (national and admin users, who see everything). It has no foreign key because it
-- can point at either table; the CHECK makes sure it is set exactly when the role needs it.
CREATE TABLE users (
  user_id         text PRIMARY KEY,        -- e.g. USR-001
  username        text NOT NULL UNIQUE,
  password_hash   text NOT NULL,           -- bcrypt hash
  role            text NOT NULL CHECK (role IN ('national', 'provincial', 'district', 'admin')),
  jurisdiction_id text,
  CHECK ((role IN ('provincial', 'district')) = (jurisdiction_id IS NOT NULL))
);

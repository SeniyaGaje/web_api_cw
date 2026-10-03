-- 002: give the seed-managed hierarchy a modification time, so their responses can carry a real
-- Last-Modified header (§8, §10.4). Installations already have updated_at; readings use received_at.
-- Existing rows get the time this migration runs.

ALTER TABLE provinces   ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE districts   ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE substations ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();

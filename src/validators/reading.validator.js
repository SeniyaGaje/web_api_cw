// Checks a reading pushed by a meter (POST .../readings) and the query string of the readings history (GET .../readings).
const ApiError = require('../utils/api-error');
const { isFiniteNumber, parseDateTime, parseDateOrDateTime, requireObjectBody } = require('../utils/validation');

const READING_FIELDS = ['timestamp', 'power_kw', 'energy_kwh', 'voltage_v'];
const MAX_CLOCK_AHEAD_MS = 5 * 60 * 1000; // a meter's clock may run up to 5 minutes fast
const SORT_OPTIONS = ['timestamp', '-timestamp']; // '-' means newest first

// Returns { timestamp (a Date), power_kw, energy_kwh, voltage_v }.
function validateReading(body, now) {
  requireObjectBody(body);
  const details = [];

  for (const field of Object.keys(body)) {
    if (!READING_FIELDS.includes(field)) details.push({ field, issue: whyNotAllowed(field) });
  }

  const timestamp = parseDateTime(body.timestamp);
  if (!timestamp) {
    details.push({ field: 'timestamp', issue: 'is required: an ISO 8601 date-time with a time zone, e.g. 2026-10-02T10:07:00Z' });
  } else if (timestamp.getTime() > now.getTime() + MAX_CLOCK_AHEAD_MS) {
    details.push({ field: 'timestamp', issue: 'must not be more than 5 minutes in the future' });
  }
  if (!isFiniteNumber(body.power_kw) || body.power_kw < 0) {
    details.push({ field: 'power_kw', issue: 'is required: a number, 0 or more (instantaneous power in kW)' });
  }
  if (!isFiniteNumber(body.energy_kwh) || body.energy_kwh < 0) {
    details.push({ field: 'energy_kwh', issue: 'is required: a number, 0 or more (the meter\'s cumulative total in kWh)' });
  }
  if (!isFiniteNumber(body.voltage_v) || body.voltage_v < 0 || body.voltage_v > 1000) {
    details.push({ field: 'voltage_v', issue: 'is required: a number from 0 to 1000 (volts)' });
  }

  if (details.length > 0) {
    throw new ApiError(400, 'VALIDATION_FAILED', 'The reading is not valid.', details);
  }
  return { timestamp, power_kw: body.power_kw, energy_kwh: body.energy_kwh, voltage_v: body.voltage_v };
}

function whyNotAllowed(field) {
  if (field === 'installation_id') return 'comes from the URI (/installations/{installation-id}/readings), not the body';
  if (field === 'reading_id' || field === 'received_at') return 'is set by the server';
  return 'is not a field of a reading';
}

// ?from= / ?to= (§10.2 time window) and ?sort= (§10.3). Returns { from, to, sort }; from and to may be null.
function parseReadingsQuery(query) {
  const details = [];
  const from = optionalTime(query, 'from', details);
  const to = optionalTime(query, 'to', details);
  const sort = query.sort === undefined ? '-timestamp' : query.sort; // newest first unless asked otherwise

  if (from && to && from > to) {
    details.push({ field: 'from', issue: 'must not be later than to' });
  }
  if (!SORT_OPTIONS.includes(sort)) {
    details.push({ field: 'sort', issue: 'must be timestamp (oldest first) or -timestamp (newest first)' });
  }
  if (details.length > 0) {
    throw new ApiError(400, 'INVALID_QUERY_PARAMETER', 'The query parameters are not valid.', details);
  }
  return { from, to, sort };
}

function optionalTime(query, name, details) {
  if (query[name] === undefined) return null;
  const time = parseDateOrDateTime(query[name]);
  if (!time) {
    details.push({ field: name, issue: 'must be an ISO 8601 date (2026-10-01) or date-time with a time zone (2026-10-01T06:00:00Z)' });
  }
  return time;
}

module.exports = { validateReading, parseReadingsQuery };

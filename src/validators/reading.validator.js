// Checks a reading pushed by a meter (POST .../readings).
const ApiError = require('../utils/api-error');
const { isFiniteNumber, parseDateTime, requireObjectBody } = require('../utils/validation');

const READING_FIELDS = ['timestamp', 'power_kw', 'energy_kwh', 'voltage_v'];
const MAX_CLOCK_AHEAD_MS = 5 * 60 * 1000; // a meter's clock may run up to 5 minutes fast
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

module.exports = { validateReading };

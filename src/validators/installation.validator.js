// Checks the body of POST /installations (create) and PUT /installations/{installation-id} (full replacement).
// Every problem is collected, so the client sees all of them in one 400 response.
const ApiError = require('../utils/api-error');
const { isFiniteNumber, isCalendarDate, requireObjectBody } = require('../utils/validation');

const CREATE_FIELDS = ['meter_id', 'substation_id', 'capacity_kw', 'address', 'commissioned_on', 'device_secret'];
const REPLACE_FIELDS = ['meter_id', 'substation_id', 'capacity_kw', 'address', 'commissioned_on'];

// Returns the clean installation fields (optional ones that were left out become null).
// `creating` is true for POST and false for PUT.
function validateInstallation(body, { creating }) {
  requireObjectBody(body);
  const details = [];

  const allowed = creating ? CREATE_FIELDS : REPLACE_FIELDS;
  for (const field of Object.keys(body)) {
    if (!allowed.includes(field)) details.push({ field, issue: whyNotAllowed(field, creating) });
  }

  if (typeof body.meter_id !== 'string' || !/^[A-Za-z0-9-]{3,40}$/.test(body.meter_id)) {
    details.push({ field: 'meter_id', issue: 'is required: 3 to 40 letters, digits or hyphens' });
  }
  if (typeof body.substation_id !== 'string' || body.substation_id.trim() === '') {
    details.push({ field: 'substation_id', issue: 'is required: the id of an existing substation, e.g. SS-001' });
  }
  if (!isFiniteNumber(body.capacity_kw) || body.capacity_kw <= 0 || body.capacity_kw > 1000) {
    details.push({ field: 'capacity_kw', issue: 'is required: a number of kW greater than 0 and at most 1000' });
  }
  if (body.address != null && (typeof body.address !== 'string' || body.address.length > 200)) {
    details.push({ field: 'address', issue: 'must be text of at most 200 characters, or null' });
  }
  if (body.commissioned_on != null && !isCalendarDate(body.commissioned_on)) {
    details.push({ field: 'commissioned_on', issue: 'must be a date in YYYY-MM-DD form, or null' });
  }
  if (creating && (typeof body.device_secret !== 'string' || body.device_secret.length < 16 || body.device_secret.length > 200)) {
    details.push({ field: 'device_secret', issue: 'is required: the secret the meter will log in with, 16 to 200 characters' });
  }

  if (details.length > 0) {
    throw new ApiError(400, 'VALIDATION_FAILED', 'The installation is not valid.', details);
  }
  return {
    meter_id: body.meter_id,
    substation_id: body.substation_id,
    capacity_kw: body.capacity_kw,
    address: body.address ?? null, // left out -> null (PUT replaces the whole resource)
    commissioned_on: body.commissioned_on ?? null,
    device_secret: creating ? body.device_secret : undefined,
  };
}

function whyNotAllowed(field, creating) {
  if (field === 'installation_id') return 'is assigned by the server and comes from the URI, so it cannot be sent';
  if (field === 'device_secret' && !creating) return 'can only be set when the installation is created';
  if (['created_at', 'updated_at', 'deleted_at'].includes(field)) return 'is set by the server';
  return 'is not a field that can be written';
}

module.exports = { validateInstallation };

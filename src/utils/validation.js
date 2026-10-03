// Small checks shared by the validators and the query-string parsers.
const ApiError = require('./api-error');

// An ISO 8601 date-time that states its time zone, e.g. 2026-10-02T10:15:00Z or 2026-10-02T15:45:00+05:30.
// The zone is required: without it, "10:15" could mean Colombo time or UTC.
const ISO_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?(Z|[+-]\d{2}:\d{2})$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

// '2026-10-02T10:15:00Z' -> Date; anything else -> null.
function parseDateTime(value) {
  if (typeof value !== 'string' || !ISO_DATE_TIME.test(value)) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

// True for a real calendar date written as YYYY-MM-DD ('2026-02-30' is false).
function isCalendarDate(value) {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

// For query parameters that may be a date-time or a plain date ('2026-10-02' means midnight UTC on that day).
function parseDateOrDateTime(value) {
  if (isCalendarDate(value)) return new Date(`${value}T00:00:00Z`);
  return parseDateTime(value);
}

// Reads an optional filter such as ?province-id=PV-01. Missing -> null (no filtering).
function optionalFilter(query, name) {
  const value = query[name];
  if (value === undefined) return null;
  if (typeof value !== 'string' || value.trim() === '') {
    throw new ApiError(400, 'INVALID_QUERY_PARAMETER', `The ${name} filter is not valid.`, [
      { field: name, issue: 'must be given once, as a non-empty identifier' },
    ]);
  }
  return value;
}

// The request body must be a JSON object such as { "power_kw": 1.2 }, not an array, a number or nothing at all.
function requireObjectBody(body) {
  if (!isPlainObject(body)) {
    throw new ApiError(400, 'VALIDATION_FAILED', 'The request body must be a JSON object.', [
      { field: 'body', issue: 'must be a JSON object, sent with Content-Type: application/json' },
    ]);
  }
}

module.exports = {
  isPlainObject,
  isFiniteNumber,
  parseDateTime,
  isCalendarDate,
  parseDateOrDateTime,
  optionalFilter,
  requireObjectBody,
};

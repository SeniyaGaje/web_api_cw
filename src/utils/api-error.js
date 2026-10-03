// The one error type used across the API (§11). Code anywhere can `throw new ApiError(...)`;
// the central error handler (middleware/error-handler.js) turns it into the standard error body
// with the matching status code.
class ApiError extends Error {
  // status:  the HTTP status code, e.g. 404
  // code:    a stable, machine-readable string, e.g. 'RESOURCE_NOT_FOUND'
  // message: a sentence for humans
  // details: a list of { field, issue } objects saying exactly what was wrong (may be empty)
  constructor(status, code, message, details = []) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

module.exports = ApiError;

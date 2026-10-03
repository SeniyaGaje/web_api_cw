const ApiError = require('../utils/api-error');

// §10.1 / §9 406: this API produces only application/json. A client whose Accept header rules JSON out
// (for example Accept: application/xml) gets 406 Not Acceptable. No Accept header, or */*, is fine.
function requireJsonAcceptable(req, res, next) {
  if (!req.accepts('application/json')) {
    throw new ApiError(406, 'NOT_ACCEPTABLE', 'This API only produces application/json.', [
      { field: 'Accept', issue: `"${req.get('Accept')}" does not allow application/json` },
    ]);
  }
  next();
}

// §9 415: request bodies must be JSON. A request that carries a body with another Content-Type
// (for example text/plain or a form) gets 415 Unsupported Media Type before anything tries to read it.
function requireJsonBody(req, res, next) {
  const hasBody = Number(req.get('Content-Length') || 0) > 0 || req.get('Transfer-Encoding') !== undefined;
  if (hasBody && !req.is('application/json')) {
    throw new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Request bodies must be sent as application/json.', [
      { field: 'Content-Type', issue: `"${req.get('Content-Type') || '(none)'}" is not application/json` },
    ]);
  }
  next();
}

module.exports = { requireJsonAcceptable, requireJsonBody };

const ApiError = require('../utils/api-error');

// §11: every error the API returns has the same JSON body:
//   {
//     "code":      a stable, machine-readable string clients can rely on, e.g. "RESOURCE_NOT_FOUND"
//     "message":   a sentence for humans
//     "details":   a list of { field, issue } saying exactly what was wrong (empty when there is nothing more to say)
//     "more_info": where to read more (the API documentation)
//   }

// Registered after every route: a request nothing matched gets a 404 in the standard error body.
function routeNotFound(req, res, next) {
  next(new ApiError(404, 'ROUTE_NOT_FOUND', `There is no resource at ${req.method} ${req.path}.`));
}

// Express calls this for every error thrown in any route or middleware (it recognises an error handler by its
// four parameters, so `next` must stay in the list even though it is not used). It is the only place error
// responses are written.
function errorHandler(err, req, res, next) {
  const error = toApiError(err);
  if (error.status >= 500) console.error(err); // a bug or outage: log the full error, but don't send it to the client
  // §12: a 401 must say how to authenticate.
  if (error.status === 401 && !res.get('WWW-Authenticate')) res.set('WWW-Authenticate', 'Bearer realm="slsea-api"');
  res.status(error.status).json({
    code: error.code,
    message: error.message,
    details: error.details,
    more_info: '/api-docs',
  });
}

// Our own ApiErrors pass straight through. Errors from express.json() (reading the request body) are translated,
// and anything unexpected becomes a 500 that reveals nothing about the server's internals.
function toApiError(err) {
  if (err instanceof ApiError) return err;
  if (err.type === 'entity.parse.failed') {
    return new ApiError(400, 'MALFORMED_JSON', 'The request body is not valid JSON.', [{ field: 'body', issue: err.message }]);
  }
  if (err.type === 'entity.too.large') {
    return new ApiError(413, 'PAYLOAD_TOO_LARGE', 'The request body is larger than the 100 kB limit.');
  }
  if (err.type === 'charset.unsupported' || err.type === 'encoding.unsupported') {
    return new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', 'The request body must be UTF-8 encoded JSON.');
  }
  return new ApiError(500, 'INTERNAL_ERROR', 'Something went wrong on the server. Please try again later.');
}

module.exports = { routeNotFound, errorHandler };

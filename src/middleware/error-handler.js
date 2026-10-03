const ApiError = require('../utils/api-error');

// Every error the API returns has the same JSON body: { code, message, details }.

// Registered after every route: a request nothing matched gets a 404.
function routeNotFound(req, res, next) {
  next(new ApiError(404, 'ROUTE_NOT_FOUND', `There is no resource at ${req.method} ${req.path}.`));
}

// Express calls this for every error thrown in any route or middleware (it recognises an error handler by its
// four parameters, so `next` must stay in the list even though it is not used).
function errorHandler(err, req, res, next) {
  let error = err;
  if (err.type === 'entity.parse.failed') {
    error = new ApiError(400, 'MALFORMED_JSON', 'The request body is not valid JSON.');
  } else if (!(err instanceof ApiError)) {
    console.error(err); // a bug or outage: log the full error, but don't send it to the client
    error = new ApiError(500, 'INTERNAL_ERROR', 'Something went wrong on the server.');
  }
  res.status(error.status).json({ code: error.code, message: error.message, details: error.details });
}

module.exports = { routeNotFound, errorHandler };

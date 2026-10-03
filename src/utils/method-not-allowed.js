const ApiError = require('./api-error');

// §7 / §9 405: a URI that exists but does not support the method used. The answer lists the methods it does
// support in an Allow header. For example, readings are append-only, so PUT or DELETE on a reading is refused.
// Used as the last handler for each path: router.all('/path', methodNotAllowed('GET')).
function methodNotAllowed(...allowed) {
  const allow = allowed.includes('GET') ? [...allowed, 'HEAD'] : allowed; // Express answers HEAD wherever GET exists
  return (req, res) => {
    res.set('Allow', allow.join(', '));
    throw new ApiError(405, 'METHOD_NOT_ALLOWED', `${req.method} is not supported on this resource.`, [
      { field: 'method', issue: `allowed methods: ${allow.join(', ')}` },
    ]);
  };
}

module.exports = methodNotAllowed;

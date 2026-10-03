const crypto = require('node:crypto');
const ApiError = require('./api-error');

// §8: a representation of an installation carries an ETag - a strong validator: a fingerprint (SHA-256 hash)
// of the exact JSON bytes sent. A client sends it back in If-Match on PUT/DELETE (see checkIfMatch below).

function etagFor(json) {
  return `"${crypto.createHash('sha256').update(json).digest('base64url')}"`;
}

// Sends `body` as JSON with an ETag header.
function sendRepresentation(res, body, status = 200) {
  const json = JSON.stringify(body);
  res.set('ETag', etagFor(json));
  res.status(status).type('application/json').send(json);
}

// §9 412: a PUT or DELETE may send If-Match with the ETag the client last saw. If the resource has changed since
// then, the request is refused, so one client cannot silently overwrite another client's change ("lost update").
// `currentBody` is the representation a GET would return right now.
function checkIfMatch(req, currentBody) {
  const ifMatch = req.get('If-Match');
  if (!ifMatch) return; // If-Match is optional

  const currentEtag = etagFor(JSON.stringify(currentBody));
  const tags = ifMatch.split(',').map((tag) => tag.trim());
  if (!tags.includes('*') && !tags.includes(currentEtag)) {
    throw new ApiError(412, 'PRECONDITION_FAILED', 'The resource has changed since you last retrieved it. GET it again and retry.', [
      { field: 'If-Match', issue: `does not match the current ETag ${currentEtag}` },
    ]);
  }
}

module.exports = { sendRepresentation, checkIfMatch };

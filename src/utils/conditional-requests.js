const crypto = require('node:crypto');
const ApiError = require('./api-error');

// §8 / §10.4: every representation the API sends carries
//   ETag          - a strong validator: a fingerprint (SHA-256 hash) of the exact JSON bytes sent, and
//   Last-Modified - when the data in it last changed.
// A client can send them back (If-None-Match / If-Modified-Since) to ask "has it changed?", and gets an empty
// 304 Not Modified instead of the whole body if it hasn't.

function etagFor(json) {
  return `"${crypto.createHash('sha256').update(json).digest('base64url')}"`;
}

// Sends `body` as JSON with ETag and Last-Modified headers. For GET (and HEAD) with status 200, it answers
// 304 with an empty body instead when the client already holds this exact version.
function sendRepresentation(req, res, body, lastModified, status = 200) {
  const json = JSON.stringify(body);
  const etag = etagFor(json);
  res.set('ETag', etag);
  res.set('Last-Modified', new Date(lastModified).toUTCString());

  const isRead = req.method === 'GET' || req.method === 'HEAD';
  if (status === 200 && isRead && isNotModified(req, etag, lastModified)) {
    return res.status(304).end();
  }
  res.status(status).type('application/json').send(json);
}

// If-None-Match takes priority over If-Modified-Since when a client sends both (RFC 9110 §13.2.2).
function isNotModified(req, etag, lastModified) {
  const ifNoneMatch = req.get('If-None-Match');
  if (ifNoneMatch) {
    const tags = ifNoneMatch.split(',').map((tag) => tag.trim());
    return tags.some((tag) => tag === '*' || tag === etag || tag === `W/${etag}`);
  }

  const ifModifiedSince = Date.parse(req.get('If-Modified-Since') || '');
  if (!Number.isNaN(ifModifiedSince)) {
    const lastModifiedSeconds = Math.floor(new Date(lastModified).getTime() / 1000) * 1000; // HTTP dates have no milliseconds
    return lastModifiedSeconds <= ifModifiedSince;
  }
  return false;
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

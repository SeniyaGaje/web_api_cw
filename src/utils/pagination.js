const ApiError = require('./api-error');
const { sendRepresentation } = require('./conditional-requests');

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 500;

// §10.2 pagination: ?limit= is how many items to return (1-500, default 50) and ?offset= how many to skip
// (default 0). Every collection in the API uses the same two parameters.
function parsePagination(query) {
  const limit = parseWholeNumber(query.limit, DEFAULT_LIMIT);
  const offset = parseWholeNumber(query.offset, 0);

  const details = [];
  if (limit === null || limit < 1 || limit > MAX_LIMIT) {
    details.push({ field: 'limit', issue: `must be a whole number from 1 to ${MAX_LIMIT}` });
  }
  if (offset === null) {
    details.push({ field: 'offset', issue: 'must be a whole number, 0 or more' });
  }
  if (details.length > 0) {
    throw new ApiError(400, 'INVALID_QUERY_PARAMETER', 'The pagination parameters are not valid.', details);
  }
  return { limit, offset };
}

// '25' -> 25; missing -> the default; anything else ('abc', '-1', '2.5', a repeated parameter) -> null.
function parseWholeNumber(value, fallback) {
  if (value === undefined) return fallback;
  return typeof value === 'string' && /^\d{1,9}$/.test(value) ? Number(value) : null;
}

// Sends one page of a collection in the envelope every collection uses:
//   count    - the total number of matching items (not just this page)
//   next     - link to the following page, or null on the last page
//   previous - link to the page before, or null on the first page
//   results  - the items on this page
// `page` is what a repository list function returns: { count, lastModified, results }.
function sendPage(req, res, page, { limit, offset }) {
  const body = {
    count: page.count,
    next: offset + limit < page.count ? pageLink(req, limit, offset + limit) : null,
    previous: offset > 0 ? pageLink(req, limit, Math.max(0, offset - limit)) : null,
    results: page.results,
  };
  // Last-Modified: the newest change among the matching items. An empty collection has none, so "now" is used.
  sendRepresentation(req, res, body, page.lastModified || new Date());
}

// The same URL the client called, with only limit and offset changed, so filters and sorting carry over.
function pageLink(req, limit, offset) {
  const url = new URL(req.originalUrl, 'http://localhost'); // the host is only needed to parse; it is dropped below
  url.searchParams.set('limit', limit);
  url.searchParams.set('offset', offset);
  return url.pathname + url.search;
}

module.exports = { parsePagination, sendPage };

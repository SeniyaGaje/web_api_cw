// §12 security: bearer tokens (401), scopes for the write-read split (403) and jurisdiction scoping (403).
const jwt = require('jsonwebtoken');
const config = require('../config/env');
const ApiError = require('../utils/api-error');
const districts = require('../repositories/districts.repository');
const substations = require('../repositories/substations.repository');

// 401 without a valid token. On success, req.auth holds the token's claims.
function authenticate(req, res, next) {
  const [type, token] = (req.get('Authorization') || '').split(' ');
  if (type !== 'Bearer' || !token) {
    throw new ApiError(401, 'AUTHENTICATION_REQUIRED', 'Send a bearer token. Get one from POST /api/v1/tokens.');
  }
  try {
    req.auth = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });
  } catch {
    res.set('WWW-Authenticate', 'Bearer realm="slsea-api", error="invalid_token"');
    throw new ApiError(401, 'INVALID_TOKEN', 'The token is invalid or has expired.');
  }
  next();
}

// 403 when the token is valid but lacks the scope. Devices only have readings:write, users never have it.
function requireScope(scope) {
  return (req, res, next) => {
    if (!req.auth.scope.split(' ').includes(scope)) {
      res.set('WWW-Authenticate', `Bearer realm="slsea-api", error="insufficient_scope", scope="${scope}"`);
      throw new ApiError(403, 'INSUFFICIENT_SCOPE', `This request needs the ${scope} scope.`);
    }
    next();
  };
}

// True if `place` ({ province_id, district_id }) is inside the user's jurisdiction.
// National and admin tokens carry neither id, so they see everything.
// A province record has no district_id, so a district user can still read their own province.
function isInside(auth, place) {
  if (auth.province_id && place.province_id !== auth.province_id) return false;
  if (auth.district_id && 'district_id' in place && place.district_id !== auth.district_id) return false;
  return true;
}

function requireJurisdiction(req, place) {
  if (!isInside(req.auth, place)) {
    throw new ApiError(403, 'OUTSIDE_JURISDICTION', 'This resource is outside your jurisdiction.');
  }
}

// Collection filters combined with the jurisdiction: a filter outside it is 403,
// and a missing filter falls back to the user's own province / district.
async function jurisdictionFilters(req, { provinceId = null, districtId = null, substationId = null }) {
  if (provinceId) requireJurisdiction(req, { province_id: provinceId });
  if (districtId) {
    const district = await districts.findDistrict(districtId);
    if (district) requireJurisdiction(req, district);
  }
  if (substationId) {
    const substation = await substations.findSubstation(substationId);
    if (substation) requireJurisdiction(req, substation);
  }
  return {
    provinceId: provinceId || req.auth.province_id || null,
    districtId: districtId || req.auth.district_id || null,
    substationId,
  };
}

module.exports = { authenticate, requireScope, requireJurisdiction, jurisdictionFilters };

// /api/v1/tokens - §4.5 processing function: swaps credentials for a JWT (§12). Tokens are not stored.
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('../config/env');
const ApiError = require('../utils/api-error');
const { requireObjectBody } = require('../utils/validation');
const methodNotAllowed = require('../utils/method-not-allowed');
const installations = require('../repositories/installations.repository');
const users = require('../repositories/users.repository');

const TOKEN_LIFETIME_SECONDS = 3600;

const router = express.Router();

router.post('/', async (req, res) => {
  requireObjectBody(req.body);
  let claims;
  if (req.body.grant_type === 'device') claims = await deviceClaims(req.body);
  else if (req.body.grant_type === 'password') claims = await userClaims(req.body);
  else throw invalidRequest('grant_type', 'must be device or password');

  const accessToken = jwt.sign(claims, config.jwtSecret, { algorithm: 'HS256', expiresIn: TOKEN_LIFETIME_SECONDS });
  res.set('Cache-Control', 'no-store'); // a token must never be cached
  res.json({ access_token: accessToken, token_type: 'Bearer', expires_in: TOKEN_LIFETIME_SECONDS });
});
router.all('/', methodNotAllowed('POST'));

// A meter authenticates as its installation and may only push readings.
async function deviceClaims({ installation_id: installationId, device_secret: secret }) {
  requireString('installation_id', installationId);
  requireString('device_secret', secret);
  const hash = await installations.findDeviceSecretHash(installationId);
  if (!hash || !(await bcrypt.compare(secret, hash))) throw badCredentials();
  return { sub: installationId, scope: 'readings:write' };
}

// An SLSEA user may only read, inside their jurisdiction. Admins may also manage installations.
async function userClaims({ username, password }) {
  requireString('username', username);
  requireString('password', password);
  const user = await users.findUserByUsername(username);
  if (!user || !(await bcrypt.compare(password, user.password_hash))) throw badCredentials();
  return {
    sub: user.user_id,
    role: user.role,
    province_id: user.province_id,
    district_id: user.district_id,
    scope: user.role === 'admin' ? 'generation:read installations:write' : 'generation:read',
  };
}

function requireString(field, value) {
  if (typeof value !== 'string' || value === '') throw invalidRequest(field, 'is required');
}

function invalidRequest(field, issue) {
  return new ApiError(400, 'VALIDATION_FAILED', 'The token request is not valid.', [{ field, issue }]);
}

// Same message for a wrong id and a wrong secret, so the response does not reveal which accounts exist.
function badCredentials() {
  return new ApiError(401, 'INVALID_CREDENTIALS', 'The credentials are not valid.');
}

module.exports = router;

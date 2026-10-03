// /api/v1/installations - the solar sites. The collection is a factory for new installations (§4.2, §7.3);
// each member can be read, replaced (PUT) or deleted (soft delete).
const express = require('express');
const bcrypt = require('bcryptjs');
const ApiError = require('../utils/api-error');
const { sendRepresentation, checkIfMatch } = require('../utils/conditional-requests');
const { validateInstallation } = require('../validators/installation.validator');
const installations = require('../repositories/installations.repository');
const substations = require('../repositories/substations.repository');

const router = express.Router();

// §4.2 collection resource: all active installations.
router.get('/', async (req, res) => {
  res.json(await installations.listInstallations());
});

// §7.3: POST to a collection creates a new member -> 201 Created and a Location header saying where the new
// installation now lives.
router.post('/', async (req, res) => {
  const input = validateInstallation(req.body, { creating: true });
  await requireSubstation(input.substation_id);
  const deviceSecretHash = await bcrypt.hash(input.device_secret, 10); // the plain secret is never stored

  let installationId;
  try {
    installationId = await installations.createInstallation(input, deviceSecretHash);
  } catch (err) {
    throw conflictError(err);
  }

  const created = await installations.findInstallationComposite(installationId);
  res.location(`/api/v1/installations/${installationId}`);
  sendRepresentation(res, created, 201);
});

// §4.3 composite resource: the installation, where it sits in the hierarchy, and its latest reading.
router.get('/:installationId', async (req, res) => {
  sendRepresentation(res, await findCompositeOr404(req.params.installationId));
});

// §7.2 PUT replaces the whole installation (it is not a partial update: optional fields that are left out are
// cleared). It is idempotent: sending the same body twice leaves the same result. If-Match is honoured (412).
router.put('/:installationId', async (req, res) => {
  const input = validateInstallation(req.body, { creating: false });
  const current = await findCompositeOr404(req.params.installationId);
  checkIfMatch(req, current);
  await requireSubstation(input.substation_id);

  try {
    await installations.replaceInstallation(req.params.installationId, input);
  } catch (err) {
    throw conflictError(err);
  }

  sendRepresentation(res, await findCompositeOr404(req.params.installationId));
});

// §7.4 DELETE: a soft delete. The installation disappears from the API (a second DELETE, or any GET, is 404),
// but its readings are kept as history; they are never cascade-deleted. If-Match is honoured (412).
router.delete('/:installationId', async (req, res) => {
  const current = await findCompositeOr404(req.params.installationId);
  checkIfMatch(req, current);
  const deleted = await installations.softDeleteInstallation(req.params.installationId);
  if (!deleted) throw notFound(req.params.installationId); // deleted by someone else a moment ago

  res.json({
    installation_id: deleted.installation_id,
    deleted_at: deleted.deleted_at,
    message: 'The installation was deleted. Its readings are kept as history.',
  });
});

async function findCompositeOr404(installationId) {
  const installation = await installations.findInstallationComposite(installationId);
  if (!installation) throw notFound(installationId);
  return installation;
}

function notFound(installationId) {
  return new ApiError(404, 'RESOURCE_NOT_FOUND', `Installation ${installationId} does not exist.`);
}

// The body names a substation; it must be a real one (a 400, because the problem is in the request body).
async function requireSubstation(substationId) {
  if (!(await substations.findSubstation(substationId))) {
    throw new ApiError(400, 'VALIDATION_FAILED', 'The installation is not valid.', [
      { field: 'substation_id', issue: `substation ${substationId} does not exist` },
    ]);
  }
}

// meter_id is UNIQUE: a second installation with the same meter breaks the constraint (Postgres error 23505).
// That is a conflict with existing state, so 409 rather than 400. Other database errors are passed on unchanged.
function conflictError(err) {
  if (err.code === '23505' && err.constraint === 'installations_meter_id_key') {
    return new ApiError(409, 'METER_ID_IN_USE', 'Another installation already uses this meter_id.', [
      { field: 'meter_id', issue: 'is already registered to another installation' },
    ]);
  }
  if (err.code === '23505' && err.constraint === 'installations_pkey') {
    return new ApiError(409, 'CONFLICT', 'Another installation was created at the same moment. Please retry.');
  }
  return err;
}

module.exports = router;

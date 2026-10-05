// /api/v1/substations - read-only (managed by the seed data), so GET is the only method (§7.1).
const express = require('express');
const ApiError = require('../utils/api-error');
const { parsePagination, sendPage } = require('../utils/pagination');
const { sendRepresentation } = require('../utils/conditional-requests');
const { optionalFilter } = require('../utils/validation');
const methodNotAllowed = require('../utils/method-not-allowed');
const substations = require('../repositories/substations.repository');

const router = express.Router();

// §4.2 collection resource: all grid substations, paginated.
// §10.2 filters: ?province-id=PV-01 and/or ?district-id=DT-01.
router.get('/', async (req, res) => {
  const pagination = parsePagination(req.query);
  const provinceId = optionalFilter(req.query, 'province-id');
  const districtId = optionalFilter(req.query, 'district-id');
  const page = await substations.listSubstations({ provinceId, districtId, ...pagination });
  sendPage(req, res, page, pagination);
});
router.all('/', methodNotAllowed('GET'));

// §4.1 atomic resource: one substation. §9: an unknown id is 404.
router.get('/:substationId', async (req, res) => {
  const row = await substations.findSubstation(req.params.substationId);
  if (!row) throw new ApiError(404, 'RESOURCE_NOT_FOUND', `Substation ${req.params.substationId} does not exist.`);
  const { updated_at: lastModified, ...substation } = row;
  sendRepresentation(req, res, substation, lastModified);
});
router.all('/:substationId', methodNotAllowed('GET'));

module.exports = router;

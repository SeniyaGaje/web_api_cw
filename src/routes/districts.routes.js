// /api/v1/districts - read-only (managed by the seed data), so GET is the only method (§7.1).
const express = require('express');
const ApiError = require('../utils/api-error');
const { parsePagination, sendPage } = require('../utils/pagination');
const { sendRepresentation } = require('../utils/conditional-requests');
const { optionalFilter } = require('../utils/validation');
const methodNotAllowed = require('../utils/method-not-allowed');
const { requireScope, requireJurisdiction, jurisdictionFilters } = require('../middleware/auth');
const districts = require('../repositories/districts.repository');

const router = express.Router();
router.use(requireScope('generation:read'));

// §4.2 collection resource: the districts in the caller's jurisdiction, paginated. §10.2 filter: ?province-id=PV-01.
router.get('/', async (req, res) => {
  const pagination = parsePagination(req.query);
  const filters = await jurisdictionFilters(req, { provinceId: optionalFilter(req.query, 'province-id') });
  const page = await districts.listDistricts({ ...filters, ...pagination });
  sendPage(req, res, page, pagination);
});
router.all('/', methodNotAllowed('GET'));

// §4.1 atomic resource: one district. §9: an unknown id is 404.
router.get('/:districtId', async (req, res) => {
  const { updated_at: lastModified, ...district } = await findDistrictInJurisdiction(req);
  sendRepresentation(req, res, district, lastModified);
});
router.all('/:districtId', methodNotAllowed('GET'));

// §4.5 processing function: the district's current power and today's energy (the operational dashboard view).
router.get('/:districtId/generation-summary', async (req, res) => {
  const district = await findDistrictInJurisdiction(req);
  const summary = await districts.getGenerationSummary(district.district_id);
  sendRepresentation(req, res, summary, summary.as_of);
});
router.all('/:districtId/generation-summary', methodNotAllowed('GET'));

async function findDistrictInJurisdiction(req) {
  const district = await districts.findDistrict(req.params.districtId);
  if (!district) throw new ApiError(404, 'RESOURCE_NOT_FOUND', `District ${req.params.districtId} does not exist.`);
  requireJurisdiction(req, district);
  return district;
}

module.exports = router;

// /api/v1/provinces - read-only (managed by the seed data), so GET is the only method (§7.1).
const express = require('express');
const ApiError = require('../utils/api-error');
const { parsePagination, sendPage } = require('../utils/pagination');
const { sendRepresentation } = require('../utils/conditional-requests');
const methodNotAllowed = require('../utils/method-not-allowed');
const { requireScope, requireJurisdiction, jurisdictionFilters } = require('../middleware/auth');
const provinces = require('../repositories/provinces.repository');

const router = express.Router();
router.use(requireScope('generation:read'));

// §4.2 collection resource: the provinces in the caller's jurisdiction, paginated.
router.get('/', async (req, res) => {
  const pagination = parsePagination(req.query);
  const { provinceId } = await jurisdictionFilters(req, {});
  const page = await provinces.listProvinces({ provinceId, ...pagination });
  sendPage(req, res, page, pagination);
});
router.all('/', methodNotAllowed('GET'));

// §4.1 atomic resource: one province. §9: an unknown id is 404, never 200 with an empty body.
router.get('/:provinceId', async (req, res) => {
  const row = await provinces.findProvince(req.params.provinceId);
  if (!row) throw new ApiError(404, 'RESOURCE_NOT_FOUND', `Province ${req.params.provinceId} does not exist.`);
  requireJurisdiction(req, { province_id: row.province_id });
  const { updated_at: lastModified, ...province } = row; // updated_at feeds Last-Modified; it is not part of the body
  sendRepresentation(req, res, province, lastModified);
});
router.all('/:provinceId', methodNotAllowed('GET'));

module.exports = router;

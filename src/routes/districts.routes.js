// /api/v1/districts - read-only (managed by the seed data), so GET is the only method (§7.1).
const express = require('express');
const ApiError = require('../utils/api-error');
const { parsePagination, sendPage } = require('../utils/pagination');
const { sendRepresentation } = require('../utils/conditional-requests');
const { optionalFilter } = require('../utils/validation');
const methodNotAllowed = require('../utils/method-not-allowed');
const districts = require('../repositories/districts.repository');

const router = express.Router();

// §4.2 collection resource: all districts, paginated. §10.2 filter: ?province-id=PV-01.
router.get('/', async (req, res) => {
  const pagination = parsePagination(req.query);
  const provinceId = optionalFilter(req.query, 'province-id');
  const page = await districts.listDistricts({ provinceId, ...pagination });
  sendPage(req, res, page, pagination);
});
router.all('/', methodNotAllowed('GET'));

// §4.1 atomic resource: one district. §9: an unknown id is 404.
router.get('/:districtId', async (req, res) => {
  const row = await districts.findDistrict(req.params.districtId);
  if (!row) throw new ApiError(404, 'RESOURCE_NOT_FOUND', `District ${req.params.districtId} does not exist.`);
  const { updated_at: lastModified, ...district } = row;
  sendRepresentation(req, res, district, lastModified);
});
router.all('/:districtId', methodNotAllowed('GET'));

module.exports = router;

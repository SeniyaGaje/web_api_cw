// /api/v1/districts - read-only (managed by the seed data), so GET is the only method (§7.1).
const express = require('express');
const ApiError = require('../utils/api-error');
const districts = require('../repositories/districts.repository');

const router = express.Router();

// §4.2 collection resource: all districts.
router.get('/', async (req, res) => {
  res.json(await districts.listDistricts());
});

// §4.1 atomic resource: one district. §9: an unknown id is 404.
router.get('/:districtId', async (req, res) => {
  const district = await districts.findDistrict(req.params.districtId);
  if (!district) throw new ApiError(404, 'RESOURCE_NOT_FOUND', `District ${req.params.districtId} does not exist.`);
  res.json(district);
});

module.exports = router;

// /api/v1/provinces - read-only (managed by the seed data), so GET is the only method (§7.1).
const express = require('express');
const ApiError = require('../utils/api-error');
const provinces = require('../repositories/provinces.repository');

const router = express.Router();

// §4.2 collection resource: all provinces.
router.get('/', async (req, res) => {
  res.json(await provinces.listProvinces());
});

// §4.1 atomic resource: one province. §9: an unknown id is 404, never 200 with an empty body.
router.get('/:provinceId', async (req, res) => {
  const province = await provinces.findProvince(req.params.provinceId);
  if (!province) throw new ApiError(404, 'RESOURCE_NOT_FOUND', `Province ${req.params.provinceId} does not exist.`);
  res.json(province);
});

module.exports = router;

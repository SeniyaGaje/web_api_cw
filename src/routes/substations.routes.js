// /api/v1/substations - read-only (managed by the seed data), so GET is the only method (§7.1).
const express = require('express');
const ApiError = require('../utils/api-error');
const substations = require('../repositories/substations.repository');

const router = express.Router();

// §4.2 collection resource: all grid substations.
router.get('/', async (req, res) => {
  res.json(await substations.listSubstations());
});

// §4.1 atomic resource: one substation. §9: an unknown id is 404.
router.get('/:substationId', async (req, res) => {
  const substation = await substations.findSubstation(req.params.substationId);
  if (!substation) throw new ApiError(404, 'RESOURCE_NOT_FOUND', `Substation ${req.params.substationId} does not exist.`);
  res.json(substation);
});

module.exports = router;

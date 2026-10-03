// Routes under /api/v1/installations/{installation-id}: the installation's readings.
// §4.6 / §5.6: readings only make sense for one installation, so they are a scoped sub-collection here.
// There is deliberately no global /readings collection, and no PUT or DELETE on a reading (append-only).
const express = require('express');
const ApiError = require('../utils/api-error');
const { parsePagination, sendPage } = require('../utils/pagination');
const { sendRepresentation } = require('../utils/conditional-requests');
const methodNotAllowed = require('../utils/method-not-allowed');
const { validateReading, parseReadingsQuery } = require('../validators/reading.validator');
const installations = require('../repositories/installations.repository');
const readings = require('../repositories/readings.repository');

// mergeParams: lets these routes read :installationId from the path this router is mounted on.
const router = express.Router({ mergeParams: true });

// §4.6 scoped collection: the generation history of one installation (the analytical view).
// §10.2 pagination and time window (?from=, ?to=), §10.3 sorting (?sort=timestamp or ?sort=-timestamp).
router.get('/readings', async (req, res) => {
  const pagination = parsePagination(req.query);
  const { from, to, sort } = parseReadingsQuery(req.query);
  await requireInstallation(req.params.installationId);
  const page = await readings.listReadings(req.params.installationId, { from, to, sort, ...pagination });
  sendPage(req, res, page, pagination);
});

// The write path: a meter pushes one new reading. §7.3: POST to the collection creates a member, so the answer is
// 201 Created with a Location header saying where the new reading now lives, plus ETag and Last-Modified.
// The installation comes from the URI, never from the body. The server sets received_at.
router.post('/readings', async (req, res) => {
  const reading = validateReading(req.body, new Date());
  const { installationId } = req.params;
  await requireInstallation(installationId);

  let created;
  try {
    created = await readings.insertReading(installationId, reading);
  } catch (err) {
    // §9 409: this installation already has a reading at that instant (the UNIQUE (installation_id, timestamp) rule).
    if (err.code === '23505') {
      throw new ApiError(409, 'DUPLICATE_READING', `Installation ${installationId} already has a reading at ${reading.timestamp.toISOString()}.`, [
        { field: 'timestamp', issue: 'a reading with this timestamp already exists for this installation' },
      ]);
    }
    throw err;
  }

  res.location(`/api/v1/installations/${installationId}/readings/${created.reading_id}`);
  sendRepresentation(req, res, created, created.received_at, 201);
});
router.all('/readings', methodNotAllowed('GET', 'POST'));

// One reading, so that the Location header returned by POST resolves to a real resource.
router.get('/readings/:readingId', async (req, res) => {
  const { installationId, readingId } = req.params;
  await requireInstallation(installationId);
  // A reading id is a number; anything else cannot exist, so it is simply not found.
  const reading = /^\d{1,18}$/.test(readingId) ? await readings.findReading(installationId, readingId) : null;
  if (!reading) {
    throw new ApiError(404, 'RESOURCE_NOT_FOUND', `Reading ${readingId} does not exist for installation ${installationId}.`);
  }
  sendRepresentation(req, res, reading, reading.received_at);
});
router.all('/readings/:readingId', methodNotAllowed('GET')); // append-only: no PUT, PATCH or DELETE on a reading

// §4.5 processing function resource: the installation's most recent reading (the operational, "right now" view).
// It is derived on every request using the shared latest-reading rule; it is not a stored field.
// Reading fields only, without the installation's own details (for those, GET the installation itself).
router.get('/last-reading', async (req, res) => {
  const { installationId } = req.params;
  await requireInstallation(installationId);
  const latest = await readings.findLatestReading(installationId);
  if (!latest) {
    throw new ApiError(404, 'RESOURCE_NOT_FOUND', `Installation ${installationId} has no readings yet.`);
  }
  sendRepresentation(req, res, latest, latest.received_at);
});
router.all('/last-reading', methodNotAllowed('GET'));

// Readings of an installation that does not exist (or was deleted) are 404, not an empty list.
async function requireInstallation(installationId) {
  if (!(await installations.findInstallation(installationId))) {
    throw new ApiError(404, 'RESOURCE_NOT_FOUND', `Installation ${installationId} does not exist.`);
  }
}

module.exports = router;

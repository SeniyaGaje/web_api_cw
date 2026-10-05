// Everything under /api/v1. URIs follow §5.1: lowercase, hyphenated, plural nouns for collections, no verbs.
const express = require('express');
const { authenticate } = require('../middleware/auth');
const tokensRoutes = require('./tokens.routes');
const provincesRoutes = require('./provinces.routes');
const districtsRoutes = require('./districts.routes');
const substationsRoutes = require('./substations.routes');
const installationsRoutes = require('./installations.routes');
const readingsRoutes = require('./readings.routes');

const router = express.Router();

router.use('/tokens', tokensRoutes); // public: this is where a client gets its token
router.use(authenticate); // §12: every route below needs a valid bearer token

router.use('/provinces', provincesRoutes);
router.use('/districts', districtsRoutes);
router.use('/substations', substationsRoutes);
router.use('/installations', installationsRoutes);
router.use('/installations/:installationId', readingsRoutes); // .../readings, .../readings/{id}, .../last-reading

module.exports = router;

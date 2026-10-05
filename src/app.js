// The Express app. Vercel finds this file (src/app.js), imports it and runs each request through it as a
// serverless function. For local development, src/server.js imports it and listens on a port.
// The order of the app.use() lines below is the order every request passes through.
const express = require('express');
const docsRoutes = require('./routes/docs.routes');
const healthRoutes = require('./routes/health.routes');
const apiRoutes = require('./routes/api.routes');
const { requireJsonAcceptable, requireJsonBody } = require('./middleware/content-negotiation');
const keepReadingsCurrent = require('./middleware/keep-readings-current');
const { routeNotFound, errorHandler } = require('./middleware/error-handler');

const app = express();
app.disable('x-powered-by'); // don't advertise which framework the server runs
app.set('etag', false); // ETags come from utils/conditional-requests.js (strong hashes), not Express's weak ones

// 1. Documentation: the Swagger UI page (HTML) and the raw spec. It comes first so a browser can open it.
app.use(docsRoutes);

// 2. From here on, every response is JSON, so a client that refuses JSON gets 406.
app.use(requireJsonAcceptable);
app.use(healthRoutes);

// 3. The API. Request bodies must be JSON (415 otherwise), are parsed by express.json(), and readings are
//    brought up to date before any route runs.
app.use('/api/v1', requireJsonBody, express.json(), keepReadingsCurrent, apiRoutes);

// 4. A request nothing above matched is a 404, and every error from anywhere above goes through one handler.
app.use(routeNotFound);
app.use(errorHandler);

module.exports = app;

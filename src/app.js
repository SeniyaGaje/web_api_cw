// The Express app. Vercel finds this file (src/app.js), imports it and runs each request through it as a
// serverless function. For local development, src/server.js imports it and listens on a port.
const express = require('express');
const openapi = require('./openapi');
const keepReadingsCurrent = require('./middleware/keep-readings-current');

const SWAGGER_UI_VERSION = '5.33.0';

const app = express();

// Health check, outside /api/v1: shows that the service is up. It doesn't touch the database.
// res.json() sets Content-Type: application/json (§6: JSON is the representation for every resource).
app.get('/', (req, res) => {
  res.json({ status: 'ok' });
});

// Live documentation: the raw OpenAPI spec, and a Swagger UI page that displays it.
// Vercel does not serve files through Express (express.static is ignored there), so the page loads the
// Swagger UI script and stylesheet from the jsDelivr CDN and then reads our spec from /api-docs/openapi.json.
app.get('/api-docs/openapi.json', (req, res) => {
  res.json(openapi);
});
app.get('/api-docs', (req, res) => {
  res.type('html').send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>SLSEA Solar Generation API - Swagger UI</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@${SWAGGER_UI_VERSION}/swagger-ui.css">
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@${SWAGGER_UI_VERSION}/swagger-ui-bundle.js"></script>
  <script>SwaggerUIBundle({ url: '/api-docs/openapi.json', dom_id: '#swagger-ui' });</script>
</body>
</html>`);
});

// Every API request first makes sure the readings are up to date (see the middleware for why).
// The /api/v1 routes are added from increment 2 onwards, after this line.
app.use('/api/v1', keepReadingsCurrent);

module.exports = app;

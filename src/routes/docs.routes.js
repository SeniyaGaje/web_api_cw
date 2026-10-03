const express = require('express');
const openapi = require('../docs/openapi');

const SWAGGER_UI_VERSION = '5.33.0';

const router = express.Router();

// The raw OpenAPI 3 description of the API.
router.get('/api-docs/openapi.json', (req, res) => {
  res.json(openapi);
});

// The Swagger UI page that displays it. Vercel does not serve files through Express (express.static is ignored
// there), so the page loads the Swagger UI script and stylesheet from the jsDelivr CDN, then reads our spec above.
// This is the only response that is HTML rather than JSON.
router.get('/api-docs', (req, res) => {
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

module.exports = router;

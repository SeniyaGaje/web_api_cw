// OpenAPI 3 description of the API, served live at /api-docs (Swagger UI) and /api-docs/openapi.json.
// Express cannot generate this from the code, so every increment updates it together with its routes.
module.exports = {
  openapi: '3.0.3',
  info: {
    title: 'SLSEA Real-Time Solar Generation Data API',
    version: '1.0.0',
    description:
      'REST API (Richardson Maturity Level 2) for the Sri Lanka Sustainable Energy Authority. ' +
      'Rooftop solar meters push generation readings; SLSEA users read installations and their readings ' +
      'within their jurisdiction. All resources are represented as JSON.',
  },
  servers: [{ url: '/', description: 'This deployment' }],
  tags: [{ name: 'Health', description: 'Service status' }],
  paths: {
    '/': {
      get: {
        tags: ['Health'],
        summary: 'Health check',
        description: 'Shows that the service is running. It is outside /api/v1 and needs no authentication.',
        responses: {
          200: {
            description: 'The service is up.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { status: { type: 'string', example: 'ok' } },
                  required: ['status'],
                },
              },
            },
          },
        },
      },
    },
  },
};

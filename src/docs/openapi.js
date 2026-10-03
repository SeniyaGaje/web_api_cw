// OpenAPI 3 description of the API, served live at /api-docs (Swagger UI) and /api-docs/openapi.json.
// Express cannot generate this from the code, so every increment updates it together with its routes.
// The small helpers below keep the repeated parts (headers, errors, paging) identical everywhere.

const schema = (name) => ({ $ref: `#/components/schemas/${name}` });
const parameter = (name) => ({ $ref: `#/components/parameters/${name}` });
const response = (name) => ({ $ref: `#/components/responses/${name}` });
const jsonContent = (bodySchema) => ({ 'application/json': { schema: bodySchema } });

// A successful response that carries a representation, with its ETag and Last-Modified headers.
function withValidators(description, bodySchema, extraHeaders = {}) {
  return {
    description,
    headers: { ...extraHeaders, ETag: { $ref: '#/components/headers/ETag' }, 'Last-Modified': { $ref: '#/components/headers/LastModified' } },
    content: jsonContent(bodySchema),
  };
}

// The envelope every collection uses.
function pageOf(itemSchemaName) {
  return {
    type: 'object',
    required: ['count', 'next', 'previous', 'results'],
    properties: {
      count: { type: 'integer', description: 'Total number of matching items (all pages).', example: 672 },
      next: { type: 'string', nullable: true, description: 'Link to the next page, or null on the last page.', example: '/api/v1/...?limit=50&offset=50' },
      previous: { type: 'string', nullable: true, description: 'Link to the previous page, or null on the first page.', example: null },
      results: { type: 'array', items: schema(itemSchemaName) },
    },
  };
}

// Standard parts of every GET: conditional-request headers in, 304 / 400 / 406 out.
const conditionalGetParameters = [parameter('IfNoneMatch'), parameter('IfModifiedSince')];
const getErrors = { 304: response('NotModified'), 406: response('NotAcceptable') };

function collectionGet({ tag, summary, description, item, filters = [] }) {
  return {
    tags: [tag],
    summary,
    description,
    parameters: [...filters, parameter('Limit'), parameter('Offset'), ...conditionalGetParameters],
    responses: { 200: withValidators('One page of the collection.', pageOf(item)), ...getErrors, 400: response('BadRequest') },
  };
}

function memberGet({ tag, summary, description, idParameter, item }) {
  return {
    tags: [tag],
    summary,
    description,
    parameters: [parameter(idParameter), ...conditionalGetParameters],
    responses: { 200: withValidators('The resource.', schema(item)), ...getErrors, 404: response('NotFound') },
  };
}

const readingExample = {
  reading_id: 672,
  installation_id: 'INS-0001',
  timestamp: '2026-10-02T06:30:00.000Z',
  received_at: '2026-10-02T06:30:14.512Z',
  power_kw: 11.482,
  energy_kwh: 301493.121,
  voltage_v: 229.6,
};

module.exports = {
  openapi: '3.0.3',
  info: {
    title: 'SLSEA Real-Time Solar Generation Data API',
    version: '1.0.0',
    description:
      'REST API (Richardson Maturity Level 2) for the Sri Lanka Sustainable Energy Authority. Rooftop solar meters ' +
      'push generation readings; SLSEA users read the hierarchy (provinces, districts, grid substations), the ' +
      'installations and their readings. Every resource is represented as JSON.\n\n' +
      '**Collections** are paginated with `limit` (1-500, default 50) and `offset`, and return ' +
      '`{ count, next, previous, results }`.\n\n' +
      '**Caching:** every 200 and 201 response carries a strong `ETag` and `Last-Modified`. Send them back as ' +
      '`If-None-Match` / `If-Modified-Since` to get `304 Not Modified` with an empty body, or as `If-Match` on PUT/DELETE ' +
      '(`412` if the resource has changed).\n\n' +
      '**Errors** (every 4xx and 5xx) share one body: `{ code, message, details, more_info }`. A method that a URI does ' +
      'not support returns `405` with an `Allow` header; readings, for example, cannot be updated or deleted.',
  },
  servers: [{ url: '/', description: 'This deployment' }],
  tags: [
    { name: 'Health', description: 'Service status' },
    { name: 'Hierarchy', description: 'Provinces, districts and grid substations (read-only, managed by the seed data)' },
    { name: 'Installations', description: 'Rooftop solar installations (the metered assets)' },
    { name: 'Readings', description: 'Generation readings: an append-only time series per installation' },
  ],

  paths: {
    '/': {
      get: {
        tags: ['Health'],
        summary: 'Health check',
        description: 'Shows that the service is running. It is outside /api/v1 and does not touch the database.',
        responses: { 200: { description: 'The service is up.', content: jsonContent(schema('Health')) }, 406: response('NotAcceptable') },
      },
    },

    '/api/v1/provinces': {
      get: collectionGet({ tag: 'Hierarchy', summary: 'List provinces', description: 'The 9 provinces of Sri Lanka, ordered by province_id.', item: 'Province' }),
    },
    '/api/v1/provinces/{province-id}': {
      get: memberGet({ tag: 'Hierarchy', summary: 'Get one province', idParameter: 'ProvinceId', item: 'Province' }),
    },

    '/api/v1/districts': {
      get: collectionGet({
        tag: 'Hierarchy',
        summary: 'List districts',
        description: 'The 25 districts, ordered by district_id. Filter by province with `province-id`.',
        item: 'District',
        filters: [parameter('ProvinceFilter')],
      }),
    },
    '/api/v1/districts/{district-id}': {
      get: memberGet({ tag: 'Hierarchy', summary: 'Get one district', idParameter: 'DistrictId', item: 'District' }),
    },

    '/api/v1/substations': {
      get: collectionGet({
        tag: 'Hierarchy',
        summary: 'List grid substations',
        description: 'Grid substations, ordered by substation_id. Filter by `province-id` and/or `district-id`.',
        item: 'Substation',
        filters: [parameter('ProvinceFilter'), parameter('DistrictFilter')],
      }),
    },
    '/api/v1/substations/{substation-id}': {
      get: memberGet({ tag: 'Hierarchy', summary: 'Get one grid substation', idParameter: 'SubstationId', item: 'Substation' }),
    },

    '/api/v1/installations': {
      get: collectionGet({
        tag: 'Installations',
        summary: 'List installations',
        description:
          'Active installations, ordered by installation_id. Filter by jurisdiction with `province-id`, `district-id` ' +
          'and/or `substation-id` (filters combine). A filter that matches nothing returns an empty page, not 404.',
        item: 'Installation',
        filters: [parameter('ProvinceFilter'), parameter('DistrictFilter'), parameter('SubstationFilter')],
      }),
      post: {
        tags: ['Installations'],
        summary: 'Register a new installation',
        description:
          'Creates an installation. The server assigns its `installation_id`. `device_secret` is the secret its meter will ' +
          'authenticate with; it is stored only as a hash and never returned.',
        requestBody: { required: true, content: jsonContent(schema('InstallationCreate')) },
        responses: {
          201: withValidators('Created. The body is the new installation (composite form).', schema('InstallationComposite'), {
            Location: { $ref: '#/components/headers/Location' },
          }),
          400: response('BadRequest'),
          406: response('NotAcceptable'),
          409: response('Conflict'),
          415: response('UnsupportedMediaType'),
        },
      },
    },

    '/api/v1/installations/{installation-id}': {
      get: {
        tags: ['Installations'],
        summary: 'Get one installation (composite)',
        description:
          'The installation together with its most relevant related data: its substation, district and province ' +
          '(each as its id and name) and its latest reading as one nested object (`null` if it has never reported). ' +
          'The reading history is not embedded; it is at `/readings`.',
        parameters: [parameter('InstallationId'), ...conditionalGetParameters],
        responses: { 200: withValidators('The installation.', schema('InstallationComposite')), ...getErrors, 404: response('NotFound') },
      },
      put: {
        tags: ['Installations'],
        summary: 'Replace an installation',
        description:
          'Full replacement, not a partial update: optional fields left out (`address`, `commissioned_on`) are cleared. ' +
          'Idempotent. Send the ETag from a previous GET as `If-Match` to avoid overwriting someone else\'s change. The ' +
          'composite\'s ETag also covers its latest reading, which changes every 15 minutes, so GET again just before.',
        parameters: [parameter('InstallationId'), parameter('IfMatch')],
        requestBody: { required: true, content: jsonContent(schema('InstallationReplace')) },
        responses: {
          200: withValidators('Replaced. The body is the updated installation.', schema('InstallationComposite')),
          400: response('BadRequest'),
          404: response('NotFound'),
          406: response('NotAcceptable'),
          409: response('Conflict'),
          412: response('PreconditionFailed'),
          415: response('UnsupportedMediaType'),
        },
      },
      delete: {
        tags: ['Installations'],
        summary: 'Delete an installation',
        description:
          'Soft delete: the installation disappears from the API (afterwards every request for it, including a second ' +
          'DELETE, returns 404), but its readings are kept as history. Honours `If-Match`.',
        parameters: [parameter('InstallationId'), parameter('IfMatch')],
        responses: {
          200: { description: 'Deleted.', content: jsonContent(schema('DeletedInstallation')) },
          404: response('NotFound'),
          406: response('NotAcceptable'),
          412: response('PreconditionFailed'),
        },
      },
    },

    '/api/v1/installations/{installation-id}/readings': {
      get: {
        tags: ['Readings'],
        summary: "List an installation's readings (history)",
        description:
          'The generation history of one installation, newest first by default. Narrow it to a time window with `from` ' +
          '(inclusive) and `to` (exclusive), and sort with `sort=timestamp` (oldest first) or `sort=-timestamp`.',
        parameters: [
          parameter('InstallationId'),
          parameter('From'),
          parameter('To'),
          parameter('Sort'),
          parameter('Limit'),
          parameter('Offset'),
          ...conditionalGetParameters,
        ],
        responses: {
          200: withValidators('One page of readings.', pageOf('Reading')),
          ...getErrors,
          400: response('BadRequest'),
          404: response('NotFound'),
        },
      },
      post: {
        tags: ['Readings'],
        summary: 'Push a new reading (meter)',
        description:
          'Appends one reading for this installation. The installation is taken from the URI, never from the body; the ' +
          'server sets `received_at`. Readings cannot be changed or deleted afterwards.',
        parameters: [parameter('InstallationId')],
        requestBody: { required: true, content: jsonContent(schema('ReadingCreate')) },
        responses: {
          201: withValidators('Created. The body is the stored reading.', schema('Reading'), { Location: { $ref: '#/components/headers/Location' } }),
          400: response('BadRequest'),
          404: response('NotFound'),
          406: response('NotAcceptable'),
          409: response('Conflict'),
          415: response('UnsupportedMediaType'),
        },
      },
    },

    '/api/v1/installations/{installation-id}/readings/{reading-id}': {
      get: {
        tags: ['Readings'],
        summary: 'Get one reading',
        description: 'The resource a POST\'s Location header points to.',
        parameters: [parameter('InstallationId'), parameter('ReadingId'), ...conditionalGetParameters],
        responses: { 200: withValidators('The reading.', schema('Reading')), ...getErrors, 404: response('NotFound') },
      },
    },

    '/api/v1/installations/{installation-id}/last-reading': {
      get: {
        tags: ['Readings'],
        summary: 'Get the latest reading (what is it generating now?)',
        description:
          'A processing-function resource: the most recent reading by timestamp, derived on each request. Reading fields ' +
          'only, without the installation\'s own details. 404 if the installation has no readings yet.',
        parameters: [parameter('InstallationId'), ...conditionalGetParameters],
        responses: { 200: withValidators('The latest reading.', schema('Reading')), ...getErrors, 404: response('NotFound') },
      },
    },
  },

  components: {
    parameters: {
      ProvinceId: { name: 'province-id', in: 'path', required: true, schema: { type: 'string' }, example: 'PV-01' },
      DistrictId: { name: 'district-id', in: 'path', required: true, schema: { type: 'string' }, example: 'DT-01' },
      SubstationId: { name: 'substation-id', in: 'path', required: true, schema: { type: 'string' }, example: 'SS-001' },
      InstallationId: { name: 'installation-id', in: 'path', required: true, schema: { type: 'string' }, example: 'INS-0001' },
      ReadingId: { name: 'reading-id', in: 'path', required: true, schema: { type: 'integer' }, example: 672 },
      ProvinceFilter: { name: 'province-id', in: 'query', description: 'Only items in this province.', schema: { type: 'string' }, example: 'PV-01' },
      DistrictFilter: { name: 'district-id', in: 'query', description: 'Only items in this district.', schema: { type: 'string' }, example: 'DT-01' },
      SubstationFilter: { name: 'substation-id', in: 'query', description: 'Only items connected to this substation.', schema: { type: 'string' }, example: 'SS-001' },
      Limit: { name: 'limit', in: 'query', description: 'Items per page.', schema: { type: 'integer', minimum: 1, maximum: 500, default: 50 } },
      Offset: { name: 'offset', in: 'query', description: 'Items to skip.', schema: { type: 'integer', minimum: 0, default: 0 } },
      From: {
        name: 'from',
        in: 'query',
        description: 'Only readings at or after this time. ISO 8601 date (midnight UTC) or date-time with a time zone.',
        schema: { type: 'string' },
        example: '2026-10-01T00:00:00Z',
      },
      To: {
        name: 'to',
        in: 'query',
        description: 'Only readings before this time (exclusive). ISO 8601 date or date-time with a time zone.',
        schema: { type: 'string' },
        example: '2026-10-02',
      },
      Sort: {
        name: 'sort',
        in: 'query',
        description: '`timestamp` = oldest first, `-timestamp` = newest first.',
        schema: { type: 'string', enum: ['-timestamp', 'timestamp'], default: '-timestamp' },
      },
      IfNoneMatch: { name: 'If-None-Match', in: 'header', description: 'An ETag you already hold; 304 if it is still current.', schema: { type: 'string' } },
      IfModifiedSince: { name: 'If-Modified-Since', in: 'header', description: 'An HTTP date; 304 if nothing changed since then.', schema: { type: 'string' } },
      IfMatch: { name: 'If-Match', in: 'header', description: 'Only proceed if the resource still has this ETag (otherwise 412).', schema: { type: 'string' } },
    },

    headers: {
      ETag: { description: 'Strong validator: a hash of the exact representation.', schema: { type: 'string' } },
      LastModified: { description: 'When the data in this representation last changed.', schema: { type: 'string' } },
      Location: { description: 'URI of the newly created resource.', schema: { type: 'string' }, example: '/api/v1/installations/INS-0001/readings/148001' },
    },

    responses: {
      NotModified: { description: 'Not Modified: your cached copy is current. Empty body.' },
      BadRequest: { description: 'Bad Request: the body or a query parameter is not valid.', content: jsonContent(schema('Error')) },
      NotFound: { description: 'Not Found: no resource with that id (or it was deleted).', content: jsonContent(schema('Error')) },
      NotAcceptable: { description: 'Not Acceptable: the Accept header rules out application/json.', content: jsonContent(schema('Error')) },
      Conflict: { description: 'Conflict with existing data (duplicate reading timestamp, meter_id already in use).', content: jsonContent(schema('Error')) },
      PreconditionFailed: { description: 'Precondition Failed: If-Match does not match the current ETag.', content: jsonContent(schema('Error')) },
      UnsupportedMediaType: { description: 'Unsupported Media Type: the request body is not application/json.', content: jsonContent(schema('Error')) },
    },

    schemas: {
      Health: { type: 'object', properties: { status: { type: 'string', example: 'ok' } }, required: ['status'] },

      Province: {
        type: 'object',
        required: ['province_id', 'name'],
        properties: { province_id: { type: 'string', example: 'PV-01' }, name: { type: 'string', example: 'Western Province' } },
      },
      District: {
        type: 'object',
        required: ['district_id', 'name', 'province_id'],
        properties: {
          district_id: { type: 'string', example: 'DT-01' },
          name: { type: 'string', example: 'Colombo' },
          province_id: { type: 'string', example: 'PV-01' },
        },
      },
      Substation: {
        type: 'object',
        required: ['substation_id', 'name', 'district_id'],
        properties: {
          substation_id: { type: 'string', example: 'SS-001' },
          name: { type: 'string', example: 'Kolonnawa Grid Substation' },
          district_id: { type: 'string', example: 'DT-01' },
        },
      },

      Installation: {
        type: 'object',
        required: ['installation_id', 'meter_id', 'substation_id', 'capacity_kw', 'address', 'commissioned_on', 'created_at', 'updated_at'],
        properties: {
          installation_id: { type: 'string', example: 'INS-0001' },
          meter_id: { type: 'string', description: 'The meter/inverter identifier, an attribute of the installation.', example: 'MTR-100001' },
          substation_id: { type: 'string', example: 'SS-001' },
          capacity_kw: { type: 'number', example: 20 },
          address: { type: 'string', nullable: true, example: 'No. 18, Station Road, Kolonnawa' },
          commissioned_on: { type: 'string', format: 'date', nullable: true, example: '2016-06-01' },
          created_at: { type: 'string', format: 'date-time' },
          updated_at: { type: 'string', format: 'date-time' },
        },
      },
      InstallationComposite: {
        allOf: [
          schema('Installation'),
          {
            type: 'object',
            required: ['substation', 'district', 'province', 'last_reading'],
            properties: {
              substation: {
                type: 'object',
                properties: { substation_id: { type: 'string', example: 'SS-001' }, name: { type: 'string', example: 'Kolonnawa Grid Substation' } },
              },
              district: { type: 'object', properties: { district_id: { type: 'string', example: 'DT-01' }, name: { type: 'string', example: 'Colombo' } } },
              province: {
                type: 'object',
                properties: { province_id: { type: 'string', example: 'PV-01' }, name: { type: 'string', example: 'Western Province' } },
              },
              last_reading: { allOf: [schema('Reading')], nullable: true, description: 'The latest reading, or null if there is none yet.' },
            },
          },
        ],
      },
      InstallationCreate: {
        type: 'object',
        required: ['meter_id', 'substation_id', 'capacity_kw', 'device_secret'],
        additionalProperties: false,
        properties: {
          meter_id: { type: 'string', pattern: '^[A-Za-z0-9-]{3,40}$', example: 'MTR-200001' },
          substation_id: { type: 'string', example: 'SS-001' },
          capacity_kw: { type: 'number', exclusiveMinimum: true, minimum: 0, maximum: 1000, example: 5 },
          address: { type: 'string', maxLength: 200, nullable: true, example: 'No. 7, Lake Road, Kolonnawa' },
          commissioned_on: { type: 'string', format: 'date', nullable: true, example: '2026-09-15' },
          device_secret: { type: 'string', minLength: 16, maxLength: 200, writeOnly: true, example: 'a-long-random-secret-1234' },
        },
      },
      InstallationReplace: {
        type: 'object',
        required: ['meter_id', 'substation_id', 'capacity_kw'],
        additionalProperties: false,
        description: 'The full new state. Fields left out are cleared. device_secret cannot be changed here.',
        properties: {
          meter_id: { type: 'string', pattern: '^[A-Za-z0-9-]{3,40}$', example: 'MTR-200001' },
          substation_id: { type: 'string', example: 'SS-002' },
          capacity_kw: { type: 'number', exclusiveMinimum: true, minimum: 0, maximum: 1000, example: 6 },
          address: { type: 'string', maxLength: 200, nullable: true, example: 'No. 7, Lake Road, Dehiwala' },
          commissioned_on: { type: 'string', format: 'date', nullable: true, example: '2026-09-15' },
        },
      },
      DeletedInstallation: {
        type: 'object',
        properties: {
          installation_id: { type: 'string', example: 'INS-0221' },
          deleted_at: { type: 'string', format: 'date-time' },
          message: { type: 'string', example: 'The installation was deleted. Its readings are kept as history.' },
        },
      },

      Reading: {
        type: 'object',
        required: ['reading_id', 'installation_id', 'timestamp', 'received_at', 'power_kw', 'energy_kwh', 'voltage_v'],
        properties: {
          reading_id: { type: 'integer', example: readingExample.reading_id },
          installation_id: { type: 'string', example: readingExample.installation_id },
          timestamp: { type: 'string', format: 'date-time', description: 'When the meter measured (device clock).', example: readingExample.timestamp },
          received_at: { type: 'string', format: 'date-time', description: 'When the server received it.', example: readingExample.received_at },
          power_kw: { type: 'number', description: 'Instantaneous power.', example: readingExample.power_kw },
          energy_kwh: { type: 'number', description: "The meter's cumulative total; never decreases.", example: readingExample.energy_kwh },
          voltage_v: { type: 'number', example: readingExample.voltage_v },
        },
      },
      ReadingCreate: {
        type: 'object',
        required: ['timestamp', 'power_kw', 'energy_kwh', 'voltage_v'],
        additionalProperties: false,
        properties: {
          timestamp: { type: 'string', format: 'date-time', description: 'ISO 8601 with a time zone; at most 5 minutes in the future.', example: '2026-10-02T06:37:00Z' },
          power_kw: { type: 'number', minimum: 0, example: 11.5 },
          energy_kwh: { type: 'number', minimum: 0, example: 301494.5 },
          voltage_v: { type: 'number', minimum: 0, maximum: 1000, example: 230.1 },
        },
      },

      Error: {
        type: 'object',
        required: ['code', 'message', 'details', 'more_info'],
        properties: {
          code: { type: 'string', description: 'Stable, machine-readable error code.', example: 'VALIDATION_FAILED' },
          message: { type: 'string', example: 'The reading is not valid.' },
          details: {
            type: 'array',
            items: { type: 'object', properties: { field: { type: 'string', example: 'power_kw' }, issue: { type: 'string', example: 'is required: a number, 0 or more' } } },
          },
          more_info: { type: 'string', example: '/api-docs' },
        },
      },
    },
  },
};

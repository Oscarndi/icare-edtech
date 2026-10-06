'use strict';

const {
  getRequestSession,
  noStore
} = require('./_finroom-auth');

const {
  loadModelFromEnvironment,
  computeInteractiveSimulation,
  computeFinancialTrajectory,
  computeSensitivityAnalysis,
  computeBreakEvenGraph
} = require('./_finroom-model');

const ALLOWED_TOP_LEVEL_FIELDS = new Set([
  'operation',
  'overrides',
  'options',
  'scenarios'
]);

const OPERATIONS = new Set([
  'single_simulation',
  'trajectory',
  'sensitivity',
  'break_even_graph'
]);

const MAX_REQUEST_BODY_BYTES = 64 * 1024;

function requestContentType(req) {
  if (!req || !req.headers) {
    return '';
  }

  const value =
    req.headers['content-type'] ||
    req.headers['Content-Type'];

  return typeof value === 'string'
    ? value.trim().toLowerCase()
    : '';
}

function assertJsonRequest(req) {
  const contentType = requestContentType(req);

  if (
    contentType &&
    !contentType.startsWith('application/json')
  ) {
    throw new Error('unsupported_media_type');
  }

  /*
   * Some serverless runtimes provide an already-parsed object and may
   * not preserve Content-Type in synthetic/unit invocations. Therefore
   * JSON is mandatory for raw string bodies, while parsed object bodies
   * remain compatible with the platform adapter.
   */
  if (
    typeof req.body === 'string' &&
    !contentType.startsWith('application/json')
  ) {
    throw new Error('unsupported_media_type');
  }
}

function requestBodyByteLength(body) {
  if (typeof body === 'string') {
    return Buffer.byteLength(body, 'utf8');
  }

  if (
    body !== null &&
    typeof body === 'object'
  ) {
    return Buffer.byteLength(
      JSON.stringify(body),
      'utf8'
    );
  }

  return 0;
}

function assertRequestSize(req) {
  const rawLength =
    req &&
    req.headers &&
    (
      req.headers['content-length'] ||
      req.headers['Content-Length']
    );

  if (rawLength !== undefined) {
    const declared = Number(rawLength);

    if (
      !Number.isFinite(declared) ||
      declared < 0 ||
      !Number.isInteger(declared)
    ) {
      throw new Error('invalid_content_length');
    }

    if (declared > MAX_REQUEST_BODY_BYTES) {
      throw new Error('request_too_large');
    }
  }

  const actual = requestBodyByteLength(
    req ? req.body : undefined
  );

  if (actual > MAX_REQUEST_BODY_BYTES) {
    throw new Error('request_too_large');
  }
}

function sendJson(res, statusCode, body) {
  noStore(res);
  res.statusCode = statusCode;
  res.setHeader(
    'Content-Type',
    'application/json; charset=utf-8'
  );
  res.end(JSON.stringify(body));
}

function parseRequestBody(body) {
  if (
    body !== null &&
    typeof body === 'object' &&
    !Array.isArray(body)
  ) {
    return body;
  }

  if (typeof body !== 'string') {
    throw new Error('invalid_request_body');
  }

  const parsed = JSON.parse(body);

  if (
    parsed === null ||
    typeof parsed !== 'object' ||
    Array.isArray(parsed)
  ) {
    throw new Error('invalid_request_body');
  }

  return parsed;
}

function validateEnvelope(body) {
  for (const key of Object.keys(body)) {
    if (!ALLOWED_TOP_LEVEL_FIELDS.has(key)) {
      throw new Error('unknown_request_field');
    }
  }

  if (
    typeof body.operation !== 'string' ||
    !OPERATIONS.has(body.operation)
  ) {
    throw new Error('invalid_operation');
  }

  if (
    Object.prototype.hasOwnProperty.call(body, 'overrides') &&
    (
      body.overrides === null ||
      typeof body.overrides !== 'object' ||
      Array.isArray(body.overrides)
    )
  ) {
    throw new Error('invalid_overrides');
  }

  if (
    Object.prototype.hasOwnProperty.call(body, 'options') &&
    (
      body.options === null ||
      typeof body.options !== 'object' ||
      Array.isArray(body.options)
    )
  ) {
    throw new Error('invalid_options');
  }

  if (
    Object.prototype.hasOwnProperty.call(body, 'scenarios') &&
    !Array.isArray(body.scenarios)
  ) {
    throw new Error('invalid_scenarios');
  }

  if (
    body.operation === 'single_simulation' &&
    (
      Object.prototype.hasOwnProperty.call(body, 'options') ||
      Object.prototype.hasOwnProperty.call(body, 'scenarios')
    )
  ) {
    throw new Error('unexpected_operation_field');
  }

  if (
    body.operation === 'trajectory' &&
    Object.prototype.hasOwnProperty.call(body, 'scenarios')
  ) {
    throw new Error('unexpected_operation_field');
  }

  if (
    body.operation === 'trajectory' &&
    body.overrides &&
    body.options
  ) {
    for (const key of Object.keys(body.overrides)) {
      const canonicalKey =
        key === 'active_students'
          ? 'initial_active_students'
          : key;

      if (
        Object.prototype.hasOwnProperty.call(
          body.options,
          canonicalKey
        )
      ) {
        throw new Error(
          'duplicate_trajectory_field'
        );
      }
    }
  }

  if (
    body.operation === 'sensitivity' &&
    !Array.isArray(body.scenarios)
  ) {
    throw new Error('sensitivity_scenarios_required');
  }

  if (
    body.operation === 'break_even_graph' &&
    Object.prototype.hasOwnProperty.call(body, 'scenarios')
  ) {
    throw new Error('unexpected_operation_field');
  }

  return body;
}

function executeOperation(model, request) {
  switch (request.operation) {
    case 'single_simulation':
      return computeInteractiveSimulation(
        model,
        request.overrides || {}
      );

    case 'trajectory': {
      const trajectoryOptions = {
        ...(request.overrides || {}),
        ...(request.options || {})
      };

      if (
        trajectoryOptions.initial_active_students ===
          undefined &&
        trajectoryOptions.active_students !== undefined
      ) {
        trajectoryOptions.initial_active_students =
          trajectoryOptions.active_students;
      }

      delete trajectoryOptions.active_students;

      return computeFinancialTrajectory(
        model,
        trajectoryOptions
      );
    }

    case 'sensitivity':
      return computeSensitivityAnalysis(
        model,
        request.scenarios,
        request.options || {}
      );

    case 'break_even_graph':
      return computeBreakEvenGraph(
        model,
        request.overrides || {},
        request.options || {}
      );

    default:
      throw new Error('invalid_operation');
  }
}

module.exports = function finroomSimulate(req, res) {
  if (!req || req.method !== 'POST') {
    if (res && typeof res.setHeader === 'function') {
      res.setHeader('Allow', 'POST');
    }

    return sendJson(
      res,
      405,
      { error: 'method_not_allowed' }
    );
  }

  /*
   * Security boundary:
   * authenticate before parsing financial simulation input
   * and, critically, before loading FINROOM_MODEL_JSON.
   */
  let session;

  try {
    session = getRequestSession(req);
  } catch {
    return sendJson(
      res,
      503,
      { error: 'service_unavailable' }
    );
  }

  if (!session) {
    return sendJson(
      res,
      401,
      { error: 'authentication_required' }
    );
  }

  let request;

  try {
    assertJsonRequest(req);
    assertRequestSize(req);

    request = validateEnvelope(
      parseRequestBody(req.body)
    );
  } catch (error) {
    if (
      error &&
      error.message === 'unsupported_media_type'
    ) {
      return sendJson(
        res,
        415,
        { error: 'unsupported_media_type' }
      );
    }

    if (
      error &&
      error.message === 'request_too_large'
    ) {
      return sendJson(
        res,
        413,
        { error: 'request_too_large' }
      );
    }

    return sendJson(
      res,
      400,
      { error: 'invalid_request' }
    );
  }

  let model;

  try {
    model = loadModelFromEnvironment();
  } catch {
    /*
     * The authoritative private model is server configuration.
     * Missing, malformed or invalid server-side model state is
     * an operational failure, never a client simulation error.
     *
     * Do not expose environment values, parser details,
     * validation paths or internal exception messages.
     */
    return sendJson(
      res,
      503,
      { error: 'service_unavailable' }
    );
  }

  let result;

  try {
    result = executeOperation(
      model,
      request
    );
  } catch {
    /*
     * Simulation input/engine rejection is a client-visible
     * generic 400. Internal validation paths and exception
     * messages remain private.
     */
    return sendJson(
      res,
      400,
      { error: 'simulation_rejected' }
    );
  }

  return sendJson(
    res,
    200,
    {
      ok: true,
      operation: request.operation,
      data: result
    }
  );
};

module.exports.parseRequestBody = parseRequestBody;
module.exports.assertJsonRequest = assertJsonRequest;
module.exports.assertRequestSize = assertRequestSize;
module.exports.MAX_REQUEST_BODY_BYTES = MAX_REQUEST_BODY_BYTES;
module.exports.validateEnvelope = validateEnvelope;
module.exports.executeOperation = executeOperation;

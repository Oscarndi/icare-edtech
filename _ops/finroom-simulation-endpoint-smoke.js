'use strict';

const assert = require('assert');

const auth = require('../api/_finroom-auth');
const handler = require('../api/finroom-simulate');

const TEST_SECRET =
  'finroom-simulation-endpoint-test-secret-32-characters';

const TEST_MODEL = {
  metadata: {
    model_version: 'simulation-endpoint-test-v1',
    currency: 'TEST',
    status: 'current_assumption',
    updated_at: '2099-03-01T00:00:00Z'
  },

  school: {
    active_student_monthly_fee: 103,
    class_monthly_support_fee: 19,
    teacher_incentive_per_student_subject: 7,
    reference_subject_count: 2,
    reference_class_capacity: 11
  },

  hardware: {
    box_budget_per_class: 509,
    tablet_unit_cost: 223,
    tablet_monthly_rental: 13
  },

  home: {
    learner_monthly_price: 311,
    school_to_home_conversion_rate: 0.25,
    teacher_cost_per_student_subject: 23,
    teacher_cost_unit:
      'per_student_per_month_per_subject'
  },

  operating_costs: {
    current_fixed_monthly: 10007,
    expanded_fixed_monthly: 20021
  }
};

let checks = 0;

function check(condition, message) {
  assert.ok(condition, message);
  checks += 1;
}

function makeReq(
  method,
  body,
  cookie = '',
  extraHeaders = {}
) {
  return {
    method,
    body,
    headers: {
      ...(cookie ? { cookie } : {}),
      ...extraHeaders
    }
  };
}

function makeRes() {
  const headers = Object.create(null);

  return {
    statusCode: 200,
    body: '',

    setHeader(name, value) {
      headers[name.toLowerCase()] = value;
    },

    getHeader(name) {
      return headers[name.toLowerCase()];
    },

    end(value = '') {
      this.body += String(value);
    },

    headers
  };
}

function run(req) {
  const res = makeRes();
  handler(req, res);
  return res;
}

function body(res) {
  return JSON.parse(res.body);
}

function assertPrivateHeaders(res) {
  check(
    res.getHeader('cache-control') ===
      'no-store, max-age=0',
    'Cache-Control no-store'
  );

  check(
    res.getHeader('pragma') === 'no-cache',
    'Pragma no-cache'
  );

  check(
    res.getHeader('x-content-type-options') === 'nosniff',
    'nosniff'
  );

  check(
    res.getHeader('referrer-policy') === 'no-referrer',
    'no-referrer'
  );

  check(
    res.getHeader('x-frame-options') === 'DENY',
    'frame deny'
  );
}

delete process.env.FINROOM_MODEL_JSON;
process.env.FINROOM_SESSION_SECRET = TEST_SECRET;

/* 1 — wrong method */
{
  const res = run(makeReq('GET'));

  check(res.statusCode === 405, 'GET => 405');
  check(res.getHeader('allow') === 'POST', 'Allow POST');
  check(
    body(res).error === 'method_not_allowed',
    'generic method body'
  );

  assertPrivateHeaders(res);
}

/* 2 — unauthenticated before private model */
{
  const res = run(
    makeReq(
      'POST',
      {
        operation: 'single_simulation',
        overrides: {
          active_students: 22
        }
      }
    )
  );

  check(res.statusCode === 401, 'missing session => 401');
  check(
    body(res).error === 'authentication_required',
    'generic authentication body'
  );

  assertPrivateHeaders(res);
}

/* Create valid session. */
const token = auth.createSessionToken();

const cookie =
  `${auth.COOKIE_NAME}=${encodeURIComponent(token)}`;

/* 3 — malformed JSON */
{
  const res = run(
    makeReq(
      'POST',
      '{not-json',
      cookie,
      {
        'content-type': 'application/json'
      }
    )
  );

  check(res.statusCode === 400, 'malformed JSON => 400');
  check(
    body(res).error === 'invalid_request',
    'malformed JSON generic body'
  );
}

/* 4 — unknown top-level field */
{
  const res = run(
    makeReq(
      'POST',
      {
        operation: 'single_simulation',
        overrides: {
          active_students: 22
        },
        official_model: TEST_MODEL
      },
      cookie
    )
  );

  check(res.statusCode === 400, 'unknown field => 400');
  check(
    body(res).error === 'invalid_request',
    'unknown field rejected generically'
  );
}

/* 5 — unsupported operation */
{
  const res = run(
    makeReq(
      'POST',
      {
        operation: 'mutate_official_model'
      },
      cookie
    )
  );

  check(res.statusCode === 400, 'unsupported operation => 400');
}

/* 6 — authenticated but model missing */
{
  delete process.env.FINROOM_MODEL_JSON;

  const res = run(
    makeReq(
      'POST',
      {
        operation: 'single_simulation',
        overrides: {
          active_students: 22
        }
      },
      cookie
    )
  );

  check(res.statusCode === 503, 'missing model => 503');
  check(
    body(res).error === 'service_unavailable',
    'missing model generic service body'
  );

  check(
    !res.body.includes('FINROOM_MODEL_JSON'),
    'model environment name not leaked'
  );
}

/* 7 — authenticated single simulation */
process.env.FINROOM_MODEL_JSON =
  JSON.stringify(TEST_MODEL);

{
  const res = run(
    makeReq(
      'POST',
      {
        operation: 'single_simulation',
        overrides: {
          active_students: 22,
          device_mode: 'school_owned',
          home_enabled: true,
          home_conversion_rate: 0.25,
          cost_structure: 'current'
        }
      },
      cookie
    )
  );

  check(res.statusCode === 200, 'single simulation => 200');

  const parsed = body(res);

  check(parsed.ok === true, 'single simulation ok');
  check(
    parsed.operation === 'single_simulation',
    'single operation echoed'
  );
  check(
    parsed.data &&
    typeof parsed.data === 'object',
    'single simulation data'
  );

  assertPrivateHeaders(res);
}

/* 8 — trajectory */
{
  const res = run(
    makeReq(
      'POST',
      {
        operation: 'trajectory',
        overrides: {
          active_students: 22,
          device_mode: 'school_owned',
          home_enabled: true,
          home_conversion_rate: 0.25,
          cost_structure: 'current'
        },
        options: {
          horizon_months: 12,
          growth_mode: 'constant_students'
        }
      },
      cookie
    )
  );

  check(res.statusCode === 200, 'trajectory => 200');

  const parsed = body(res);

  check(parsed.ok === true, 'trajectory ok');
  check(
    parsed.operation === 'trajectory',
    'trajectory operation echoed'
  );
  check(
    parsed.data &&
    Array.isArray(parsed.data.months),
    'trajectory months returned'
  );
}

/*
 * 9 — sensitivity.
 *
 * The sensitivity engine itself validates the detailed scenario
 * contract. This endpoint test verifies HTTP routing to that engine
 * without duplicating the engine's entire contract fixture here.
 */
{
  const res = run(
    makeReq(
      'POST',
      {
        operation: 'sensitivity',
        scenarios: []
      },
      cookie
    )
  );

  check(
    res.statusCode === 400,
    'invalid sensitivity set reaches engine and is rejected'
  );

  check(
    body(res).error === 'simulation_rejected',
    'sensitivity engine rejection remains generic'
  );
}

/* 10 — operation-specific envelope rejection */
{
  const res = run(
    makeReq(
      'POST',
      {
        operation: 'single_simulation',
        overrides: {},
        scenarios: []
      },
      cookie
    )
  );

  check(
    res.statusCode === 400,
    'unexpected single-simulation scenarios rejected'
  );
}

/* 11 — no secret/environment leakage */
{
  const serialized = JSON.stringify(
    run(
      makeReq(
        'POST',
        {
          operation: 'single_simulation',
          overrides: {
            active_students: -1
          }
        },
        cookie
      )
    ).body
  );

  check(
    !serialized.includes(TEST_SECRET),
    'session secret absent'
  );

  check(
    !serialized.includes('FINROOM_SESSION_SECRET'),
    'session env name absent'
  );

  check(
    !serialized.includes('FINROOM_ACCESS_CODE_HASH'),
    'access env name absent'
  );

  check(
    !serialized.includes('FINROOM_MODEL_JSON'),
    'model env name absent'
  );
}

delete process.env.FINROOM_MODEL_JSON;
delete process.env.FINROOM_SESSION_SECRET;

console.log('FINROOM_SIMULATION_ENDPOINT_SMOKE=PASS');
console.log(`SIMULATION_ENDPOINT_CHECKS=${checks}`);

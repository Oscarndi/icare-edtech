'use strict';

const assert = require('assert');

const auth = require('../api/_finroom-auth');
const handler = require('../api/finroom-data');

const TEST_SESSION_SECRET =
  'finroom-data-test-session-secret-32-characters-minimum';

/*
 * Synthetic model only.
 * No ICARE production financial values belong in this fixture.
 */
const TEST_MODEL = {
  metadata: {
    model_version: 'endpoint-test-v1',
    currency: 'TEST',
    status: 'current_assumption',
    updated_at: '2099-02-03T00:00:00Z'
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

function makeResponse() {
  return {
    statusCode: 200,
    headers: {},
    body: '',

    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    },

    end(value = '') {
      this.body += value;
    }
  };
}

function run(req) {
  const res = makeResponse();
  handler(req, res);
  return res;
}

function json(res) {
  return JSON.parse(res.body);
}

function assertNoStore(res) {
  check(
    res.headers['cache-control'] ===
      'no-store, max-age=0',
    'Cache-Control no-store'
  );

  check(
    res.headers.pragma === 'no-cache',
    'Pragma no-cache'
  );

  check(
    res.headers.expires === '0',
    'Expires zero'
  );
}

/* ---------------------------------------------------------- */
/* 1. Method restriction                                      */
/* ---------------------------------------------------------- */

{
  const res = run({
    method: 'POST',
    headers: {}
  });

  check(res.statusCode === 405, 'POST => 405');
  check(res.headers.allow === 'GET', 'Allow GET');
  check(
    json(res).error === 'method_not_allowed',
    'generic 405 body'
  );
  assertNoStore(res);
}

/* ---------------------------------------------------------- */
/* 2. No cookie                                               */
/* Must be 401 even when financial model is absent.           */
/* ---------------------------------------------------------- */

delete process.env.FINROOM_MODEL_JSON;
process.env.FINROOM_SESSION_SECRET =
  TEST_SESSION_SECRET;

{
  const res = run({
    method: 'GET',
    headers: {}
  });

  check(res.statusCode === 401, 'no cookie => 401');
  check(
    json(res).error === 'authentication_required',
    'generic 401 body'
  );
  assertNoStore(res);
}

/* ---------------------------------------------------------- */
/* 3. Invalid token                                           */
/* ---------------------------------------------------------- */

{
  const res = run({
    method: 'GET',
    headers: {
      cookie:
        `${auth.COOKIE_NAME}=invalid-token`
    }
  });

  check(res.statusCode === 401, 'invalid token => 401');
  check(
    json(res).error === 'authentication_required',
    'invalid token generic body'
  );
}

/* ---------------------------------------------------------- */
/* 4. Missing session secret with plausible token             */
/* ---------------------------------------------------------- */

process.env.FINROOM_SESSION_SECRET =
  TEST_SESSION_SECRET;

const validToken = auth.createSessionToken();

delete process.env.FINROOM_SESSION_SECRET;

{
  const res = run({
    method: 'GET',
    headers: {
      cookie:
        `${auth.COOKIE_NAME}=${encodeURIComponent(validToken)}`
    }
  });

  check(
    res.statusCode === 503,
    'missing session secret => 503'
  );

  check(
    json(res).error === 'service_unavailable',
    'missing secret generic body'
  );

  check(
    !res.body.includes('FINROOM_SESSION_SECRET'),
    'session config detail not leaked'
  );
}

/* ---------------------------------------------------------- */
/* 5. Authenticated but model missing                         */
/* ---------------------------------------------------------- */

process.env.FINROOM_SESSION_SECRET =
  TEST_SESSION_SECRET;

const token = auth.createSessionToken();

delete process.env.FINROOM_MODEL_JSON;

{
  const res = run({
    method: 'GET',
    headers: {
      cookie:
        `${auth.COOKIE_NAME}=${encodeURIComponent(token)}`
    }
  });

  check(
    res.statusCode === 503,
    'missing model => 503'
  );

  check(
    json(res).error === 'service_unavailable',
    'missing model generic body'
  );

  check(
    !res.body.includes('FINROOM_MODEL_JSON'),
    'model config detail not leaked'
  );

  assertNoStore(res);
}

/* ---------------------------------------------------------- */
/* 6. Authenticated but malformed model                       */
/* ---------------------------------------------------------- */

process.env.FINROOM_MODEL_JSON = '{bad-json';

{
  const res = run({
    method: 'GET',
    headers: {
      cookie:
        `${auth.COOKIE_NAME}=${encodeURIComponent(token)}`
    }
  });

  check(
    res.statusCode === 503,
    'malformed model => 503'
  );

  check(
    json(res).error === 'service_unavailable',
    'malformed model generic body'
  );

  check(
    !res.body.includes('bad-json'),
    'malformed input not leaked'
  );
}

/* ---------------------------------------------------------- */
/* 7. Authenticated success                                   */
/* ---------------------------------------------------------- */

process.env.FINROOM_MODEL_JSON =
  JSON.stringify(TEST_MODEL);

{
  const res = run({
    method: 'GET',
    headers: {
      cookie:
        `other=x; ${auth.COOKIE_NAME}=${encodeURIComponent(token)}; z=y`
    }
  });

  check(res.statusCode === 200, 'valid request => 200');

  const body = json(res);

  check(body.ok === true, 'success ok=true');
  check(
    body.data.metadata.model_version ===
      'endpoint-test-v1',
    'model presentation returned'
  );

  check(
    Array.isArray(body.data.scenarios) &&
      body.data.scenarios.length === 6,
    'six scenarios returned'
  );

  check(
    body.data.semantics.home_teacher_cost_unit ===
      'per_student_per_month_per_subject',
    'decision B returned'
  );

  check(
    body.data.semantics.minibox_included === false,
    'MiniBox excluded'
  );

  check(
    body.data.semantics.irr_status === 'deferred',
    'IRR deferred'
  );

  check(
    !res.body.includes('FINROOM_SESSION_SECRET'),
    'session secret name absent'
  );

  check(
    !res.body.includes('FINROOM_ACCESS_CODE_HASH'),
    'access verifier name absent'
  );

  check(
    !res.body.includes('FINROOM_MODEL_JSON'),
    'environment name absent'
  );

  assertNoStore(res);
}

/* ---------------------------------------------------------- */
/* 8. Cookie parser                                           */
/* ---------------------------------------------------------- */

{
  const parsed = handler.parseCookies(
    'a=1; encoded=hello%20world; broken=%ZZ'
  );

  check(parsed.a === '1', 'cookie parser basic');
  check(
    parsed.encoded === 'hello world',
    'cookie parser decode'
  );
  check(
    parsed.broken === '%ZZ',
    'cookie parser malformed encoding safe'
  );
}

delete process.env.FINROOM_MODEL_JSON;
delete process.env.FINROOM_SESSION_SECRET;

console.log('FINROOM_DATA_ENDPOINT_SMOKE=PASS');
console.log(`DATA_ENDPOINT_CHECKS=${checks}`);

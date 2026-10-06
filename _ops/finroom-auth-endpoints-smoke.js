'use strict';

const assert = require('assert');

process.env.FINROOM_SESSION_SECRET =
  'test-session-secret-32-characters-minimum-value';

const auth = require('../api/_finroom-auth');

const TEST_CODE = 'ICARE-endpoint-test-code';

process.env.FINROOM_ACCESS_CODE_HASH =
  auth.createAccessCodeHash(
    TEST_CODE,
    Buffer.from('0123456789abcdef', 'utf8')
  );

const login = require('../api/finroom-login');
const session = require('../api/finroom-session');
const logout = require('../api/finroom-logout');

function makeReq(method, body, cookie) {
  return {
    method,
    body,
    headers: cookie ? { cookie } : {}
  };
}

function makeRes() {
  const headers = Object.create(null);

  return {
    statusCode: 200,
    body: '',
    ended: false,

    setHeader(name, value) {
      headers[name.toLowerCase()] = value;
    },

    getHeader(name) {
      return headers[name.toLowerCase()];
    },

    end(value = '') {
      this.body =
        value === undefined || value === null
          ? ''
          : String(value);

      this.ended = true;
    },

    headers
  };
}

function parseBody(res) {
  if (!res.body) return null;
  return JSON.parse(res.body);
}

function assertSecurityHeaders(res) {
  assert.strictEqual(
    res.getHeader('cache-control'),
    'no-store, max-age=0'
  );

  assert.strictEqual(
    res.getHeader('pragma'),
    'no-cache'
  );

  assert.strictEqual(
    res.getHeader('x-content-type-options'),
    'nosniff'
  );

  assert.strictEqual(
    res.getHeader('referrer-policy'),
    'no-referrer'
  );

  assert.strictEqual(
    res.getHeader('x-frame-options'),
    'DENY'
  );

  assert.ok(
    String(
      res.getHeader('content-security-policy')
    ).includes("frame-ancestors 'none'")
  );
}

let checks = 0;

function check(condition, message) {
  assert.ok(condition, message);
  checks += 1;
}

/* ---------------------------------------------------------- */
/* 1. LOGIN — wrong method                                    */
/* ---------------------------------------------------------- */

{
  const req = makeReq('GET');
  const res = makeRes();

  login(req, res);

  check(res.statusCode === 405, 'login GET must be 405');
  check(res.getHeader('allow') === 'POST', 'login Allow must be POST');
  assertSecurityHeaders(res);
}

/* ---------------------------------------------------------- */
/* 2. LOGIN — malformed body                                  */
/* ---------------------------------------------------------- */

{
  const req = makeReq('POST', '{invalid-json');
  const res = makeRes();

  login(req, res);

  check(res.statusCode === 401, 'malformed login must be 401');
  check(parseBody(res).ok === false, 'malformed login body');
  assertSecurityHeaders(res);
}

/* ---------------------------------------------------------- */
/* 3. LOGIN — wrong code                                      */
/* ---------------------------------------------------------- */

{
  const req = makeReq(
    'POST',
    { code: 'wrong-code' }
  );

  const res = makeRes();

  login(req, res);

  check(res.statusCode === 401, 'wrong code must be 401');
  check(parseBody(res).ok === false, 'wrong code response');
  check(
    !res.getHeader('set-cookie'),
    'wrong code must not create session'
  );

  assertSecurityHeaders(res);
}

/* ---------------------------------------------------------- */
/* 4. LOGIN — correct code                                    */
/* ---------------------------------------------------------- */

let validCookie;

{
  const req = makeReq(
    'POST',
    { code: TEST_CODE }
  );

  const res = makeRes();

  login(req, res);

  check(res.statusCode === 200, 'valid login must be 200');
  check(parseBody(res).ok === true, 'valid login response');

  validCookie = res.getHeader('set-cookie');

  check(
    typeof validCookie === 'string',
    'valid login must set cookie'
  );

  check(
    validCookie.includes('HttpOnly'),
    'cookie HttpOnly'
  );

  check(
    validCookie.includes('Secure'),
    'cookie Secure'
  );

  check(
    validCookie.includes('SameSite=Strict'),
    'cookie SameSite Strict'
  );

  check(
    validCookie.includes('Max-Age=3600'),
    'cookie Max-Age'
  );

  assertSecurityHeaders(res);
}

/* ---------------------------------------------------------- */
/* 5. SESSION — no cookie                                     */
/* ---------------------------------------------------------- */

{
  const req = makeReq('GET');
  const res = makeRes();

  session(req, res);

  check(
    res.statusCode === 401,
    'missing session must be 401'
  );

  check(
    parseBody(res).authenticated === false,
    'missing session response'
  );

  assertSecurityHeaders(res);
}

/* ---------------------------------------------------------- */
/* 6. SESSION — valid cookie                                  */
/* ---------------------------------------------------------- */

{
  const req = makeReq(
    'GET',
    undefined,
    validCookie
  );

  const res = makeRes();

  session(req, res);

  const body = parseBody(res);

  check(
    res.statusCode === 200,
    'valid session must be 200'
  );

  check(
    body.authenticated === true,
    'valid session authenticated'
  );

  check(
    typeof body.expiresAt === 'string',
    'valid session exposes expiration'
  );

  assertSecurityHeaders(res);
}

/* ---------------------------------------------------------- */
/* 7. SESSION — tampered cookie                               */
/* ---------------------------------------------------------- */

{
  const pair = validCookie.split(';')[0];

  const tampered = pair + 'x';

  const req = makeReq(
    'GET',
    undefined,
    tampered
  );

  const res = makeRes();

  session(req, res);

  check(
    res.statusCode === 401,
    'tampered session must be 401'
  );

  check(
    parseBody(res).authenticated === false,
    'tampered session rejected'
  );

  assertSecurityHeaders(res);
}

/* ---------------------------------------------------------- */
/* 8. SESSION — wrong method                                  */
/* ---------------------------------------------------------- */

{
  const req = makeReq('POST');
  const res = makeRes();

  session(req, res);

  check(
    res.statusCode === 405,
    'session POST must be 405'
  );

  check(
    res.getHeader('allow') === 'GET',
    'session Allow must be GET'
  );

  assertSecurityHeaders(res);
}

/* ---------------------------------------------------------- */
/* 9. LOGOUT — wrong method                                   */
/* ---------------------------------------------------------- */

{
  const req = makeReq('GET');
  const res = makeRes();

  logout(req, res);

  check(
    res.statusCode === 405,
    'logout GET must be 405'
  );

  check(
    res.getHeader('allow') === 'POST',
    'logout Allow must be POST'
  );

  assertSecurityHeaders(res);
}

/* ---------------------------------------------------------- */
/* 10. LOGOUT — correct method                                */
/* ---------------------------------------------------------- */

{
  const req = makeReq('POST');
  const res = makeRes();

  logout(req, res);

  const cookie = res.getHeader('set-cookie');

  check(
    res.statusCode === 200,
    'logout POST must be 200'
  );

  check(
    parseBody(res).ok === true,
    'logout response'
  );

  check(
    typeof cookie === 'string',
    'logout must set expiry cookie'
  );

  check(
    cookie.includes('Max-Age=0'),
    'logout must expire cookie'
  );

  check(
    cookie.includes('HttpOnly'),
    'logout cookie HttpOnly'
  );

  check(
    cookie.includes('Secure'),
    'logout cookie Secure'
  );

  check(
    cookie.includes('SameSite=Strict'),
    'logout cookie SameSite'
  );

  assertSecurityHeaders(res);
}

/* ---------------------------------------------------------- */
/* 11. SECRET LEAK RESPONSE CONTROL                           */
/* ---------------------------------------------------------- */

{
  const req = makeReq(
    'POST',
    { code: 'wrong-code' }
  );

  const res = makeRes();

  login(req, res);

  const responseText = res.body;

  check(
    !responseText.includes(TEST_CODE),
    'response must not expose access code'
  );

  check(
    !responseText.includes(
      process.env.FINROOM_SESSION_SECRET
    ),
    'response must not expose session secret'
  );

  check(
    !responseText.includes(
      process.env.FINROOM_ACCESS_CODE_HASH
    ),
    'response must not expose code hash'
  );
}

console.log('FINROOM_ENDPOINT_SMOKE=PASS');
console.log('ENDPOINT_CHECKS=' + checks);

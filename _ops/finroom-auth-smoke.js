'use strict';

const assert = require('assert');

process.env.FINROOM_SESSION_SECRET =
  'test-session-secret-32-characters-minimum-value';

const auth = require('../api/_finroom-auth');

const TEST_CODE = 'ICARE-test-code-not-production';

process.env.FINROOM_ACCESS_CODE_HASH =
  auth.createAccessCodeHash(
    TEST_CODE,
    Buffer.from('0123456789abcdef', 'utf8')
  );

assert.strictEqual(
  auth.verifyAccessCode(TEST_CODE),
  true
);

assert.strictEqual(
  auth.verifyAccessCode('wrong-code'),
  false
);

const FIXED_NOW = 1800000000000;

const token = auth.createSessionToken(FIXED_NOW);

assert.ok(
  typeof token === 'string' &&
  token.includes('.')
);

const valid = auth.verifySessionToken(
  token,
  FIXED_NOW + 1000
);

assert.ok(valid);
assert.strictEqual(valid.v, 1);

assert.strictEqual(
  auth.verifySessionToken(
    `${token}tampered`,
    FIXED_NOW + 1000
  ),
  null
);

assert.strictEqual(
  auth.verifySessionToken(
    token,
    FIXED_NOW + (61 * 60 * 1000)
  ),
  null
);

const cookie = auth.sessionCookie(token);

assert.ok(cookie.includes('HttpOnly'));
assert.ok(cookie.includes('Secure'));
assert.ok(cookie.includes('SameSite=Strict'));
assert.ok(cookie.includes('Path=/'));
assert.ok(cookie.includes('Max-Age=3600'));

const req = {
  headers: {
    cookie
  }
};

/*
 * getRequestSession() intentionally uses the real current clock.
 * Use a fresh real-time token for this integration-level cookie test.
 * FIXED_NOW remains reserved for deterministic expiry/tamper tests above.
 */
const liveToken = auth.createSessionToken();

req.headers.cookie = auth.sessionCookie(liveToken);

const recovered = auth.getRequestSession(req);

assert.ok(recovered);

console.log('FINROOM_AUTH_SMOKE=PASS');
console.log('AUTH_CHECKS=10');

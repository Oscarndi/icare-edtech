'use strict';

const assert = require('assert');

const auth = require('../api/_finroom-auth');
const login = require('../api/finroom-login');
const session = require('../api/finroom-session');

const TEST_CODE = 'ICARE-hardening-test-code';
const TEST_SECRET =
  'test-session-secret-32-characters-minimum-value';
const TEST_SALT = Buffer.from(
  '0123456789abcdef',
  'utf8'
);

function makeReq(method, body, cookie = '') {
  return {
    method,
    body,
    headers: {
      cookie
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
      this.body += value;
    }
  };
}

function body(res) {
  return res.body ? JSON.parse(res.body) : null;
}

function withEnv(name, value, fn) {
  const had = Object.prototype.hasOwnProperty.call(
    process.env,
    name
  );
  const previous = process.env[name];

  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }

  try {
    return fn();
  } finally {
    if (had) {
      process.env[name] = previous;
    } else {
      delete process.env[name];
    }
  }
}

let checks = 0;

function check(condition, message) {
  assert.ok(condition, message);
  checks += 1;
}

process.env.FINROOM_SESSION_SECRET = TEST_SECRET;

process.env.FINROOM_ACCESS_CODE_HASH =
  auth.createAccessCodeHash(TEST_CODE, TEST_SALT);

/* 1 — encoded format */
check(
  process.env.FINROOM_ACCESS_CODE_HASH.startsWith(
    'scrypt$16384$8$1$'
  ),
  'scrypt format'
);

/* 2 — plaintext must not appear in encoded verifier */
check(
  !process.env.FINROOM_ACCESS_CODE_HASH.includes(TEST_CODE),
  'hash must not contain plaintext code'
);

/* 3 — correct code */
check(
  auth.verifyAccessCode(TEST_CODE) === true,
  'correct code accepted'
);

/* 4 — wrong code */
check(
  auth.verifyAccessCode('wrong-code') === false,
  'wrong code rejected'
);

/* 5 — deterministic hash for deterministic test salt */
check(
  auth.createAccessCodeHash(TEST_CODE, TEST_SALT) ===
    process.env.FINROOM_ACCESS_CODE_HASH,
  'deterministic fixture'
);

/* 6 — malformed hash must fail closed */
withEnv(
  'FINROOM_ACCESS_CODE_HASH',
  'not-a-scrypt-hash',
  () => {
    assert.throws(
      () => auth.verifyAccessCode(TEST_CODE)
    );
  }
);
checks += 1;

/* 7 — unsupported scrypt parameters must fail closed */
{
  const valid = process.env.FINROOM_ACCESS_CODE_HASH;
  const bad = valid.replace(
    'scrypt$16384$8$1$',
    'scrypt$32768$8$1$'
  );

  withEnv(
    'FINROOM_ACCESS_CODE_HASH',
    bad,
    () => {
      assert.throws(
        () => auth.verifyAccessCode(TEST_CODE)
      );
    }
  );
}
checks += 1;

/* 8 — missing hash => login 503 */
withEnv(
  'FINROOM_ACCESS_CODE_HASH',
  undefined,
  () => {
    const res = makeRes();
    login(
      makeReq('POST', { code: TEST_CODE }),
      res
    );

    check(
      res.statusCode === 503,
      'missing access hash must produce 503'
    );

    check(
      body(res).ok === false,
      'missing access hash response must be generic'
    );
  }
);

/* 10 — malformed hash => login 503 */
withEnv(
  'FINROOM_ACCESS_CODE_HASH',
  'scrypt$bad',
  () => {
    const res = makeRes();
    login(
      makeReq('POST', { code: TEST_CODE }),
      res
    );

    check(
      res.statusCode === 503,
      'malformed access hash must produce 503'
    );
  }
);

/* Restore valid verifier. */
process.env.FINROOM_ACCESS_CODE_HASH =
  auth.createAccessCodeHash(TEST_CODE, TEST_SALT);

/* 11 — missing session secret after valid code => login 503 */
withEnv(
  'FINROOM_SESSION_SECRET',
  undefined,
  () => {
    const res = makeRes();

    login(
      makeReq('POST', { code: TEST_CODE }),
      res
    );

    check(
      res.statusCode === 503,
      'missing session secret must produce login 503'
    );

    check(
      !res.getHeader('Set-Cookie'),
      'missing secret must not create cookie'
    );
  }
);

/* 13 — too-short session secret => login 503 */
withEnv(
  'FINROOM_SESSION_SECRET',
  'short',
  () => {
    const res = makeRes();

    login(
      makeReq('POST', { code: TEST_CODE }),
      res
    );

    check(
      res.statusCode === 503,
      'short session secret must produce 503'
    );
  }
);

/* Restore session secret. */
process.env.FINROOM_SESSION_SECRET = TEST_SECRET;

/* 14 — signed token valid */
const fixedNow = 1800000000000;
const token = auth.createSessionToken(fixedNow);

check(
  auth.verifySessionToken(token, fixedNow + 1000) !== null,
  'signed token valid'
);

/* 15 — tampered token rejected */
check(
  auth.verifySessionToken(
    `${token}x`,
    fixedNow + 1000
  ) === null,
  'tampered token rejected'
);

/* 16 — expired token rejected */
check(
  auth.verifySessionToken(
    token,
    fixedNow +
      (auth.SESSION_MAX_AGE_SECONDS * 1000) +
      1
  ) === null,
  'expired token rejected'
);

/* 17 — missing secret => session endpoint 503 */
withEnv(
  'FINROOM_SESSION_SECRET',
  undefined,
  () => {
    const liveToken = (() => {
      process.env.FINROOM_SESSION_SECRET = TEST_SECRET;
      const generated = auth.createSessionToken();
      delete process.env.FINROOM_SESSION_SECRET;
      return generated;
    })();

    const pair =
      `${auth.COOKIE_NAME}=${encodeURIComponent(liveToken)}`;

    const res = makeRes();

    session(
      makeReq('GET', undefined, pair),
      res
    );

    check(
      res.statusCode === 503,
      'missing session secret must produce session 503'
    );

    check(
      body(res).authenticated === false,
      'session 503 response must be generic'
    );
  }
);

process.env.FINROOM_SESSION_SECRET = TEST_SECRET;

/* 19 — cookie security remains intact */
const cookie = auth.sessionCookie(
  auth.createSessionToken()
);

check(cookie.includes('HttpOnly'), 'HttpOnly retained');
check(cookie.includes('Secure'), 'Secure retained');
check(
  cookie.includes('SameSite=Strict'),
  'SameSite Strict retained'
);
check(cookie.includes('Path=/'), 'root path retained');
check(
  cookie.includes('Max-Age=3600'),
  'one-hour max age retained'
);

/* 24 — response must not contain secrets */
{
  const res = makeRes();

  login(
    makeReq('POST', { code: 'wrong-code' }),
    res
  );

  const serialized = String(res.body);

  check(
    !serialized.includes(TEST_CODE),
    'response does not leak access code'
  );

  check(
    !serialized.includes(TEST_SECRET),
    'response does not leak session secret'
  );

  check(
    !serialized.includes(
      process.env.FINROOM_ACCESS_CODE_HASH
    ),
    'response does not leak verifier'
  );
}

console.log('FINROOM_AUTH_HARDENING_SMOKE=PASS');
console.log(`HARDENING_CHECKS=${checks}`);

'use strict';

const crypto = require('crypto');

const COOKIE_NAME = 'icare_finroom_session';
const SESSION_MAX_AGE_SECONDS = 60 * 60;
const MAX_CODE_LENGTH = 256;

function noStore(res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"
  );
}

function json(res, status, payload) {
  noStore(res);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

function parseCookies(header) {
  const result = Object.create(null);

  if (!header || typeof header !== 'string') {
    return result;
  }

  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;

    const name = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();

    if (!name) continue;

    try {
      result[name] = decodeURIComponent(value);
    } catch {
      result[name] = value;
    }
  }

  return result;
}

function base64urlEncode(value) {
  return Buffer.from(value).toString('base64url');
}

function base64urlDecode(value) {
  return Buffer.from(value, 'base64url');
}

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEY_LENGTH = 32;
const SCRYPT_SALT_BYTES = 16;
const SCRYPT_MAXMEM = 64 * 1024 * 1024;

function deriveAccessCodeKey(
  code,
  salt,
  {
    N = SCRYPT_N,
    r = SCRYPT_R,
    p = SCRYPT_P,
    keyLength = SCRYPT_KEY_LENGTH
  } = {}
) {
  return crypto.scryptSync(
    code,
    salt,
    keyLength,
    {
      N,
      r,
      p,
      maxmem: SCRYPT_MAXMEM
    }
  );
}

function createAccessCodeHash(
  code,
  salt = crypto.randomBytes(SCRYPT_SALT_BYTES)
) {
  if (
    typeof code !== 'string' ||
    code.length === 0 ||
    code.length > MAX_CODE_LENGTH
  ) {
    throw new Error('Access code is invalid');
  }

  if (
    !Buffer.isBuffer(salt) ||
    salt.length < SCRYPT_SALT_BYTES
  ) {
    throw new Error('Access code salt is invalid');
  }

  const derived = deriveAccessCodeKey(code, salt);

  return [
    'scrypt',
    SCRYPT_N,
    SCRYPT_R,
    SCRYPT_P,
    salt.toString('base64url'),
    derived.toString('base64url')
  ].join('$');
}

function parseAccessCodeHash(encoded) {
  if (typeof encoded !== 'string') {
    throw new Error('FINROOM_ACCESS_CODE_HASH is missing or invalid');
  }

  const parts = encoded.split('$');

  if (parts.length !== 6 || parts[0] !== 'scrypt') {
    throw new Error('FINROOM_ACCESS_CODE_HASH is missing or invalid');
  }

  const N = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);

  if (
    N !== SCRYPT_N ||
    r !== SCRYPT_R ||
    p !== SCRYPT_P
  ) {
    throw new Error('FINROOM_ACCESS_CODE_HASH parameters are invalid');
  }

  let salt;
  let expected;

  try {
    salt = Buffer.from(parts[4], 'base64url');
    expected = Buffer.from(parts[5], 'base64url');
  } catch {
    throw new Error('FINROOM_ACCESS_CODE_HASH encoding is invalid');
  }

  /*
   * Node's base64url decoder is permissive. Validate by canonical
   * round-trip so malformed/non-canonical environment values fail closed.
   */
  if (
    salt.length < SCRYPT_SALT_BYTES ||
    expected.length !== SCRYPT_KEY_LENGTH ||
    salt.toString('base64url') !== parts[4] ||
    expected.toString('base64url') !== parts[5]
  ) {
    throw new Error('FINROOM_ACCESS_CODE_HASH payload is invalid');
  }

  return {
    N,
    r,
    p,
    salt,
    expected
  };
}

function getAccessCodeHash() {
  const encoded = process.env.FINROOM_ACCESS_CODE_HASH;

  /*
   * Parse here so a malformed environment value is a configuration
   * failure rather than an authentication failure.
   */
  parseAccessCodeHash(encoded);

  return encoded;
}

function verifyAccessCode(code) {
  if (
    typeof code !== 'string' ||
    code.length === 0 ||
    code.length > MAX_CODE_LENGTH
  ) {
    return false;
  }

  const {
    N,
    r,
    p,
    salt,
    expected
  } = parseAccessCodeHash(getAccessCodeHash());

  const supplied = deriveAccessCodeKey(
    code,
    salt,
    {
      N,
      r,
      p,
      keyLength: expected.length
    }
  );

  return (
    supplied.length === expected.length &&
    crypto.timingSafeEqual(supplied, expected)
  );
}

function getSessionSecret() {
  const secret = process.env.FINROOM_SESSION_SECRET;

  if (typeof secret !== 'string' || secret.length < 32) {
    throw new Error(
      'FINROOM_SESSION_SECRET is missing or too short'
    );
  }

  return secret;
}

function signEncodedPayload(encodedPayload, secret) {
  return crypto
    .createHmac('sha256', secret)
    .update(encodedPayload, 'utf8')
    .digest('base64url');
}

function createSessionToken(nowMs = Date.now()) {
  const secret = getSessionSecret();
  const nowSeconds = Math.floor(nowMs / 1000);

  const payload = {
    v: 1,
    iat: nowSeconds,
    exp: nowSeconds + SESSION_MAX_AGE_SECONDS,
    nonce: crypto.randomBytes(16).toString('base64url')
  };

  const encodedPayload = base64urlEncode(
    JSON.stringify(payload)
  );

  const signature = signEncodedPayload(
    encodedPayload,
    secret
  );

  return `${encodedPayload}.${signature}`;
}

function verifySessionToken(token, nowMs = Date.now()) {
  if (
    typeof token !== 'string' ||
    token.length < 20 ||
    token.length > 2048
  ) {
    return null;
  }

  const parts = token.split('.');

  if (parts.length !== 2) {
    return null;
  }

  const [encodedPayload, suppliedSignature] = parts;
  const secret = getSessionSecret();

  const expectedSignature = signEncodedPayload(
    encodedPayload,
    secret
  );

  const suppliedBuffer = Buffer.from(
    suppliedSignature,
    'utf8'
  );

  const expectedBuffer = Buffer.from(
    expectedSignature,
    'utf8'
  );

  if (
    suppliedBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(
      suppliedBuffer,
      expectedBuffer
    )
  ) {
    return null;
  }

  let payload;

  try {
    payload = JSON.parse(
      base64urlDecode(encodedPayload).toString('utf8')
    );
  } catch {
    return null;
  }

  const nowSeconds = Math.floor(nowMs / 1000);

  if (
    !payload ||
    payload.v !== 1 ||
    !Number.isInteger(payload.iat) ||
    !Number.isInteger(payload.exp) ||
    typeof payload.nonce !== 'string' ||
    payload.nonce.length < 8 ||
    payload.exp <= nowSeconds ||
    payload.iat > nowSeconds + 60 ||
    payload.exp - payload.iat !== SESSION_MAX_AGE_SECONDS
  ) {
    return null;
  }

  return payload;
}

function sessionCookie(token) {
  return [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    `Max-Age=${SESSION_MAX_AGE_SECONDS}`,
    'HttpOnly',
    'Secure',
    'SameSite=Strict'
  ].join('; ');
}

function expiredSessionCookie() {
  return [
    `${COOKIE_NAME}=`,
    'Path=/',
    'Max-Age=0',
    'HttpOnly',
    'Secure',
    'SameSite=Strict'
  ].join('; ');
}

function getRequestSession(req) {
  const cookies = parseCookies(
    req && req.headers ? req.headers.cookie : ''
  );

  return verifySessionToken(cookies[COOKIE_NAME]);
}

function requireMethod(req, res, method) {
  if (!req || req.method !== method) {
    noStore(res);
    res.setHeader('Allow', method);
    json(res, 405, { ok: false });
    return false;
  }

  return true;
}

function parseJsonBody(req) {
  if (
    req &&
    req.body &&
    typeof req.body === 'object' &&
    !Buffer.isBuffer(req.body)
  ) {
    return req.body;
  }

  if (
    req &&
    typeof req.body === 'string' &&
    req.body.length <= 4096
  ) {
    try {
      return JSON.parse(req.body);
    } catch {
      return null;
    }
  }

  return null;
}

module.exports = {
  COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
  MAX_CODE_LENGTH,
  noStore,
  json,
  createAccessCodeHash,
  parseAccessCodeHash,
  verifyAccessCode,
  createSessionToken,
  verifySessionToken,
  sessionCookie,
  expiredSessionCookie,
  getRequestSession,
  requireMethod,
  parseJsonBody
};

'use strict';

const {
  COOKIE_NAME,
  verifySessionToken
} = require('./_finroom-auth');

const {
  loadModelFromEnvironment,
  buildFinancialPresentation
} = require('./_finroom-model');

function setSecurityHeaders(res) {
  res.setHeader(
    'Cache-Control',
    'no-store, max-age=0'
  );
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader(
    'X-Content-Type-Options',
    'nosniff'
  );
  res.setHeader(
    'Content-Type',
    'application/json; charset=utf-8'
  );
}

function sendJson(res, statusCode, body) {
  res.statusCode = statusCode;
  res.end(JSON.stringify(body));
}

function parseCookies(header) {
  if (typeof header !== 'string' || header.length === 0) {
    return {};
  }

  const cookies = {};

  for (const part of header.split(';')) {
    const index = part.indexOf('=');

    if (index <= 0) {
      continue;
    }

    const name = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();

    if (!name) {
      continue;
    }

    try {
      cookies[name] = decodeURIComponent(value);
    } catch {
      cookies[name] = value;
    }
  }

  return cookies;
}

module.exports = function finroomData(req, res) {
  setSecurityHeaders(res);

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');

    return sendJson(
      res,
      405,
      { error: 'method_not_allowed' }
    );
  }

  /*
   * Security ordering is deliberate:
   * authenticate first, then touch the private financial model.
   */
  const cookies = parseCookies(
    req.headers && req.headers.cookie
  );

  const token = cookies[COOKIE_NAME];

  if (!token) {
    return sendJson(
      res,
      401,
      { error: 'authentication_required' }
    );
  }

  let session;

  try {
    session = verifySessionToken(token);
  } catch {
    /*
     * A missing/invalid server-side session configuration
     * is an operational failure, not an authentication result.
     */
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

  try {
    const model = loadModelFromEnvironment();
    const presentation =
      buildFinancialPresentation(model);

    return sendJson(
      res,
      200,
      {
        ok: true,
        data: presentation
      }
    );
  } catch {
    /*
     * Never expose environment values, parser details,
     * validation paths or internal exception messages.
     */
    return sendJson(
      res,
      503,
      { error: 'service_unavailable' }
    );
  }
};

module.exports.parseCookies = parseCookies;

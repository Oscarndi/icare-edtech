'use strict';

const {
  json,
  verifyAccessCode,
  createSessionToken,
  sessionCookie,
  requireMethod,
  parseJsonBody
} = require('./_finroom-auth');

module.exports = function handler(req, res) {
  if (!requireMethod(req, res, 'POST')) {
    return;
  }

  const body = parseJsonBody(req);

  if (
    !body ||
    typeof body.code !== 'string'
  ) {
    return json(res, 401, { ok: false });
  }

  try {
    if (!verifyAccessCode(body.code)) {
      return json(res, 401, { ok: false });
    }

    const token = createSessionToken();

    const cookie = sessionCookie(token);

    res.setHeader(
      'Set-Cookie',
      cookie
    );

    return json(res, 200, { ok: true });
  } catch {
    /*
     * Authentication/configuration failures remain intentionally
     * opaque to the client. Internal secret shape, verifier metadata
     * and diagnostic-stage details must not be exposed or logged here.
     */
    return json(res, 503, { ok: false });
  }
};

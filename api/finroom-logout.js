'use strict';

const {
  json,
  expiredSessionCookie,
  requireMethod
} = require('./_finroom-auth');

module.exports = function handler(req, res) {
  if (!requireMethod(req, res, 'POST')) {
    return;
  }

  res.setHeader(
    'Set-Cookie',
    expiredSessionCookie()
  );

  return json(res, 200, { ok: true });
};

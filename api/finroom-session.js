'use strict';

const {
  json,
  getRequestSession,
  requireMethod
} = require('./_finroom-auth');

module.exports = function handler(req, res) {
  if (!requireMethod(req, res, 'GET')) {
    return;
  }

  try {
    const session = getRequestSession(req);

    if (!session) {
      return json(
        res,
        401,
        {
          authenticated: false
        }
      );
    }

    return json(
      res,
      200,
      {
        authenticated: true,
        expiresAt: new Date(
          session.exp * 1000
        ).toISOString()
      }
    );
  } catch {
    return json(
      res,
      503,
      {
        authenticated: false
      }
    );
  }
};

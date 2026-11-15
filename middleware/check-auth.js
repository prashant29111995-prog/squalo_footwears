var jwt = require('jsonwebtoken');
const config = require('../config/config');
const { roles } = require('../config/roles');

exports.grantAccess = function (action, resource) {
  return async (req, res, next) => {
    try {
      if (req.user.user_type === 'Client') {
        const permission = roles.can(req.user.user_type)[action](resource);
        if (!permission.granted) {
          return res.status(401).json({
            error: 'Some Error !!',
          });
        }
      } else {
        const permission = roles
          .can(req.user.userDetails.user_role)
        [action](resource);
        if (!permission.granted) {
          return res.status(401).json({
            error: 'Some Error !!',
          });
        }
      }
      next();
    } catch (error) {
      next(error);
    }
  };
};
exports.checkAuth = (req, res, next) => {
  let token =
    req.headers['x-access-token'] ||
    req.headers['authorization'] ||
    req.cookies.auth;
  // Express headers are auto converted to lowercase
  if (!!token && token.startsWith('Bearer ')) {
    // Remove Bearer from string
    token = token.slice(7, token.length).trimLeft();
  }
  if (!token) {
    return res.status(401).redirect('/login');
  }
  try {
    const decode = jwt.verify(token, config.secret);
    req.user = decode;
    if (!decode) {
      if (req.method !== 'GET') {
        res.send({
          redirect: '/logout',
        });
      }
      return res.redirect('/logout');
    }
    next();
  } catch (error) {
    if (req.method !== 'GET') {
      return res.send({
        redirect: '/logout',
      });
    }
    delete req.decoded;
    return res.status(401).redirect('/logout');
  }
};
// Authentication for JSON API routes.
exports.checkApiAuth = (req, res, next) => {
  let token =
    req.headers["x-access-token"] ||
    req.headers.authorization ||
    (req.cookies && req.cookies.auth);

  if (typeof token !== "string") {
    return res.status(401).json({
      ok: false,
      message: "Please sign in to continue",
    });
  }

  token = token.replace(/^Bearer\s+/i, "").trim();

  if (!token) {
    return res.status(401).json({
      ok: false,
      message: "Please sign in to continue",
    });
  }

  try {
    const decoded = jwt.verify(token, config.secret);

    if (!decoded || typeof decoded !== "object") {
      throw new Error("Invalid authentication token");
    }

    req.user = decoded;
    return next();
  } catch (error) {
    return res.status(401).json({
      ok: false,
      message: "Your session has expired. Please sign in again.",
    });
  }
};

// Permission checks for the central footwear administration APIs.
exports.requireFootwearAdmin = (action) => {
  const allowedActions = [
    "readAny",
    "createAny",
    "updateAny",
    "deleteAny",
  ];

  if (!allowedActions.includes(action)) {
    throw new Error("Invalid footwear permission action");
  }

  return (req, res, next) => {
    const user = req.user;

    if (!user) {
      return res.status(401).json({
        ok: false,
        message: "Please sign in to continue",
      });
    }

    const role =
      user.user_type === "Client"
        ? "Client"
        : user.userDetails && user.userDetails.user_role;

    // These routes manage the central business, not a buyer's own POS.
    if (role !== "SuperAdmin") {
      return res.status(403).json({
        ok: false,
        message: "Only the central Super Admin can perform this action",
      });
    }

    try {
      const permission = roles
        .can(role)
        [action]("footwearAdministration");

      if (!permission.granted) {
        return res.status(403).json({
          ok: false,
          message: "You do not have permission to perform this action",
        });
      }

      return next();
    } catch (error) {
      return next(error);
    }
  };
};
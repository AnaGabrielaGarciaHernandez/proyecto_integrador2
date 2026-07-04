function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      const error = new Error('Authentication required');
      error.status = 401;
      return next(error);
    }

    if (!roles.includes(req.user.role)) {
      const error = new Error('Insufficient permissions');
      error.status = 403;
      return next(error);
    }

    return next();
  };
}

module.exports = requireRole;

function notFound(req, res, next) {
  const error = new Error(`Route not found: ${req.method} ${req.originalUrl}`);
  error.status = 404;
  next(error);
}

function errorHandler(error, req, res, next) {
  const status = error.status || error.statusCode || 500;
  const isProduction = process.env.NODE_ENV === 'production';

  if (status >= 500) {
    console.error(error);
  }

  res.status(status).json({
    error: {
      message: status >= 500 && isProduction ? 'Internal server error' : error.message,
      details: error.details,
    },
  });
}

module.exports = {
  notFound,
  errorHandler,
};

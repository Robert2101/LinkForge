export function errorHandler(err, req, res, next) {
  const status = err.statusCode || 500;

  req.log?.error({ err }, "Request failed");

  res.status(status).json({
    error: {
      message: status === 500 ? "Internal server error" : err.message,
    },
  });
}

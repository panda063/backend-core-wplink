// Not Found Hanlder middleare
const { NotFound } = require('../lib/errors');

module.exports = function NotFoundMiddleware(req, res, next) {
  return next(new NotFound());
};

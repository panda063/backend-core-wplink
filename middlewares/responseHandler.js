// response(only for successful) handler middleware
/**
 * @apiSuccessExample  Success-Response:
 *         {
 *              success: true,
 *              status: < 400,
 *              message? : '',
 *              data: {},
 *          }
 *
 */
module.exports = function responseHandler(req, res, next) {
    // Only used for successful responses
    res.respond = function respond(status = 200, message = 'OK', data = {}) {
        // const user = res.locals && res.locals.user;
        if (req.headers['x-request-time']) {
            res.set('request-starttime', req.headers['x-request-time']);
        }
        const response = {
            success: status < 400,
            status,
            message,
            data,
        };

        res.status(status).json(response);
    };

    next();
};

/**
 * Handles controller execution and responds to user (API Express version).
 * Web socket has a similar handler implementation.
 * @param promise Controller Promise. I.e. getUser.
 * @param params A function (req, res, next), all of which are optional
 * @param executeNext If true execute next()
 * that maps our desired controller parameters. I.e. (req) => [req.params.username, ...].
 */
const { omit } = require('lodash');
const {
    JWTCOOKIE_EXPIRY,
    REFRESH_JWTCOOKIE_EXPIRY,
    JWT_COOKIE_NAMES,
} = require('../lib/constants');
const env = require('../config/env');

function controllerHandler(params, promise, executeNext = false) {
    return async function serviceAsMiddlewareWrapper(req, res, next) {
        const boundParams = params ? params(req, res, next) : {};
        try {
            let data = await promise(boundParams);
            let message;
            if (data && typeof data.msg === 'string' && data.msg.length > 0) {
                message = data.msg;
                data = omit(data, ['msg']);
            }
            // If the return data conatins jwtForCookie and refreshJwtForCookie fields
            // It means that we also want to set cookie in the response
            if (
                data &&
                typeof data.jwtForCookie == 'string' &&
                typeof data.refreshJwtForCookie == 'string'
            ) {
                const options = {
                    httpOnly: true,
                };
                if (env.NODE_ENV == 'prod') {
                    options.sameSite = 'Strict';
                    options.domain = '.passionbits.io';
                }
                if (env.NODE_ENV == 'dev' && process.env.HTTPS) {
                    options.sameSite = 'None';
                    options.secure = true;
                }
                res.cookie(
                    JWT_COOKIE_NAMES.LOGIN_TOKEN_NAME,
                    data.jwtForCookie,
                    {
                        ...options,
                        maxAge: JWTCOOKIE_EXPIRY,
                    },
                );
                res.cookie(
                    JWT_COOKIE_NAMES.REFRESH_TOKEN_NAME,
                    data.refreshJwtForCookie,
                    {
                        ...options,
                        maxAge: REFRESH_JWTCOOKIE_EXPIRY,
                    },
                );
                data = omit(data, ['jwtForCookie', 'refreshJwtForCookie']);
            }

            // adding body object to res
            res.body = data;

            if (executeNext) {
                res.respond(200, message, data);
                next();
            } else return res.respond(200, message, data);
        } catch (error) {
            next(error);
        }
    };
}

module.exports = controllerHandler;

/**
 * * Utility for logging errors. Primarily used by the error handler middleware
 */

const { createLogger, format, transports } = require('winston');
const { isPlainObject, omit } = require('lodash');
const appRoot = require('app-root-path');
const { CustomError } = require('./errors');
const env = require('../config/env');

const newrelic = require('newrelic');

// using npm log levels which comes default
const logger = createLogger({
    exitOnError: false,
});
/**
 * In production disable console and log to file
 *
 */
if (process.env.NODE_ENV === 'prod') {
    // console transport
    logger.add(
        new transports.File({
            level: 'info',
            filename: `${appRoot}/logs/error.log`,
            handleExceptions: true,
            json: true,
            maxsize: 5242880, // 5MB
            maxFiles: 40,
            colorize: false,
        }),
    );
} else {
    // console transport
    logger.add(
        new transports.Console({
            level: 'info',
            handleExceptions: true,
            format: format.combine(
                format.colorize(),
                format.timestamp(),
                format.splat(),
                format.simple(),
            ),
        }),
    );
}
/**
 * To not show error in testing and focus only on failed test cases
 * Silent Console exceptions in testing env
 */
if (process.env.APP_ENV === 'test') {
    logger.transports.forEach((t) => (t.silent = true));
}
const loggerInterface = {
    info(...args) {
        logger.info(...args);
    },

    // Accepts two argument,
    // an Error object (required)
    // and an object of additional data to log alongside the error
    // If the first argument isn't an Error, it'll call logger.error with all the arguments supplied
    error(...args) {
        const [err, errorData = {}, ...otherArgs] = args;
        if (err instanceof Error) {
            // pass the error.stack as first parameter to logger.error
            const stack = err.stack || err.message || err;
            if (isPlainObject(errorData) && !errorData.fullError) {
                // If the error object has interesting data
                // (not only status, message and name from the CustomError class)
                // add it to the logs
                if (err instanceof CustomError) {
                    const errWithoutCommonProps = omit(err, [
                        'name',
                        'status',
                        'message',
                    ]);

                    if (Object.keys(errWithoutCommonProps).length > 0) {
                        errorData.fullError = errWithoutCommonProps;
                    }
                } else {
                    errorData.fullError = err;
                }
            }

            const loggerArgs = [stack, errorData, ...otherArgs];
            // Treat 4xx errors that are handled as warnings, 5xx and uncaught errors as serious problems
            if (
                !errorData ||
                !errorData.isHandledError ||
                errorData.status >= 500
            ) {
                logger.error(...loggerArgs);
            } else {
                logger.warn(...loggerArgs);
            }
            if (err instanceof CustomError && env.NODE_ENV !== 'dev') {
                newrelic.noticeError(err, {
                    userId: errorData.userId || '-',
                    userEmail: errorData.userEmail || '-',
                });
            }
        } else {
            logger.error(args);
        }
    },
};

module.exports = loggerInterface;

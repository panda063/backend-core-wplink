// Error Handler middleware that handles all error
// and respond to client
const { isCelebrateError } = require('celebrate');
const { omit } = require('lodash');
const {
    CustomError,
    BadRequest,
    InternalServerError,
    NotAuthorized,
    JobBulkValidationError,
} = require('../lib/errors');
const logger = require('../lib/logger');

function errorHandler(err, req, res, next) {
    // if err is of type CustomError use its data
    // else figure out what type of error it is like -
    // - (AuthenticationError, ValidationError(Mongoose), ValidationError(Celebrate), ...)
    // if we can't identify repond with generic InternalServerError(500)
    let responseError = err instanceof CustomError ? err : null;

    // AuthenticationError thrown by passport
    if (err.name === 'AuthenticationError') {
        responseError = new NotAuthorized();
    }

    // celebrate(Joi) ValidationError
    if (isCelebrateError(err) || err.isJoi === true) {
        let keys = Array.from(err.details.keys());
        // take message from err.details[0]
        const customMessage = err.details.get(keys[0]).message;
        const stack = err.stack.replace('Validation failed', customMessage);
        responseError = new BadRequest(customMessage, 'GL100', stack);
    }

    if (err.name === 'ValidationError') {
        // Mongoose ValidationError
        // take message from err
        const customMessage = err.message;
        responseError = new BadRequest(customMessage, 'GL101');
    }

    // job bulk validation errors
    if (err instanceof JobBulkValidationError) {
        responseError.errors = err.errors;
    }

    if (!responseError || !responseError.status) {
        // Try to identify the error...
        // ...
        // Otherwise create an InternalServerError and use it
        // we don't want to leak anything, just a generic error message
        // Use it also in case of identified errors but with httpCode === 500
        responseError = new InternalServerError(err.message, err.stack);
    }

    // log the error
    logger.error(responseError, {
        method: req.method,
        originalUrl: req.originalUrl,
        // don't send sensitive information that adds only noise
        headers: omit(req.headers, ['postman-token']),
        body: omit(req.body, ['password']),
        status: responseError.status,
        isHandledError: responseError.status < 500,
        // User info if available
        userId: req && req.user && req.user.id ? req.user.id : '-',
        userEmail: req && req.user && req.user.email ? req.user.email : '-',
    });

    const jsonRes = {
        success: false,
        status: responseError.status,
        error: responseError.name,
        message: responseError.message,
        errorCode: responseError.errorCode || 'CND', // Code not defined
    };
    if (responseError.errors) {
        jsonRes.errors = responseError.errors;
    }

    res.status(responseError.status).json(jsonRes);
}

module.exports = errorHandler;

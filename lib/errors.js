// Error utility
class CustomError extends Error {
    constructor() {
        super();
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, this.constructor);
        }
    }
}

class BadRequest extends CustomError {
    constructor(customMessage, customErrorCode, stack) {
        super();
        this.name = this.constructor.name;
        this.status = 400;
        this.message = customMessage || 'Bad Request.';
        this.errorCode = customErrorCode || 'CND'; // CND: Code not defined
        if (stack) this.stack = stack;
    }
}

class NotAuthorized extends CustomError {
    constructor(customMessage, customErrorCode, stack) {
        super();
        this.name = this.constructor.name;
        this.status = 401;
        this.message = customMessage || 'Not Authorized.';
        this.errorCode = customErrorCode || 'CND'; // CND: Code not defined
        if (stack) this.stack = stack;
    }
}

class ForbiddenRequest extends CustomError {
    constructor(customMessage, customErrorCode, stack) {
        super();
        this.name = this.constructor.name;
        this.status = 403;
        this.message = customMessage || 'Forbidden Request.';
        this.errorCode = customErrorCode || 'CND'; // CND: Code not defined
        if (stack) this.stack = stack;
    }
}

class NotFound extends CustomError {
    constructor(customMessage, stack) {
        super();
        this.name = this.constructor.name;
        this.status = 404;
        this.message = customMessage || 'Not Found.';
        if (stack) this.stack = stack;
    }
}

class InternalServerError extends CustomError {
    constructor(customMessage, stack) {
        super();
        this.name = this.constructor.name;
        this.status = 500;
        this.message = customMessage || 'Internal Server Error.';
        if (stack) this.stack = stack;
    }
}

class GoogleApiError extends CustomError {
    constructor(customMessage, httpError) {
        super();
        this.name = this.constructor.name;
        this.message = customMessage || 'Google API Error.';
        this.httpError = httpError;
    }
}

class JobBulkValidationError extends BadRequest {
    constructor(customMessage = 'Job Bulk Validation Error', errors) {
        super(customMessage);
        this.errors = errors;
    }
}

module.exports = {
    CustomError,
    BadRequest,
    NotAuthorized,
    ForbiddenRequest,
    NotFound,
    InternalServerError,
    GoogleApiError,
    JobBulkValidationError,
};

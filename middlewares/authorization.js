/*
 *  Role based Access Control middleware
 */
const {
    JWTCOOKIE_EXPIRY,
    SIGNIN_TOKEN_EXPIRESIN,
    JWT_COOKIE_NAMES,
} = require('../lib/constants');
const env = require('../config/env');
const {
    ForbiddenRequest,
    NotAuthorized,
    CustomError,
    BadRequest,
} = require('../lib/errors');

const userController = require('../controllers/user');
const { validateToken, generateToken } = require('../lib/jwt');

/**
 * Function to create a new login token using a valid refersh token
 */
async function generateLoginTokenFromRefreshToken(refreshToken) {
    const decoded = await validateToken({ token: refreshToken });
    const loginToken = await generateToken({
        data: { ...decoded.data },
        expiresIn: SIGNIN_TOKEN_EXPIRESIN,
    });
    const criteria = { id: decoded.data.id, role: decoded.data.role };
    const loginUser = await userController.getUser(criteria);
    return { loginToken, loginUser };
}

/**
 * User authentication middleware using the jwt login token
 * If login token expired generate and set a new login token in cookie. This is possible if user has a valid refresh token
 */

/**
 *
 * @param {*} passport - Configured passport object
 * @param {*} skipError - When true, errors are skipped. req.user will be undefined. This is useful in cases where returned data can be publicly viewed. Ex. Portfolio Data
 */
exports.passportAuthenticate = (passport, skipError = false) => {
    return (req, res, next) => {
        if (
            req.headers.authorization &&
            req.headers.authorization.includes('Bearer')
        ) {
            // JWT based token authentication allowed for ExtClient user
            passport.authenticate('jwt-ext-client', {
                session: false,
                failWithError: true,
            })(req, res, next);
        } else {
            passport.authenticate(
                'jwt',
                { session: false, failWithError: true },
                // Custom callback function
                async function (err, user, info) {
                    try {
                        if (err || !user) {
                            /**
                             * If authentication fails and error is not a custom error type (token validation failed from jwt) we set a new login token using the refresh token
                             */
                            if (
                                !(err instanceof CustomError) &&
                                req.cookies &&
                                req.cookies[JWT_COOKIE_NAMES.REFRESH_TOKEN_NAME]
                            ) {
                                const refreshToken =
                                    req.cookies[
                                        JWT_COOKIE_NAMES.REFRESH_TOKEN_NAME
                                    ];
                                const { loginToken, loginUser } =
                                    await generateLoginTokenFromRefreshToken(
                                        refreshToken,
                                    );
                                /**
                                 * Set a new login token cookie(jwt)
                                 */
                                const options = {
                                    httpOnly: true,
                                };
                                if (env.NODE_ENV == 'prod') {
                                    options.sameSite = 'Strict';
                                    options.domain = '.passionbits.io';
                                }
                                res.cookie(
                                    JWT_COOKIE_NAMES.LOGIN_TOKEN_NAME,
                                    loginToken,
                                    {
                                        ...options,
                                        maxAge: JWTCOOKIE_EXPIRY,
                                    },
                                );
                                // Logged in user object
                                user = loginUser;
                            } else {
                                if (skipError) return next();
                                return next(
                                    new NotAuthorized(
                                        'Login required',
                                        'GL105',
                                    ),
                                );
                            }
                        }
                        /**
                         * Set req.user = user
                         */
                        req.logIn(user, function (err) {
                            if (err) {
                                return next(err);
                            }
                            return next();
                        });
                    } catch (err) {
                        if (skipError) return next();
                        return next(
                            new NotAuthorized('Login required', 'GL105'),
                        );
                    }
                },
            )(req, res, next);
        }
    };
};

// Middleware to check if user's account status is 'ban' or 'inactive' (Don't Authorize)
exports.banGaurd = (invalidAccountStatus) => {
    return (req, res, next) => {
        const r = req.user.__t;
        const { accountStatus } = req.user;
        if (invalidAccountStatus.includes(accountStatus)) {
            return next(new ForbiddenRequest('INACTIVE_OR_BANNED'));
        }
        return next();
    };
};

// Middleware to check if user's account status is new (Don't Authorize)
exports.newUserGuard = (invalidAccountStatus) => {
    return (req, res, next) => {
        const r = req.user.__t;
        const { accountStatus } = req.user;
        if (invalidAccountStatus.includes(accountStatus)) {
            return next(new BadRequest('User details incomplete'));
        }
        return next();
    };
};

exports.roleAuth = function roleAuth(allowedRoles) {
    // if they are provided via constants module no need to validate
    return async (req, res, next) => {
        const user = req.user;
        const r = req.user.__t;
        /*
        // ! WHY? if role is 'SA' = super admin just allow
        if (r === ROLES.SA_C) {
            return next();
        }*/
        if (typeof roles === 'string') {
            allowedRoles = [allowedRoles];
        }
        if (!allowedRoles || allowedRoles.length === 0) {
            return next();
        }
        // validate incoming role with allowed roles
        if (allowedRoles.includes(r)) {
            return next();
        }
        const error = new ForbiddenRequest('Accessing with a forbidden role');
        return next(error);
    };
};

exports.roleAuthGamification = function roleAuthGamification(allowedRoles) {
    // if they are provided via constants module no need to validate
    return (req, res, next) => {
        const r = req.user.__t;
        // ! WHY? if role is 'SA' = super admin just allow
        if (r === 'ADMIN') {
            return next();
        }
        const error = new ForbiddenRequest('Accessing with a forbidden role');
        return next(error);
    };
};

exports.requiresLogin = (req, res, next) => {
    if (req.isAuthenticated()) {
        return next();
    }
    const error = new NotAuthorized('login required');
    return next(error);
};

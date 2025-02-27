/*
 * Module Dependencies
 */
const _ = require('lodash');
const passport = require('passport');
require('../config/passport');
const router = require('express').Router();
const { celebrate, Joi } = require('celebrate');
Joi.objectId = require('joi-objectid')(Joi);

const {
    JOB_BOARD_REPORT_TYPE,
    ROLES,
    SOCIAL_SHARE_OPTIONS,
    CLIENT_ROLE,
    JWT_COOKIE_NAMES,
    CREATOR_TYPES,
    ACCOUNT_STATUS,
    PROFILE_SETUP_EXPERIENCE,
    ACCOUNT_SIGNUP_MODE,
} = require('../lib/constants');
const jwt = require('../lib/jwt');
const linkGen = require('../lib/link-generator');
const env = require('../config/env');

// Controllers
const userController = require('../controllers/user');
const clientController = require('../controllers/client');
const notificationController = require('../controllers/notification');
const { addReport } = require('../controllers/user');

// Services
const { miscUpload } = require('../services/file-upload-service');

// Misc
const templateData = require('../assets/templates/templates.json')[
    env.NODE_ENV
];

/*
 * Route Middlewares
 */

const c = require('./helper');
const {
    passportAuthenticate,
    roleAuth,
    banGaurd,
    newUserGuard,
} = require('../middlewares/authorization');

const {
    preUploadMiddleware,
    logoUploadErrorHandler,
} = require('./middlewares/userMiddlewares');

const middlewares = (roles) => [
    /**
     * * Authenticate the token. This also sets user.lac = Date.now()
     */
    passportAuthenticate(passport),
    /**
     * * Check if authenticated user is authorized to access the route
     */
    roleAuth(roles),
    /**
     * * Account is new and user details are missing
     */
    newUserGuard([ACCOUNT_STATUS.NEW]),
    /**
     * * Inactive, Banned users are not allowed to access the route
     */
    banGaurd([ACCOUNT_STATUS.BAN, ACCOUNT_STATUS.INACTIVE]),
];

/**
 * @version 2.1
 * * Invite only signup/login APIs
 */

/**
 * Add creator on waitlist
 * ! Adding client to waitlist is part of gamification flow -> [Deprecated, Clients can directly sign up]
 */
router.put(
    '/user/waitlist',
    celebrate({
        body: Joi.object().keys({
            email: Joi.string().email().trim().required(),
            refId: Joi.string().trim().default(''),
            social: Joi.string()
                .valid(...Object.values(SOCIAL_SHARE_OPTIONS))
                .default(''),
        }),
    }),
    c((req) => {
        const { email, refId, social } = req.body;
        return { email, refId, social };
    }, userController.joinWaitlist),
);

// ! Email from invite only token
router.post(
    '/user/token/retrieve',
    celebrate({
        body: Joi.object().keys({
            token: Joi.string().required(),
        }),
    }),
    c((req) => {
        const { token } = req.body;
        return {
            token,
        };
    }, userController.getEmailFromToken),
);

// ! Minimum six characters, at least one lowercase letter, at least one uppercase letter and one number
const passwordRegex =
    /^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)[A-Za-z\d`!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~]{6,16}$/;

const schemaOnRole = (role) => {
    switch (role) {
        case ROLES.WRITER_C:
            return {
                body: Joi.object().keys({
                    firstName: Joi.string().trim().required(),
                    // allow empty lastName
                    lastName: Joi.string().allow('').default(''),
                    country: Joi.string().trim().required(),
                    city: Joi.string().trim().required(),
                    creatorType: Joi.string().valid('writer', 'designer'),
                    designation: Joi.string().trim().required(), // was industry
                    password: Joi.string()
                        .regex(passwordRegex)
                        .min(6)
                        .required()
                        .trim(),
                    token: Joi.string().required(),
                }),
            };
        case ROLES.CLIENT_C:
            return {
                body: Joi.object().keys({
                    password: Joi.string().required(),
                    token: Joi.string().required(),
                }),
            };
        default:
            throw new Error('signup api provided unhandled role');
    }
};
/**
 * ! @version 2.1 Invite only Sign up
 */
_.forEach([ROLES.WRITER_C, ROLES.CLIENT_C], (role) => {
    let roleForPath = role.toLowerCase();
    router.use('/v2', (req, res, next) => {
        req.locals = { role };
        next();
    });

    router.post(
        `/v2/${roleForPath}/signup`,
        celebrate(schemaOnRole(role), {
            allowUnknown: true,
        }),
        c((req) => {
            const { role } = req.locals;
            const {
                firstName,
                lastName,
                password,
                mobile,
                country,
                city,
                creatorType,
                designation,
                token,
            } = req.body;
            return {
                role,
                firstName,
                lastName,
                password,
                mobile,
                country,
                city,
                creatorType,
                designation,
                token,
            };
        }, userController.v2SignupUser),
    );
});

/**
 * @version 3.1
 */

/**
 * ! @apiName Send sign up link
 * ! @description Sends sign up link to creator
 */

router.post(
    '/v3.1/user/send-signup-link',
    celebrate({
        body: Joi.object().keys({
            email: Joi.string().email().trim().required(),
        }),
    }),
    c((req) => {
        const { email } = req.body;
        return { email };
    }, userController.v3SendSignupLink),
);

// ! Email from invite only token
router.post(
    '/v3.1/user/token/retrieve',
    celebrate({
        body: Joi.object().keys({
            token: Joi.string().required(),
        }),
    }),
    c((req) => {
        const { token } = req.body;
        return {
            token,
        };
    }, userController.getEmailFromToken),
);

/**
 * @version main
 * * Main signup/login APIs
 */

/**
 * @apiName Check creator mobile availability
 */

router.put(
    '/user/check-mobile',
    celebrate({
        body: Joi.object().keys({
            mobileCountry: Joi.string().min(1).max(8).default('+91'),
            mobile: Joi.string()
                .regex(/^[0-9]+$/)
                .min(1)
                .max(10)
                .required(),
        }),
    }),
    c((req) => {
        const { mobileCountry, mobile } = req.body;
        return { mobile, mobileCountry };
    }, userController.checkMobileAvailability),
);

/**
 * @apiName Check creator penname availability
 */

router.put(
    '/user/check-username',
    celebrate({
        body: Joi.object().keys({
            penname: Joi.string()
                .trim()
                .regex(/^(?=.{4,20}$)(?![-])(?![-]{2})[a-zA-Z0-9-]+(?<![-])$/)
                .required(),
        }),
    }),
    c((req) => {
        const { penname } = req.body;
        return { penname };
    }, userController.checkUserName),
);

// Request contains http cookie
// Check if it is valid and return data that is required for login
router.get(
    '/user/user-check',
    middlewares([ROLES.CLIENT_C, ROLES.WRITER_C, ROLES.PM_C, ROLES.GU_C]),
    c((req) => {
        const user = req.user;
        return { user };
    }, userController.userAuthCheck),
);

// Common login/logout
router.post(
    '/user/login',
    celebrate({
        body: Joi.object().keys({
            email: Joi.string().email().trim().required(),
            password: Joi.string().trim().required(),
        }),
    }),
    c((req) => {
        const { email, password } = req.body;
        return { email, password };
    }, userController.commonLoginUser),
);

// Clears jwt httpOnly cookie
router.post('/user/logout', async (req, res, next) => {
    // Web browsers and other compliant clients will only clear the cookie,
    // if the given options is identical to those given to res.cookie(), excluding expires and maxAge.
    const options = {
        httpOnly: true,
    };
    if (env.NODE_ENV == 'prod') {
        options.sameSite = 'Strict';
        options.domain = '.passionbits.io';
    }
    res.clearCookie(JWT_COOKIE_NAMES.LOGIN_TOKEN_NAME, options);
    res.clearCookie(JWT_COOKIE_NAMES.REFRESH_TOKEN_NAME, options);

    // * For backwards compatibility only
    const oldOptions = {
        httpOnly: true,
    };
    if (env.NODE_ENV == 'prod') {
        oldOptions.sameSite = 'None';
        oldOptions.secure = true;
    }
    res.clearCookie(JWT_COOKIE_NAMES.LOGIN_TOKEN_NAME, oldOptions);
    res.clearCookie(JWT_COOKIE_NAMES.REFRESH_TOKEN_NAME, oldOptions);
    return res.respond(200);
});

/*
 * user authentication APIs
 */

router.post(
    '/user/verify-email',
    celebrate({
        body: Joi.object().keys({
            email: Joi.string().email().required().trim(),
        }),
    }),
    c((req) => {
        const { email } = req.body;
        return { email };
    }, userController.sendEmailVerificationLink),
);

// Common email verification API
router.get(
    '/verify-email/:token',
    celebrate({
        params: Joi.object().keys({
            token: Joi.string().required(),
        }),
    }),
    c((req) => {
        const { token } = req.params;
        return { token };
    }, userController.verfiyEmail),
);

router.post(
    '/user/password-reset',
    celebrate({
        body: Joi.object().keys({
            email: Joi.string().email().required(),
        }),
    }),
    c((req) => {
        const { email } = req.body;
        return { email };
    }, userController.sendPasswordResetLink),
);
router.use(
    '/user/password-reset/:token',
    celebrate({
        params: Joi.object().keys({
            token: Joi.string().required(),
        }),
    }),
    async (req, res, next) => {
        const { token } = req.params;
        // decode token
        const decoded = await jwt.validateToken({ token });
        const { id, email, passwordVersion, role } = decoded.data;
        try {
            const { token: newToken } =
                await userController.verifyPasswordReset({
                    id,
                    email,
                    passwordVersion,
                });
            res.redirect(linkGen.pwdResetSuccess({ role, token: newToken }));
        } catch (err) {
            res.redirect(linkGen.pwdResetFailure({ role }));
        }
    },
);
router.put(
    '/user/password-update',
    celebrate({
        body: Joi.object().keys({
            password: Joi.string()
                .regex(passwordRegex)
                .min(6)
                .required()
                .trim(),
            token: Joi.string().required(),
        }),
    }),
    c((req) => {
        const { password, token } = req.body;
        return {
            password,
            token,
        };
    }, userController.updatePassword),
);

/**
 *
 * @description chooses validation schema based on role
 * @param {ROLE} role
 * @returns Validation Schema (dependent on Celebrate library)
 *
 */
function getValidationSchemaBasedOnRole(role, flow) {
    // Minimum six characters, at least one letter, one number and one special character:
    //  /^(?=.*[A-Za-z])(?=.*\d)(?=.*[`!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~])[A-Za-z\d`!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~]{6,}$/

    const commonSchema = {
        firstName: Joi.string().trim().required(),
        // allow empty lastName
        lastName: Joi.string().trim().allow('').default(''),
        email: Joi.string().email().required().trim(),
        password: Joi.string().regex(passwordRegex).min(6).required().trim(),
        // When sign up is via shared link
        refId: Joi.string().trim().allow(null),
        social: Joi.string()
            .valid(...Object.values(SOCIAL_SHARE_OPTIONS))
            .allow(null),
        // referrer is from documnet.referrer
        referrer: Joi.string().allow('', null).default(''),
        // this is from the pb_medium query param
        signupMedium: Joi.string().allow('', null).default(''),
    };
    switch (role) {
        case ROLES.WRITER_C:
            switch (flow) {
                case 'template-flow':
                    return {
                        body: Joi.object().keys({
                            signupMode: Joi.string()
                                .valid(...Object.values(ACCOUNT_SIGNUP_MODE))
                                .required(),

                            // Signup Form
                            email: Joi.string().email().required().trim(),

                            password: Joi.when('signupMode', {
                                is: ACCOUNT_SIGNUP_MODE.EMAIL,
                                then: Joi.string()
                                    .regex(passwordRegex)
                                    .min(6)
                                    .required()
                                    .trim(),
                                otherwise: Joi.string()
                                    .allow('')
                                    .valid('')
                                    .required(),
                            }),
                            penname: Joi.string()
                                .regex(
                                    /^(?=.{4,20}$)(?![-])(?![-]{2})[a-zA-Z0-9-]+(?<![-])$/,
                                )
                                .required(),
                            // referrer is from documnet.referrer
                            referrer: Joi.string().allow('', null).default(''),
                            // this is from the pb_medium query param
                            signupMedium: Joi.string()
                                .allow('', null)
                                .default(''),

                            // * STEP 1
                            fullname: Joi.string().trim().max(100).required(),
                            country: Joi.string().trim().required(),
                            city: Joi.string().trim().required(),
                            medium: Joi.string().valid(
                                'email',
                                'twitter',
                                'facebook',
                                'linkedin',
                                'instagram',
                                'google',
                                'referral',
                            ),
                            mobileCountry: Joi.string()
                                .min(1)
                                .max(8)
                                .default('+91'),
                            mobile: Joi.string()
                                .regex(/^[0-9]+$/)
                                .min(1)
                                .required(),
                            // * STEP 2
                            role: Joi.array()
                                .items(Joi.string().trim())
                                .min(1)
                                .max(5)
                                .default([]),
                            skills: Joi.array()
                                .items(Joi.string().trim())
                                .min(1)
                                .max(5)
                                .default([]),
                            experience: Joi.string()
                                .valid(
                                    ...Object.values(PROFILE_SETUP_EXPERIENCE),
                                )
                                .required(),
                            niche: Joi.string().allow('').default(''),

                            // template
                            templateId: Joi.string()
                                .valid(...Object.keys(templateData))
                                .required(),
                        }),
                    };
                case 'direct':
                    return {
                        body: Joi.object().keys({
                            email: Joi.string().email().required().trim(),
                            password: Joi.string()
                                .regex(passwordRegex)
                                .min(6)
                                .required()
                                .trim(),
                            penname: Joi.string()
                                .regex(
                                    /^(?=.{4,20}$)(?![-])(?![-]{2})[a-zA-Z0-9-]+(?<![-])$/,
                                )
                                .required(),
                            // referrer is from documnet.referrer
                            referrer: Joi.string().allow('', null).default(''),
                            // this is from the pb_medium query param
                            signupMedium: Joi.string()
                                .allow('', null)
                                .default(''),
                        }),
                    };
                default:
                    throw new Error('writer signup unhandled flow');
            }

        case ROLES.CLIENT_C:
            return {
                body: Joi.object().keys({
                    ...commonSchema,
                    // TODO: add valid industries
                    country: Joi.string().trim().required(),
                    industry: Joi.string().trim().required(),
                    company: Joi.string().trim().required(),
                    website: Joi.string().uri().required(),
                    clientRole: Joi.string()
                        .valid(...Object.values(CLIENT_ROLE))
                        .required(),
                }),
            };
        case ROLES.PM_C:
            return {
                body: Joi.object().keys({
                    ...commonSchema,
                    country: Joi.string().trim().required(),
                    city: Joi.string().trim().required(),
                    designation: Joi.string().trim().required(),
                    studioQA: Joi.string().default(''),
                    medium: Joi.string().valid(
                        'email',
                        'twitter',
                        'facebook',
                        'linkedin',
                        'instagram',
                        'google',
                        'referral',
                    ),
                }),
            };
        case ROLES.SA_C:
            return {
                body: Joi.object().keys(commonSchema),
            };
        default:
            throw new Error('signup api provided unhandled role');
    }
}

_.forEach([ROLES.WRITER_C, ROLES.CLIENT_C, ROLES.SA_C, ROLES.PM_C], (role) => {
    const userRootPath = `/${role.toLowerCase()}`;
    // helpers
    const generatePath = (last) => userRootPath.concat('/', last);

    router.use(userRootPath, (req, res, next) => {
        req.locals = { role };
        next();
    });

    router.post(
        generatePath('signup'),
        celebrate(getValidationSchemaBasedOnRole(role, 'direct')),
        c((req) => {
            const { role } = req.locals;
            const {
                firstName,
                lastName,
                penname,
                email,
                password,
                country,
                city,
                designation,
                medium,
                studioQA,
                industry,
                website,
                company,
                clientRole,
                refId,
                social,
                referrer,
                signupMedium,
            } = req.body;
            return {
                firstName,
                lastName,
                penname,
                email,
                password,
                role,
                country,
                city,
                designation,
                medium,
                studioQA,
                company,
                industry,
                website,
                clientRole,
                refId,
                social,
                referrer,
                signupMedium,
            };
        }, userController.signupUser),
    );

    // This API is called even for google authentication
    // Call this after you have name, email and penname from
    router.post(
        generatePath('signup-use-template'),
        celebrate(getValidationSchemaBasedOnRole(role, 'template-flow')),
        c((req) => {
            const { role } = req.locals;
            const data = req.body;
            return { role, data };
        }, userController.signupUserWriterTemplate),
    );

    router.get(
        generatePath('verify-email/:token'),
        celebrate({
            params: Joi.object().keys({
                token: Joi.string().required(),
            }),
        }),
        c((req) => {
            const { role } = req.locals;
            const { token } = req.params;
            return { role, token };
        }, userController.verfiyEmail),
    );

    router.post(
        generatePath('verify-mobile'),
        passport.authenticate('jwt', { session: false, failWithError: true }),
        celebrate({
            body: Joi.object().keys({
                mobile: Joi.string().length(10).required().trim(),
            }),
        }),
        c((req) => {
            const { user } = req;
            const { mobile } = req.body;
            return { user, mobile };
        }, userController.sendMobileOtp),
    );

    router.post(
        generatePath('resend-otp'),
        passport.authenticate('jwt', { session: false, failWithError: true }),
        c((req) => {
            const { user } = req;
            return { user };
        }, userController.resendMobileOtp),
    );

    router.put(
        generatePath('verify-mobile/:otp'),
        passport.authenticate('jwt', { session: false, failWithError: true }),
        celebrate({
            params: Joi.object().keys({
                otp: Joi.string().required().trim(),
            }),
        }),
        c((req) => {
            const { user } = req;
            const { otp } = req.params;
            return { user, otp };
        }, userController.verfiyMobile),
    );
    // ! signing the jwt
    router.post(
        generatePath('login'),
        celebrate({
            body: Joi.object().keys({
                email: Joi.string().email().required().trim(),
                password: Joi.string().required().trim(),
            }),
        }),
        c((req) => {
            const { role } = req.locals;
            const { email, password } = req.body;
            return { role, email, password };
        }, userController.loginUser),
    );
    router.post(
        generatePath('image/profile'),
        middlewares([role]),
        celebrate({
            body: Joi.object().keys({
                fileId: Joi.objectId().required(),
            }),
        }),
        c((req) => {
            const user = req.user;
            const { fileId } = req.body;
            return { user, fileId };
        }, userController.updateProfileImage),
    );
    router.delete(
        generatePath('image/profile'),
        middlewares([role]),
        c((req) => {
            const user = req.user;
            return { user };
        }, userController.removePortfolioImage),
    );
    /*
     * NOTIFICATION Routes
     */
    router.get(
        generatePath('notifications/unseen/count'),
        middlewares([role]),
        c((req) => {
            const { user } = req;
            return { user };
        }, notificationController.getUnseenCount),
    );
    router.get(
        generatePath('notifications/all'),
        middlewares([role]),
        c((req) => {
            const { user } = req;
            return { user };
        }, notificationController.getUnseenAndSeen),
    );

    router.put(
        generatePath('notifications/delete'),
        middlewares([role]),
        celebrate({
            body: Joi.object().keys({
                notifIds: Joi.array(),
            }),
        }),
        c((req) => {
            const { user } = req;
            const { notifIds } = req.body;
            return { user, ids: notifIds };
        }, notificationController.setDeleteMultiple),
    );

    router.put(
        generatePath('notifications/seen'),
        middlewares([role]),
        celebrate({
            body: Joi.object().keys({
                notifIds: Joi.array(),
            }),
        }),
        c((req) => {
            const { user } = req;
            const { notifIds } = req.body;
            return { user, ids: notifIds };
        }, notificationController.setSeen),
    );

    router.put(
        generatePath('notifications/:notifId/delete'),
        middlewares([role]),
        celebrate({
            params: Joi.object().keys({
                notifId: Joi.objectId().required(),
            }),
        }),
        c((req) => {
            const { user } = req;
            const { notifId } = req.params;
            return { user, id: notifId };
        }, notificationController.setDeleteOne),
    );
    // Client Specific routes
    // Testimonial Routes
    if (role === ROLES.CLIENT_C) {
        router.post(
            generatePath('verify-testimonial-request'),
            celebrate({
                body: Joi.object().keys({
                    token: Joi.string().required().trim(),
                }),
            }),
            c((req) => {
                const { token } = req.body;
                return { token };
            }, clientController.verifyTestimonialRequest),
        );
        router.post(
            generatePath('give-testimonial'),
            // Adds testimonialId to req object for upload
            // preUploadMiddleware,
            miscUpload.testimonialLogoUpload.array('files', 1),
            celebrate({
                body: Joi.object().keys({
                    token: Joi.string().required().trim(),
                    company: Joi.string().required().trim(),
                    reviewText: Joi.string().min(1).max(240).required().trim(),
                }),
            }),
            c((req) => {
                const testimonialData = req.body;
                const files = req.files;
                return {
                    testimonialData,
                    files,
                };
            }, clientController.giveTestimonial),
            logoUploadErrorHandler,
        );
    }
    // Client Specific routes
    // Testimonial Routes v3.1
    if (role === ROLES.CLIENT_C) {
        router.post(
            generatePath('v3.1/verify-testimonial-request'),
            celebrate({
                body: Joi.object().keys({
                    token: Joi.string().required().trim(),
                }),
            }),
            c((req) => {
                const { token } = req.body;
                return { token };
            }, clientController.verifyTestimonialRequestV3),
        );
        router.post(
            generatePath('v3.1/give-testimonial'),
            // ! Adds testimonialId to req object for upload
            // preUploadMiddleware,
            // miscUpload.testimonialLogoUpload.array('files', 1),
            celebrate({
                body: Joi.object().keys({
                    token: Joi.string().required().trim(),
                    company: Joi.string().required().trim(),
                    reviewText: Joi.string().min(1).max(240).required().trim(),
                    fileId: Joi.objectId().default(''),
                }),
            }),
            c((req) => {
                const testimonialData = req.body;
                return {
                    testimonialData,
                };
            }, clientController.giveTestimonialV3),
            logoUploadErrorHandler,
        );
    }
});

// Report user of job post
router.post(
    '/report',
    passport.authenticate('jwt', { session: false, failWithError: true }),
    celebrate({
        body: Joi.object().keys({
            against: Joi.when('postId', {
                is: Joi.valid('', null),
                then: Joi.objectId(),
                otherwise: Joi.allow(null, ''),
            }),
            report_type: Joi.string()
                .valid(...Object.values(JOB_BOARD_REPORT_TYPE))
                .required(),
            reason: Joi.string().min(3).required(),
            postId: Joi.objectId(),
        }),
    }),
    c((req) => {
        const { user } = req;
        const { against, reason, report_type, postId } = req.body;
        return { user, against, reason, report_type, postId };
    }, addReport),
);

/**
 * GU Signup routes
 */

// Verify request
router.post(
    '/user/gu/verify-request',
    celebrate({
        body: Joi.object().keys({
            token: Joi.string().required(),
        }),
    }),
    c((req) => {
        const { token } = req.body;
        return { token };
    }, userController.verifyAcceptToJoin),
);

/**
 * Create GA and add to group
 */
router.post(
    '/user/gu/create',
    celebrate({
        body: Joi.object().keys({
            token: Joi.string().required(),
            password: Joi.string()
                .regex(passwordRegex)
                .min(6)
                .required()
                .trim(),
        }),
    }),
    c((req) => {
        const { token, password } = req.body;
        return { token, password };
    }, userController.createGUandAddToGroup),
);

/**
 * * Ext User signup routes
 */

router.post(
    '/extclient/signup',
    celebrate({
        body: Joi.object().keys({
            token: Joi.string().required(),
        }),
    }),
    c((req) => {
        const token = req.body.token;
        return { token };
    }, userController.signupExtClient),
);

module.exports = router;

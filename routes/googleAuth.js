const router = require('express').Router();
const _ = require('lodash');
const { getUrl } = require('../config/google-auth');
const { celebrate, Joi } = require('celebrate');
Joi.objectId = require('joi-objectid')(Joi);
const c = require('./helper');
const C = require('../lib/constants');
const env = require('../config/env');

const googleAuthController = require('../controllers/googleAuth');
const { BadRequest } = require('../lib/errors');
const passport = require('passport');

/*
 * load in passport config
 */
require('../config/passport');
const { passportAuthenticate } = require('../middlewares/authorization');

/**
 * Get loing url for google authentication
 */
router.get('/google/login-url', async (req, res) => {
    const redirect_uri = `${env.GAUTH_FRONTEND_URL}/g-auth-login`;
    let state = '';
    if (req.query && req.query.templateId && req.query.templateId.length > 0) {
        let stateString = JSON.stringify({
            templateId: req.query.templateId,
        });
        state = stateString.toString('base64');
    }
    return res.json({
        url: `https://accounts.google.com/o/oauth2/v2/auth?${await getUrl(
            redirect_uri,
            state,
        )}`,
    });
});

/**
 * Get signup url for google authentication
 */

router.get('/google/signup-url/:role', async (req, res) => {
    const allowedRoles = [C.ROLES.WRITER_C, C.ROLES.CLIENT_C, C.ROLES.PM_C];
    const role = req.params.role;
    if (!allowedRoles.includes(role)) {
        throw new BadRequest('Role not allowed');
    }

    let redirect_uri = `${
        env.GAUTH_FRONTEND_URL
    }/g-auth-success-${role.toLowerCase()}`;
    let state = '';
    if (
        role == C.ROLES.WRITER_C &&
        req.query &&
        req.query.templateId &&
        req.query.templateId.length > 0
    ) {
        let stateString = JSON.stringify({
            templateId: req.query.templateId,
        });
        state = stateString.toString('base64');
    }
    return res.json({
        url: `https://accounts.google.com/o/oauth2/v2/auth?${await getUrl(
            redirect_uri,
            state,
        )}`,
    });
});

/**
 * Get signup url for google authentication (template sign up flow for writer)
 */

router.get('/google/signup-url-template/writer', async (req, res) => {
    // TODO: redirect uri will change
    const redirect_uri = `${env.GAUTH_FRONTEND_URL}/g-auth-success-template-writer`;
    return res.json({
        url: `https://accounts.google.com/o/oauth2/v2/auth?${await getUrl(
            redirect_uri,
        )}`,
    });
});

/**
 * Get access token from 'code'. These APIs are called after authentication was successfull.
 * The code from the redirected url is passed to these API
 */

router.post(
    '/google/login',
    celebrate({
        body: Joi.object().keys({
            code: Joi.string().required(),
        }),
    }),
    c((req) => {
        const { code } = req.body;
        return { code };
    }, googleAuthController.confirmLogin),
);

router.post(
    '/google/signup',
    celebrate({
        body: Joi.object().keys({
            code: Joi.string().required(),
            role: Joi.string()
                .valid(C.ROLES.WRITER_C, C.ROLES.CLIENT_C, C.ROLES.PM_C)
                .required(),
            // referrer is from documnet.referrer
            referrer: Joi.string().allow('', null).default(''),
            // this is from the pb_medium query param
            signupMedium: Joi.string().allow('', null).default(''),
        }),
    }),
    c((req) => {
        const { code, role, referrer, signupMedium } = req.body;
        return { code, role, referrer, signupMedium };
    }, googleAuthController.confirmSignup),
);

/**
 * Used for template signup flow for writers
 * This API only returns email, name and penname for the user. This data can then be used to proceed with direct signup api - /writer/signup-use-template
 */
router.post(
    '/google/signup-template',
    celebrate({
        body: Joi.object().keys({
            code: Joi.string().required(),
        }),
    }),
    c((req) => {
        const { code } = req.body;
        return { code };
    }, googleAuthController.getDetailsFromCode),
);

/**
 * Make user active by getting detils
 */

const schemaOnRole = (role) => {
    switch (role) {
        case C.ROLES.WRITER_C:
            return {
                body: Joi.object().keys({
                    firstName: Joi.string().trim().required(),
                    // allow empty lastName
                    lastName: Joi.string().trim().allow('').default(''),
                    city: Joi.string().trim().required(),
                    country: Joi.string().trim().required(),
                    creatorType: Joi.string().valid(
                        C.CREATOR_TYPES.WRITER,
                        C.CREATOR_TYPES.DESIGNER,
                    ),
                    designation: Joi.string().trim().required(),
                }),
            };
        case C.ROLES.CLIENT_C:
            return {
                body: Joi.object().keys({
                    firstName: Joi.string().trim().required(),
                    // allow empty lastName
                    lastName: Joi.string().trim().allow('').default(''),
                    country: Joi.string().trim().required(),
                    industry: Joi.string().trim().required(),
                    company: Joi.string().trim().required(),
                    website: Joi.string().uri().required(),
                    clientRole: Joi.string()
                        .valid(...Object.values(C.CLIENT_ROLE))
                        .required(),
                }),
            };
        case C.ROLES.PM_C:
            return {
                body: Joi.object().keys({
                    firstName: Joi.string().trim().required(),
                    // allow empty lastName
                    lastName: Joi.string().trim().allow('').default(''),
                    city: Joi.string().trim().required(),
                    country: Joi.string().trim().required(),
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
        default:
            throw new Error('signup api provided unhandled role');
    }
};

_.forEach([C.ROLES.WRITER_C, C.ROLES.CLIENT_C, C.ROLES.PM_C], (role) => {
    let roleForPath = role.toLowerCase();
    router.use('/google/profile', (req, res, next) => {
        req.locals = { role };
        next();
    });

    router.post(
        `/google/profile/${roleForPath}`,
        passportAuthenticate(passport),
        celebrate(schemaOnRole(role)),
        c((req) => {
            const { role } = req.locals;
            const user = req.user;
            const {
                city,
                country,
                creatorType,
                designation,
                industry,
                company,
                website,
                clientRole,
                firstName,
                lastName,
                studioQA,
                medium,
            } = req.body;
            return {
                user,
                role,
                city,
                country,
                creatorType,
                designation,
                industry,
                company,
                website,
                clientRole,
                firstName,
                lastName,
                studioQA,
                medium,
            };
        }, googleAuthController.completeUserDetails),
    );
});

module.exports = router;

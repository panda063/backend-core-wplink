// Routes for Client
const router = require('express').Router();
const { celebrate, Joi } = require('celebrate');
Joi.objectId = require('joi-objectid')(Joi);
const debug = require('debug')('client');
const { BadRequest } = require('../../lib/errors');
const c = require('../helper');

const {
    CLIENT_POSTING_JOB_AS_TYPES,
    CLIENT_PROFILE_STATUS,
} = require('../../lib/constants');

/**
 * Controllers
 */
const clientController = require('../../controllers/client/profile');
/*
 * Router Level Middlewares
 */
/*
 * Gaurd Middleware
 */

const profileGuard = (
    validProfileStatus = [CLIENT_PROFILE_STATUS.ORGANISATION_DETAILS_COMPLETED],
) => {
    return (req, res, next) => {
        const client = req.user;
        const { profileStatus } = client;
        if (validProfileStatus.includes(profileStatus)) {
            return next();
        }
        return next(new BadRequest('Not a valid profile status for this API'));
    };
};

/**
 * @api {GET} /profile"
 * @apiName getClientProfile
 * @apiGroup Client
 */
router.get(
    '/',
    c((req) => {
        const client = req.user;
        return { client };
    }, clientController.getClientProfile),
);

// Update Personal Info. Before posting opportunity first time
router.put(
    '/update/personal',
    celebrate({
        body: Joi.object().keys({
            firstName: Joi.string().trim().required(),
            lastName: Joi.string().trim().default(''),
            // ! Temporatily disabled
            // country: Joi.string().required(),
            city: Joi.string().required(),
            designation: Joi.string().max(120).trim().required(),
        }),
    }),
    profileGuard([
        CLIENT_PROFILE_STATUS.PERSONAL_DETAILS_PENDING,
        CLIENT_PROFILE_STATUS.ORGANISATION_DETAILS_PENDING,
        CLIENT_PROFILE_STATUS.ORGANISATION_DETAILS_COMPLETED,
    ]),
    c((req) => {
        const {
            firstName,
            lastName,
            //country,
            city,
            designation,
        } = req.body;
        const client = req.user;
        return {
            client,
            firstName,
            lastName,
            //country,
            city,
            designation,
        };
    }, clientController.updatePersonalInfo),
);

const uriRegex = /^((http|https):\/\/)?(www.)?(?!.*(http|https|www.))[a-zA-Z0-9_-]+(\.[a-zA-Z]+)+(\/)?.([\w\?[a-zA-Z-_%\/@?]+)*([^\/\w\?[a-zA-Z0-9_-]+=\w+(&[a-zA-Z0-9_]+=\w+)*)?$/;
// Update Organisation Info. Before posting first opportunity
router.put(
    '/update/organisation',
    celebrate({
        body: Joi.object().keys({
            postingAs: Joi.string()
                .valid(...Object.values(CLIENT_POSTING_JOB_AS_TYPES))
                .required(),
            name: Joi.string().trim().required(),
            description: Joi.string().trim().required(),
            sectors: Joi.array().items(Joi.string()).unique().min(1).required(),
            website: Joi.string().regex(uriRegex).required().allow(''),
            socialMedia: Joi.when('website', {
                is: '',
                then: Joi.string().regex(uriRegex).required(),
                otherwise: Joi.string().regex(uriRegex).allow(''),
            }),
        }),
    }),
    profileGuard([
        CLIENT_PROFILE_STATUS.ORGANISATION_DETAILS_PENDING,
        CLIENT_PROFILE_STATUS.ORGANISATION_DETAILS_COMPLETED,
    ]),
    c((req) => {
        const {
            postingAs,
            name,
            description,
            sectors,
            website,
            socialMedia,
        } = req.body;
        const client = req.user;
        return {
            client,
            postingAs,
            name,
            description,
            sectors,
            website,
            socialMedia,
        };
    }, clientController.updateOrganisationInfo),
);

module.exports = router;

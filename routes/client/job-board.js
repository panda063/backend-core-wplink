// Routes for Client
const router = require('express').Router();
const { celebrate, Joi } = require('celebrate');
Joi.objectId = require('joi-objectid')(Joi);
const debug = require('debug')('client');
const { BadRequest } = require('../../lib/errors');
const c = require('../helper');
const moment = require('moment');
const {
    JOB_BOARD_OPPORTUNITY_STATES,
    JOB_BOARD_EMPLOYMENT_TYPES,
    JOB_BOARD_SENIORITY_LEVELS,
    JOB_BOARD_RENUMERATION_UNITS,
    JOB_BOARD_APPLICATION_STATES,
    CLIENT_PROFILE_STATUS,
    JOB_BOARD_CONTENT_TYPES,
    CURRENCY,
} = require('../../lib/constants');

/**
 * Controllers
 */

const clientController = require('../../controllers/client/job-board');

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
 * @api {POST} /job-board - Post New Opportunity
 * @apiName addNewOpportunity
 * @apiGroup Client
 */
router.post(
    '/',
    celebrate({
        body: Joi.object().keys({
            // Current default will be project
            employmentType: Joi.string()
                .valid(...Object.values(JOB_BOARD_EMPLOYMENT_TYPES))
                .default(JOB_BOARD_EMPLOYMENT_TYPES.PROJECT),
            contentType: Joi.string()
                .valid(...Object.values(JOB_BOARD_CONTENT_TYPES))
                .required(),
            category: Joi.string().required(),
            title: Joi.string().required(),
            description: Joi.string().max(600).trim().required(),
            country: Joi.string().required(),
            // city: Joi.string().required(),
            remoteFriendly: Joi.boolean().default(true),

            remuneration: Joi.number().min(1).required(),
            remunerationUnit: Joi.string()
                .valid(...Object.values(JOB_BOARD_RENUMERATION_UNITS))
                .default(JOB_BOARD_RENUMERATION_UNITS.TOTAL_COMPENSATION),
            currency: Joi.string().valid(CURRENCY.USD, CURRENCY.INR).required(),
            contentPieces: Joi.when('employmentType', {
                is: JOB_BOARD_EMPLOYMENT_TYPES.PROJECT,
                then: Joi.number().min(1).required(),
                otherwise: Joi.number().valid(null, ''),
            }),
            wordCount: Joi.number().default(0),
            samplesProvided: Joi.boolean().default(false),
            deadline: Joi.date()
                .greater(new Date(moment().add(1, 'd').minutes(0).seconds(0)))
                .less(new Date(moment().add(45, 'd').minutes(0).seconds(0))),
            tags: Joi.array().items(Joi.string()),
            question1: Joi.string().required(),
            question2: Joi.string().allow(''),

            //**** For update operation
            existingJobId: Joi.objectId().allow(null),
            //****
            // Not required as of now so optional
            openings: Joi.number().min(1).default(1),
            seniority: Joi.when('employmentType', {
                is: JOB_BOARD_EMPLOYMENT_TYPES.FULL_TIME,
                then: Joi.string()
                    .valid(...Object.values(JOB_BOARD_SENIORITY_LEVELS))
                    .required(),
                otherwise: Joi.string().default(''),
            }),
            preferredQualifications: Joi.when('employmentType', {
                is: JOB_BOARD_EMPLOYMENT_TYPES.PROJECT,
                then: Joi.string().default(''),
                otherwise: Joi.string().trim().max(600).required(),
            }),
            // @version 3
            pmRequired: Joi.boolean().default(false),
        }),
    }),
    profileGuard([CLIENT_PROFILE_STATUS.ORGANISATION_DETAILS_COMPLETED]),
    c((req) => {
        const client = req.user;
        const job = req.body;
        return {
            job,
            client,
        };
    }, clientController.addNewOpportunity),
);

router.post(
    '/close',
    celebrate({
        body: Joi.object().keys({
            jobId: Joi.objectId().required(),
            reason: Joi.string().min(5).required(),
        }),
    }),
    c((req) => {
        const client = req.user;
        const { jobId, reason } = req.body;
        return {
            client,
            jobId,
            reason,
        };
    }, clientController.closeOpportunity),
);

/**
 * @api {POST} /job-board
 * @apiName getClientOpportunities
 * @apiGroup Client
 */
router.post(
    '/opportunitites',
    celebrate({
        body: Joi.object().keys({
            status: Joi.string()
                .valid(...Object.values(JOB_BOARD_OPPORTUNITY_STATES))
                .allow('', null),
            page: Joi.number().min(1).default(1),
        }),
    }),
    c((req) => {
        const client = req.user;
        const { status, page } = req.body;
        return {
            client,
            status,
            page,
        };
    }, clientController.getClientOpportunities),
);

/** --------
 * @api {GET} /job-board/:jobId/applications
 * @apiName getJobApplications
 * @apiGroup Client
 */
router.get(
    '/:jobId/applications',
    celebrate({
        params: Joi.object().keys({
            jobId: Joi.objectId().required(),
        }),
    }),
    c((req) => {
        const client = req.user;
        return {
            client,
            jobId: req.params.jobId,
        };
    }, clientController.getJobApplications),
);

/**
 * @apiName updateApplicationStatus
 * @apiGroup Client
 */
router.put(
    '/application-status',
    celebrate({
        body: Joi.object().keys({
            applId: Joi.objectId().required(),
            status: Joi.string()
                .valid(...Object.values(JOB_BOARD_APPLICATION_STATES))
                .required(),
        }),
    }),
    c((req) => {
        const client = req.user;
        return {
            client,
            applId: req.body.applId,
            status: req.body.status,
        };
    }, clientController.updateApplicationStatus),
);

/**
 * @apiName Get Application Details
 */
router.post(
    '/application',
    celebrate({
        body: Joi.object().keys({
            // jobId: Joi.objectId().required(),
            applId: Joi.objectId().required(),
        }),
    }),
    c((req) => {
        const client = req.user;
        const { applId } = req.body;
        return { client, applId };
    }, clientController.getApplicationDetails),
);

/**
 * @apiName Get pages from application
 */

router.get(
    '/application/pages/:applId',
    celebrate({
        params: Joi.object().keys({
            applId: Joi.objectId().required(),
        }),
    }),
    c((req) => {
        const { applId } = req.params;
        const client = req.user;
        return { client, applId };
    }, clientController.getApplicationPages),
);

/**
 * @apiName Start Conversation from application
 */

router.put(
    '/send-message/:applId',
    celebrate({
        params: Joi.object().keys({
            applId: Joi.objectId().required(),
        }),
    }),
    c((req) => {
        const client = req.user;
        const { applId } = req.params;
        return {
            client,
            applId,
        };
    }, clientController.getCreateConversation),
);

module.exports = router;

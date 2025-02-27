// Routes for Client
const router = require('express').Router();
const { celebrate, Joi } = require('celebrate');
Joi.objectId = require('joi-objectid')(Joi);
const debug = require('debug')('client');
const moment = require('moment');
const c = require('../helper');

const {
    JOB_BOARD_APPLICATION_STATES,
    JOB_BOARD_OPPORTUNITY_STATES,
    JOB_BOARD_EMPLOYMENT_TYPES,
    JOB_BOARD_SENIORITY_LEVELS,
    JOB_BOARD_RENUMERATION_UNITS,
    JOB_BOARD_CONTENT_TYPES,
    CURRENCY,
} = require('../../lib/constants');

/**
 * Controllers
 */

const jobController = require('../../controllers/creator/job-board');
const clientController = require('../../controllers/client/job-board');

// ---------- JOB BOARD RELATED ENDPOINTS ----------
/**
 * * These are APIs in which PM acts as creator
 */
/**
 * @api {POST} /job-board
 * @apiName getAvailableOpportunities
 * @apiGroup PM
 */
router.post(
    '/',
    celebrate({
        body: Joi.object().keys({
            employmentType: Joi.array()
                .items(Joi.string().valid('full_time', 'part_time', 'project'))
                .allow(null),
            remoteFriendly: Joi.boolean().allow(null).default(null),
            sortBy: Joi.string().valid('ac', 'createdAt').allow(null),
            location: Joi.string().allow(null),
            sortOrder: Joi.number().valid(1, -1).allow(null),
            page: Joi.number().default(1),
            searchQuery: Joi.string().allow(null),
        }),
    }),
    c((req) => {
        const writer = req.user;
        const {
            employmentType,
            remoteFriendly,
            location,
            sortOrder,
            sortBy,
            page,
            searchQuery,
        } = req.body;
        return {
            writer,
            employmentType,
            remoteFriendly,
            location,
            sortOrder,
            sortBy,
            page,
            searchQuery,
        };
    }, jobController.getAvailableOpportunities),
);

/**
 * @api {GET} /job-board/suggested
 *
 */

router.get(
    '/suggested',
    celebrate({
        query: Joi.object().keys({
            page: Joi.number().default(1),
        }),
    }),
    c((req) => {
        const writer = req.user;
        const { page } = req.query;
        return { writer };
    }, jobController.getSuggested),
);

/**
 * @api {GET} /job-board/trending
 *
 */
router.get(
    '/trending',
    celebrate({
        query: Joi.object().keys({
            page: Joi.number().default(1),
        }),
    }),
    c((req) => {
        const writer = req.user;
        const { page } = req.query;
        return { writer };
    }, jobController.getTrending),
);

/**
 * @api {GET} /job-board/:jobId
 * @apiName getOpportunityDetails
 * @apiGroup PM
 */
router.get(
    '/:jobId',
    celebrate({
        params: Joi.object().keys({
            jobId: Joi.objectId().required(),
        }),
    }),
    c((req) => {
        const writer = req.user;
        const { jobId } = req.params;
        return { writer, jobId };
    }, jobController.getOpportunityDetails),
);

/**
 * @api {POST} /job-board/:jobId/applications
 * @apiName applyForOpportunity
 * @apiGroup PM
 */
router.post(
    '/:jobId/applications',
    celebrate({
        params: Joi.object().keys({
            jobId: Joi.objectId().required(),
        }),
        body: Joi.object().keys({
            answer1: Joi.string().max(300).trim().required(),
            answer2: Joi.string().max(300).trim().allow(''),
            contentSamples: Joi.array()
                .items(Joi.objectId())
                .max(6)
                .allow(null),
        }),
    }),
    c((req) => {
        const writer = req.user;
        const application = req.body;
        const { jobId } = req.params;
        return {
            writer,
            jobId,
            application,
        };
    }, jobController.applyForOpportunity),
);

/**
 * @api {GET} /job-board/applications
 * @apiName getWriterApplications
 * @apiGroup PM
 */
router.post(
    '/applications',
    celebrate({
        body: Joi.object().keys({
            // send null or '' for all applications
            status: Joi.string()
                .valid(...Object.values(JOB_BOARD_APPLICATION_STATES))
                .allow(null, ''),
            sortBy: Joi.string().valid('last_applied').allow(null, ''),
            page: Joi.number().default(1),
        }),
    }),
    c((req) => {
        const writer = req.user;
        const { status, sortBy, page } = req.body;
        return {
            writer,
            status,
            sortBy,
            page,
        };
    }, jobController.getWriterApplications),
);

/**
 * @api {GET} /job-board/applications/:applId
 * @apiName getApplicationDetails
 * @apiGroup PM
 */
router.get(
    '/applications/:applId',
    celebrate({
        params: Joi.object().keys({
            applId: Joi.objectId().required(),
        }),
    }),
    c((req) => {
        const writer = req.user;
        const { applId } = req.params;
        return {
            writerId: writer.id,
            applId,
        };
    }, jobController.getApplicationDetails),
);

/**
 * * These are APIs in which PM acts as Client
 */

/**
 * @api {POST} /job-board - Post New Opportunity
 * @apiName addNewOpportunity
 * @apiGroup PM
 */

router.post(
    '/studio',
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
            wordCount: Joi.number().default(0),
            samplesProvided: Joi.boolean().default(false),
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
        }),
    }),
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
    '/studio/close',
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
 * @apiGroup PM
 */

router.post(
    '/studio/opportunitites',
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
 * @apiGroup PM
 */

router.get(
    '/studio/:jobId/applications',
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
 * @apiGroup PM
 */

router.put(
    '/studio/application-status',
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
    '/studio/application',
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

module.exports = router;

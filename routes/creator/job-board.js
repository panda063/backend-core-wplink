/**
 * Module Dependencies
 */
const _ = require('lodash');
const { celebrate, Joi, isCelebrate } = require('celebrate');
Joi.objectId = require('joi-objectid')(Joi);
const router = require('express').Router();
const {
    BadRequest,
    InternalServerError,
    NotAuthorized,
} = require('../../lib/errors');

const c = require('../helper');
const CONSTANTS = require('../../lib/constants');

/**
 * Controllers
 */

const writerController = require('../../controllers/creator/job-board');
/**
 * Middlewares
 */

/**
 * External Service Dependencies
 */

/*
 * Router Level Middlewares
 */

/*
 * Gaurd Middleware
 * Primarily to provide level specific access to features (ex Job Board)
 */
const secondaryGaurd = (req, res, next) => {
    const writer = req.user;
    const { accountStatus } = writer;
    switch (accountStatus) {
        case CONSTANTS.ACCOUNT_STATUS.NEW: {
            return next();
        }
        case CONSTANTS.ACCOUNT_STATUS.ACTIVE: {
            // Job Board is accessible for level 2 creators only
            // Level 3 creators are classified creators

            if (writer.lv !== CONSTANTS.CREATOR_LEVEL.NORMAL) {
                return next(
                    new NotAuthorized('Access Denied to Job Board', 'CRPL112'),
                );
            }
            return next();
        }
        case CONSTANTS.ACCOUNT_STATUS.INACTIVE: {
            return next();
        }
        case CONSTANTS.ACCOUNT_STATUS.BAN: {
            return next();
        }
        default:
            return next(new InternalServerError('Something Went Wrong'));
    }
};
const gaurd = (validAccountStatus) => {
    // default
    if (!validAccountStatus) {
        validAccountStatus = CONSTANTS.ACCOUNT_STATUS.ACTIVE;
    }
    if (typeof validAccountStatus === 'string') {
        validAccountStatus = [validAccountStatus];
    }
    return (req, res, next) => {
        const writer = req.user;
        const { accountStatus } = writer;
        if (validAccountStatus.includes(accountStatus)) {
            // further validations
            return secondaryGaurd(req, res, next);
        }
        return next(new BadRequest('not a valid account status'));
    };
};
// ---------- JOB BOARD RELATED ENDPOINTS ----------
/**
 * @api {POST} /job-board
 * @apiName getAvailableOpportunities
 * @apiGroup Writer
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
            studioJobs: Joi.boolean().default(false),
        }),
    }),
    gaurd(),
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
            studioJobs,
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
            studioJobs,
        };
    }, writerController.getAvailableOpportunities),
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
    gaurd(),
    c((req) => {
        const writer = req.user;
        const { page } = req.query;
        return { writer };
    }, writerController.getSuggested),
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
    gaurd(),
    c((req) => {
        const writer = req.user;
        const { page } = req.query;
        return { writer };
    }, writerController.getTrending),
);

/**
 * @api {GET} /job-board/applications
 * @apiName getWriterApplications
 * @apiGroup Writer
 */
router.post(
    '/applications',
    celebrate({
        body: Joi.object().keys({
            // send null or '' for all applications
            status: Joi.string()
                .valid(...Object.values(CONSTANTS.JOB_BOARD_APPLICATION_STATES))
                .allow(null, ''),
            sortBy: Joi.string().valid('last_applied').allow(null, ''),
            page: Joi.number().default(1),
        }),
    }),
    gaurd(),
    c((req) => {
        const writer = req.user;
        const { status, sortBy, page } = req.body;
        return {
            writer,
            status,
            sortBy,
            page,
        };
    }, writerController.getWriterApplications),
);

/**
 * @api {GET} /job-board/applications/:applId
 * @apiName getApplicationDetails
 * @apiGroup Writer
 */
router.get(
    '/applications/:applId',
    celebrate({
        params: Joi.object().keys({
            applId: Joi.objectId().required(),
        }),
    }),
    gaurd(),
    c((req) => {
        const writer = req.user;
        const { applId } = req.params;
        return {
            writerId: writer.id,
            applId,
        };
    }, writerController.getApplicationDetails),
);

/**
 * @api {GET} /job-board/:jobId
 * @apiName getOpportunityDetails
 * @apiGroup Writer
 */

router.get(
    '/:jobId',
    celebrate({
        params: Joi.object().keys({
            jobId: Joi.objectId().required(),
        }),
    }),
    gaurd(),
    c((req) => {
        const writer = req.user;
        const { jobId } = req.params;
        return { writer, jobId };
    }, writerController.getOpportunityDetails),
);

/**
 * @api {POST} /job-board/:jobId/applications
 * @apiName applyForOpportunity
 * @apiGroup Writer
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
            pageIds: Joi.array().items(Joi.objectId()).allow(null),
        }),
    }),
    gaurd(),
    c((req) => {
        const writer = req.user;
        const application = req.body;
        const { jobId } = req.params;
        return {
            writer,
            jobId,
            application,
        };
    }, writerController.applyForOpportunity),
);

/**
 * @api {GET} /job-board/saved/all
 * @apiName Get saved jobs
 */

router.get(
    '/saved/all',
    c((req) => {
        const writer = req.user;
        return { writerId: writer.id };
    }, writerController.getSavedJobs),
);

/**
 * @api {PUT} /job-board/save/:jobId:
 * @apiName Save Opportunity
 * @@apiGroup Writer
 */

router.put(
    '/saved/save/:jobId',
    celebrate({
        params: Joi.object().keys({
            jobId: Joi.objectId().required(),
        }),
    }),
    c((req) => {
        const writer = req.user;
        const { jobId } = req.params;
        return {
            writer,
            jobId,
        };
    }, writerController.saveJob),
);

/**
 * @api {DELETE} /job-board/delete-saved/:jobId:
 * @apiName Delete Saved Opportunity
 * @@apiGroup Writer
 */

router.delete(
    '/saved/delete/:jobId',
    celebrate({
        params: Joi.object().keys({
            jobId: Joi.objectId().required(),
        }),
    }),
    c((req) => {
        const writer = req.user;
        const { jobId } = req.params;
        return {
            writer,
            jobId,
        };
    }, writerController.deleteSavedJob),
);

module.exports = router;

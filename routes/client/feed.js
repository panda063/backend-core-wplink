// Routes for Client
const router = require('express').Router();
const { celebrate, Joi } = require('celebrate');
Joi.objectId = require('joi-objectid')(Joi);
const debug = require('debug')('client');
const c = require('../helper');

const { CREATOR_BUDGET_LIMITS } = require('../../lib/constants');

/**
 * Controllers
 */

const clientController = require('../../controllers/client/feed');

router.get(
    '/conversation/:uid',
    celebrate({
        params: Joi.object().keys({
            uid: Joi.objectId().required(),
        }),
    }),
    c((req) => {
        const client = req.user;
        const { uid } = req.params;
        return { client, id: uid };
    }, clientController.getConversation),
);

router.put(
    '/shortlist/:pid',
    celebrate({
        params: Joi.object().keys({
            pid: Joi.objectId().required(),
        }),
    }),
    c((req) => {
        const client = req.user;
        const { pid } = req.params;
        return { client, pid };
    }, clientController.shortlistCreatorPortfolio),
);

router.post(
    '/shortlisted',
    celebrate({
        body: Joi.object().keys({
            search: Joi.string().default(''),
            fastResponse: Joi.boolean().default(false),
            priceMin: Joi.number()
                .min(CREATOR_BUDGET_LIMITS.MIN_PER_HOUR)
                .max(CREATOR_BUDGET_LIMITS.MAX_PER_HOUR)
                .default(CREATOR_BUDGET_LIMITS.MIN_PER_HOUR),
            priceMax: Joi.number()
                .min(CREATOR_BUDGET_LIMITS.MIN_PER_HOUR)
                .max(CREATOR_BUDGET_LIMITS.MAX_PER_HOUR)
                .default(CREATOR_BUDGET_LIMITS.MAX_PER_HOUR),
            city: Joi.string().trim().default(''),
        }),
    }),
    c((req) => {
        const client = req.user;
        const filters = req.body;
        return { client, filters };
    }, clientController.getShortlistedPortfolios),
);

router.post(
    '/',
    celebrate({
        body: Joi.object().keys({
            projectType: Joi.string()
                .valid('LongForm', 'ShortForm', 'Design')
                .default('LongForm'),
            category: Joi.string().trim().default(''),
            industry: Joi.string().trim().default(''),
            fastResponse: Joi.boolean().default(false),
            budgetMin: Joi.number()
                .min(CREATOR_BUDGET_LIMITS.MIN_BUDGET)
                .max(CREATOR_BUDGET_LIMITS.MAX_BUDGET)
                .default(CREATOR_BUDGET_LIMITS.MIN_BUDGET),
            budgetMax: Joi.number()
                .min(CREATOR_BUDGET_LIMITS.MIN_BUDGET)
                .max(CREATOR_BUDGET_LIMITS.MAX_BUDGET)
                .default(CREATOR_BUDGET_LIMITS.MAX_BUDGET),
            city: Joi.string().trim().default(''),
            keywords: Joi.string().trim().default(''),
            fromTeams: Joi.boolean().default(false),
            pmRating: Joi.number().min(0).max(5).default(0),
            limit: Joi.number().default(10),
            cursor: Joi.string().allow('').default(''),
        }),
    }),
    c((req) => {
        const client = req.user;
        const filters = req.body;
        return { client, filters };
    }, clientController.createClientFeed),
);

router.post(
    '/ranked',
    celebrate({
        body: Joi.object().keys({
            projectType: Joi.string()
                .valid('LongForm', 'ShortForm', 'Design')
                .default('LongForm'),
            category: Joi.string().trim().default(''),
            industry: Joi.string().trim().default(''),
            fastResponse: Joi.boolean().default(false),
            budgetMin: Joi.number()
                .min(CREATOR_BUDGET_LIMITS.MIN_BUDGET)
                .max(CREATOR_BUDGET_LIMITS.MAX_BUDGET)
                .default(CREATOR_BUDGET_LIMITS.MIN_BUDGET),
            budgetMax: Joi.number()
                .min(CREATOR_BUDGET_LIMITS.MIN_BUDGET)
                .max(CREATOR_BUDGET_LIMITS.MAX_BUDGET)
                .default(CREATOR_BUDGET_LIMITS.MAX_BUDGET),
            city: Joi.string().trim().default(''),
            keywords: Joi.string().trim().default(''),
            fromTeams: Joi.boolean().default(false),
            pmRating: Joi.number().min(0).max(5).default(0),
            limit: Joi.number().default(10),
            page: Joi.number().min(1).default(1),
        }),
    }),
    c((req) => {
        const client = req.user;
        const filters = req.body;
        return { client, filters };
    }, clientController.createClientFeedRanked),
);

/**
 * @apiName Collect client feed preferences
 */
router.post(
    '/preferences',
    celebrate({
        body: Joi.object().keys({
            contentType: Joi.array().items(Joi.string().trim()).required(),
            wordCount: Joi.string()
                .valid('<500', '500-2000', '>2000')
                .required(),
            budget: Joi.number().required(),
            unit: Joi.string()
                .valid('per-project', 'per-word', 'per-week', 'per-month')
                .required(),
            duration: Joi.string()
                .valid('<week', 'week-month', '>month')
                .required(),
            industry: Joi.string().required(),
        }),
    }),
    c((req) => {
        const data = req.body;
        const client = req.user;
        return { client, data };
    }, clientController.clientFeedPreferences),
);

router.get(
    '/preferences',
    c((req) => {
        return { client: req.user };
    }, clientController.getFeedPreferences),
);

module.exports = router;

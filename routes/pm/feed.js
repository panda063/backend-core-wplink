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

const feedController = require('../../controllers/pm/feed');

// Routes

router.put(
    '/shortlist/:pid',
    celebrate({
        params: Joi.object().keys({
            pid: Joi.objectId().required(),
        }),
    }),
    c((req) => {
        const pm = req.user;
        const { pid } = req.params;
        return { pm, pid };
    }, feedController.shortlistCreatorPortfolio),
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
        const pm = req.user;
        const filters = req.body;
        return { pm, filters };
    }, feedController.getShortlistedPortfolios),
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
            limit: Joi.number().default(10),
            cursor: Joi.string().allow('').default(''),
        }),
    }),
    c((req) => {
        const pm = req.user;
        const filters = req.body;
        return { pm, filters };
    }, feedController.createFeedOfCreators),
);

module.exports = router;

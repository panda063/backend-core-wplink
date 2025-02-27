/**
 * Module Dependencies
 */

const _ = require('lodash');
const { celebrate, Joi, isCelebrate } = require('celebrate');
Joi.objectId = require('joi-objectid')(Joi);
const router = require('express').Router();
const c = require('../helper');
const C = require('../../lib/constants');

/**
 * Controllers
 */

const analyticsV1Controllers = require('../../controllers/creator/analytics-v1');

// Portfolio Analytics Routes

/**
 * @apiName
 */

router.get(
    '/report',
    c((req) => {
        const user = req.user;
        return { user };
    }, analyticsV1Controllers.getReport),
);

/**
 * @apiName
 */

router.post(
    '/client-activity',
    celebrate({
        body: Joi.object().keys({
            nextUrl: Joi.string().uri().allow('', null),
            eventType: Joi.string()
                .valid('all', ...Object.values(C.CREATOR_ANALYTICS_DATA_POINTS))
                .allow('', null),
        }),
    }),
    c((req) => {
        const user = req.user;
        const { nextUrl, eventType } = req.body;
        return { user, nextUrl, eventType };
    }, analyticsV1Controllers.getClientActivity),
);

router.post(
    '/chart',
    celebrate({
        body: Joi.object().keys({
            timeframe: Joi.string().valid('7d', '30d').required(),
        }),
    }),
    c((req) => {
        const user = req.user;
        const { timeframe } = req.body;
        return { user, timeframe };
    }, analyticsV1Controllers.getChartDataAndViews),
);

// ?? Why to routes for same thing?
// ?? ublock was blocking this api
router.post(
    '/views-source',
    celebrate({
        body: Joi.object().keys({
            sourceType: Joi.string().valid('referrer', 'region').required(),
        }),
    }),
    c((req) => {
        const user = req.user;
        const { sourceType } = req.body;
        return { user, sourceType };
    }, analyticsV1Controllers.getViewSource),
);

router.post(
    '/traffic-source',
    celebrate({
        body: Joi.object().keys({
            sourceType: Joi.string().valid('referrer', 'region').required(),
        }),
    }),
    c((req) => {
        const user = req.user;
        const { sourceType } = req.body;
        return { user, sourceType };
    }, analyticsV1Controllers.getViewSource),
);

router.post(
    '/leads',
    celebrate({
        body: Joi.object().keys({
            compareFrom: Joi.string()
                .valid('last-week', 'last-month')
                .required(),
        }),
    }),
    c((req) => {
        const user = req.user;
        const { compareFrom } = req.body;
        return { user, compareFrom };
    }, analyticsV1Controllers.getLeads),
);

// ?? Why to routes for same thing?
// ?? ublock was blocking this api
router.post(
    '/posts',
    celebrate({
        body: Joi.object().keys({
            compareFrom: Joi.string()
                .valid('last-week', 'last-month')
                .required(),
        }),
    }),
    c((req) => {
        const user = req.user;
        const { compareFrom } = req.body;
        return { user, compareFrom };
    }, analyticsV1Controllers.getPostViews),
);

router.post(
    '/block-views',
    celebrate({
        body: Joi.object().keys({
            compareFrom: Joi.string()
                .valid('last-week', 'last-month')
                .required(),
        }),
    }),
    c((req) => {
        const user = req.user;
        const { compareFrom } = req.body;
        return { user, compareFrom };
    }, analyticsV1Controllers.getPostViews),
);

router.get(
    '/earnings',
    c((req) => {
        const user = req.user;
        return { user };
    }, analyticsV1Controllers.getEarnings),
);

router.get(
    '/daily-metric',
    c((req) => {
        const user = req.user;
        return { user };
    }, analyticsV1Controllers.getDailyAnalytics),
);

// Collaboration Analytics Routes

router.get(
    '/user-stats/:id',
    celebrate({
        params: Joi.object().keys({
            id: Joi.objectId().required(),
        }),
    }),
    c((req) => {
        const { id } = req.params;
        return { id };
    }, analyticsV1Controllers.getUserStats),
);

router.get(
    '/service-stats/:id',
    celebrate({
        params: Joi.object().keys({
            id: Joi.objectId().required(),
        }),
    }),
    c((req) => {
        const id = req.params.id;
        const user = req.user;
        return { id, user };
    }, analyticsV1Controllers.getServiceStats),
);

router.post(
    '/collab/summary',
    celebrate({
        body: Joi.object().keys({
            interval: Joi.string().valid('day', 'month', 'week').required(),
            type: Joi.string().valid('export', 'import').required(),
        }),
    }),
    c((req) => {
        const user = req.user;
        const { interval, type } = req.body;
        return {
            user,
            interval,
            type,
        };
    }, analyticsV1Controllers.collabSummary),
);

router.post(
    '/collab/service-summary/:id',
    celebrate({
        params: Joi.object().keys({
            id: Joi.objectId().required(),
        }),
        body: Joi.object().keys({
            interval: Joi.string().valid('day', 'month', 'week').required(),
        }),
    }),
    c((req) => {
        const user = req.user;
        const { interval } = req.body;
        const { id } = req.params;
        return {
            id,
            user,
            interval,
        };
    }, analyticsV1Controllers.specificImportSummary),
);

router.post(
    '/collab/service-list',
    celebrate({
        body: Joi.object().keys({
            type: Joi.string().valid('export', 'import', 'all').required(),
        }),
    }),
    c((req) => {
        const user = req.user;
        const { type } = req.body;
        return {
            user,
            type,
        };
    }, analyticsV1Controllers.getImportList),
);

module.exports = router;

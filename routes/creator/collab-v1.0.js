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
 * Middlewares
 */

const { captureCollabEvent } = require('../middlewares/writerMiddlewares');

/**
 * Controllers
 */

const collabControllers = require('../../controllers/creator/collab-v1.0');

/**
 * @api Fetch Feed
 */

/**
 * @apiName Fetch Feed - Services
 */

router.post(
    '/feed/services',
    celebrate({
        body: Joi.object().keys({
            filters: Joi.object()
                .keys({
                    // creator
                    designation: Joi.string().allow('', null).default(''),
                    skills: Joi.array().items(Joi.string().trim()).default([]),
                    location: Joi.string().allow('', null),
                    // service
                    text: Joi.string().allow('', null).default(''),
                    priceMin: Joi.number().min(0).max(99999).default(500),
                    priceMax: Joi.number().min(0).max(99999).default(6000),
                    deliveryTime: Joi.number().min(1).max(365).default(5),
                    deliveryTimeGap: Joi.string()
                        .valid('days', 'weeks', 'months', 'hours')
                        .default('days'),
                    feesType: Joi.string()
                        .valid(...Object.values(C.SERVICE_BLOCK_FEES_TYPE))
                        .allow('', null)
                        .default(''),
                    rateUnit: Joi.when('feesType', {
                        is: 'rate',
                        then: Joi.string()
                            .valid(...Object.values(C.SERVICE_BLOCK_RATE_UNIT))
                            .required(),
                        otherwise: Joi.string()
                            .valid(null, '')
                            .error(
                                new Joi.ValidationError(
                                    'rateUnit is not required if feesType is contact/fixed/prepaid',
                                ),
                            ),
                    }),
                })
                .default({
                    designation: '',
                    skills: [],
                    location: '',
                    // service
                    text: '',
                    priceMin: 500,
                    priceMax: 6000,
                    deliveryTime: 5,
                    deliveryTimeGap: 'days',
                    feesType: '',
                    rateUnit: '',
                }),
            sorting: Joi.object()
                .keys({
                    sortBy: Joi.string()
                        .valid(
                            // service props
                            'reach',
                            'postTime',
                            'acceptRate',
                            'ctr',
                            // creator props
                            'shared',
                            'activity',
                        )
                        .allow('', null)
                        .default(''),
                    sortOrder: Joi.number().valid(1, -1).default(-1),
                })
                .default({
                    sortBy: '',
                    sortOrder: -1,
                }),
            page: Joi.number().min(1).default(1),
        }),
    }),
    c(
        (req) => {
            const user = req.user;
            const { filters, sorting, page } = req.body;
            return {
                user,
                filters,
                sorting,
                page,
            };
        },
        collabControllers.fetchFeedServices,
        // true,
    ),
    // * temporary disable to avoid flood of data in testing
    // captureCollabEvent('visit feed'),
);

/**
 * @apiName Fetch Feed - Portfolios
 */

router.post(
    '/feed/profiles',
    celebrate({
        body: Joi.object().keys({
            filters: Joi.object()
                .keys({
                    // creator
                    designation: Joi.string().allow('').default(''),
                    skills: Joi.array().items(Joi.string().trim()).default([]),
                    location: Joi.string().allow('', null),
                    text: Joi.string().allow('', null).default(''),
                })
                .default({
                    // creator
                    designation: '',
                    skills: [],
                    location: '',
                    text: '',
                }),
            sorting: Joi.object()
                .keys({
                    sortBy: Joi.string()
                        .valid('reach', 'activity', 'shared', 'acceptance')
                        .allow('', null)
                        .default(''),
                    sortOrder: Joi.number().valid(1, -1).default(-1),
                })
                .default({
                    sortBy: '',
                    sortOrder: -1,
                }),
            page: Joi.number().min(1).default(1),
        }),
    }),
    c(
        (req) => {
            const user = req.user;
            const { filters, sorting, page } = req.body;
            return {
                user,
                filters,
                sorting,
                page,
            };
        },
        collabControllers.fetchFeedProfiles,
        true,
    ),
    captureCollabEvent('visit feed'),
);

/**
 * @apiName Send Export request
 * @collabType refer
 */

router.post(
    '/refer/export/:userId',
    celebrate({
        params: Joi.object().keys({
            userId: Joi.objectId().required(),
        }),
        body: Joi.object().keys({
            sid: Joi.objectId().required(),
            message: Joi.string().max(150).required(),
        }),
    }),
    c(
        (req) => {
            const user = req.user;
            const { userId } = req.params;
            const { sid, message } = req.body;
            return {
                user,
                sid,
                userId,
                message,
            };
        },
        collabControllers.sendReferExportRequest,
        true,
    ),
    captureCollabEvent('request sent'),
);

/**
 * @apiName Send Import Request
 * @collabType refer
 */

router.post(
    '/refer/import/:sid',
    celebrate({
        params: Joi.object().keys({
            sid: Joi.objectId().required(),
        }),
        body: Joi.object().keys({
            pageId: Joi.objectId().required(),
            message: Joi.string().max(500).required(),
        }),
    }),
    c(
        (req) => {
            const user = req.user;
            const { sid } = req.params;
            const { pageId, message } = req.body;
            return {
                user,
                sid,
                pageId,
                message,
            };
        },
        collabControllers.sendReferImportRequest,
        true,
    ),
    captureCollabEvent('request sent'),
);

/**
 * @apiName Send Import request
 * @collabType manage
 */

router.post(
    '/manage/import/:sid',
    celebrate({
        params: Joi.object().keys({
            sid: Joi.objectId().required(),
        }),
        body: Joi.object().keys({
            pageId: Joi.objectId().required(),
            message: Joi.string().max(500).required(),
        }),
    }),
    c(
        (req) => {
            const user = req.user;
            const { sid } = req.params;
            const { pageId, message } = req.body;
            return {
                user,
                sid,
                pageId,
                message,
            };
        },
        collabControllers.sendManageImportRequest,
        true,
    ),
    captureCollabEvent('request sent'),
);

/**
 * @apiName Send Export request
 * @collabType manage
 */

router.post(
    '/manage/export/:userId',
    celebrate({
        params: Joi.object().keys({
            userId: Joi.objectId().required(),
        }),
        body: Joi.object().keys({
            sid: Joi.objectId().required(),
            message: Joi.string().max(150).required(),
        }),
    }),
    c(
        (req) => {
            const user = req.user;
            const { userId } = req.params;
            const { sid, message } = req.body;
            return {
                user,
                sid,
                userId,
                message,
            };
        },
        collabControllers.sendManageExportRequest,
        true,
    ),
    captureCollabEvent('request sent'),
);

/**
 * @apiName Request action
 */

router.post(
    '/request-action/:id',
    celebrate({
        params: Joi.object().keys({
            id: Joi.objectId().required(),
        }),
        body: Joi.object().keys({
            action: Joi.string()
                .valid(
                    C.COLLAB_REQUEST_STATES.ACCEPTED,
                    C.COLLAB_REQUEST_STATES.DECLINED,
                )
                .required(),
            pageId: Joi.objectId().allow('', null),
        }),
    }),
    c(
        (req) => {
            const user = req.user;
            const { id } = req.params;
            const { action, pageId } = req.body;

            return {
                user,
                id,
                action,
                pageId,
            };
        },
        collabControllers.requestAction,
        true,
    ),
    captureCollabEvent('request action'),
);

/**
 * @apiName Remove Import
 */

router.put(
    '/remove-import/:id',
    celebrate({
        params: Joi.object().keys({
            id: Joi.objectId().required(),
        }),
    }),
    c(
        (req) => {
            const user = req.user;
            const { id } = req.params;
            return {
                user,
                id,
            };
        },
        collabControllers.removeImport,
        true,
    ),
    captureCollabEvent('import action'),
);

/**
 * @apiName Fetch single request
 */

router.get(
    '/request/:id',
    celebrate({
        params: Joi.object().keys({
            id: Joi.objectId().required(),
        }),
    }),
    c((req) => {
        const user = req.user;
        const { id } = req.params;
        return { user, id };
    }, collabControllers.fetchSingleRequest),
);

/**
 * @apiName Fetch single import
 */

router.get(
    '/import/:id',
    celebrate({
        params: Joi.object().keys({
            id: Joi.objectId().required(),
        }),
    }),
    c((req) => {
        const user = req.user;
        const { id } = req.params;
        return { user, id };
    }, collabControllers.fetchSingleImport),
);

/**
 * @apiName Fetch all requests
 */

router.post(
    '/requests',
    celebrate({
        body: Joi.object().keys({
            incoming: Joi.boolean().default(true),
            status: Joi.string()
                .valid(...Object.values(C.COLLAB_REQUEST_STATES))
                .allow('', null),
        }),
    }),
    c((req) => {
        const user = req.user;
        const { incoming, status } = req.body;
        return { user, incoming, status };
    }, collabControllers.fetchAllRequests),
);

/**
 * @apiName Fetch all imports
 */

router.post(
    '/imports',
    celebrate({
        body: Joi.object().keys({
            collabType: Joi.string()
                .valid('all', C.COLLAB_TYPE.REFER, C.COLLAB_TYPE.MANAGE)
                .default('all'),
        }),
    }),
    c((req) => {
        const user = req.user;
        const { collabType } = req.body;
        return { user, collabType };
    }, collabControllers.fetchAllImports),
);

module.exports = router;

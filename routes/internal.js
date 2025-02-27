/**
 * Internal APIs
 * To be used within internal architecture by other services only
 * apiKey required to access these routes
 */

/**
 * Module Dependencies
 */

const router = require('express').Router();
const { celebrate, Joi } = require('celebrate');
Joi.objectId = require('joi-objectid')(Joi);
const C = require('../lib/constants');

const env = require('../config/env');
const c = require('./helper');
const { BadRequest } = require('../lib/errors');

const passport = require('passport');
require('../config/passport');
const { passportAuthenticate } = require('../middlewares/authorization');

/**
 * Controllers
 */

const internalController = require('../controllers/internal');
const clientChatController = require('../controllers/client/chat');
const pmController = require('../controllers/pm');
const pmChatController = require('../controllers/pm/chat');
const fileStoreController = require('../controllers/fileStore');

/**
 * Services
 */

const userService = require('../services/db/user');
const { emptyS3Directory } = require('../utils/s3-operations');

/*
 * Route Level Middlewares
 */
const serviceCheck = (req, res, next) => {
    // console.log(req.body);
    const { apikey } = req.query;
    if (apikey !== process.env.APIKEY) {
        const error = new BadRequest('API Key does not match, or not given');
        return next(error);
    }
    next();
};

const authChecker = [passportAuthenticate(passport)];

/**
 * Sitemap
 */
router.get('/sitemap.xml', async (req, res) => {
    const sitemap = await internalController.getPublicProfileSitemap();
    res.header('Content-Type', 'application/xml');
    return res.send(sitemap);
});

/**
 * Get User for socket connections
 * Currently supported users: Writer, Client, PM, GU
 */

router.post(
    '/getUser',
    serviceCheck,
    celebrate({
        body: Joi.object().keys({
            id: Joi.objectId().default(''),
            role: Joi.string()
                .valid(
                    C.ROLES.WRITER_C,
                    C.ROLES.CLIENT_C,
                    C.ROLES.PM_C,
                    C.ROLES.GU_C,
                    C.ROLES.EXT_CLIENT,
                )
                .default(''),
            email: Joi.string().email().default(''),
        }),
    }),
    async (req, res) => {
        try {
            const { id, role, email } = req.body;
            let user;
            if (id && role) {
                user = await userService.getUser({ id, role });
            } else if (id) {
                user = await userService.findUserById({ id });
            } else if (email) {
                user = await userService.getUserByEmail({ email });
            }
            if (!user) throw new BadRequest('user not found');
            return res.json({ user });
        } catch (err) {
            return res.json({ success: false, err: err.message });
        }
    },
);

/**
 * Schedule/Cancel Agenda internal endpoints
 */

router.post(
    '/agenda/schedule',
    serviceCheck,
    celebrate({
        body: Joi.object().keys({
            name: Joi.string().required(),
            recur: Joi.boolean().required(),
            period: Joi.string().required(),
            now: Joi.boolean().default(false),
            data: Joi.object().required(),
        }),
    }),
    async (req, res) => {
        try {
            const newAgenda = await internalController.createAgenda({
                ...req.body,
            });
            return res.json({ success: true });
        } catch (err) {
            return res.json({ success: false, error: err.message });
        }
    },
);

router.post(
    '/agenda/cancel',
    serviceCheck,
    celebrate({
        body: Joi.object().keys({
            name: Joi.string().required(),
            conditions: Joi.object().required(),
        }),
    }),
    async (req, res) => {
        try {
            const cancelAgenda = await internalController.cancelAgenda({
                ...req.body,
            });
            return res.json({ success: true });
        } catch (err) {
            return res.json({ success: false, error: err.message });
        }
    },
);

// Find agenda job and update data and reschedule

router.post(
    '/agenda/update',
    serviceCheck,
    celebrate({
        body: Joi.object().keys({
            nextRunAt: Joi.string().required(),
            query: Joi.object(),
            data: Joi.object(),
            createNew: Joi.object(),
        }),
    }),
    async (req, res) => {
        try {
            await internalController.updateJob({
                ...req.body,
            });
            return res.json({ success: true });
        } catch (err) {
            return res.json({ success: false, error: err.message });
        }
    },
);

/**
 * S3 utils endpoints
 */

router.post(
    '/s3/delete/directory',
    serviceCheck,
    celebrate({
        body: Joi.object().keys({
            prefix: Joi.string().required(),
        }),
    }),
    async (req, res) => {
        try {
            await emptyS3Directory(env.S3_BUCKET_USER_DATA, req.body.prefix);
            return res.json({ success: true });
        } catch (err) {
            return res.json({ success: false, error: err.message });
        }
    },
);

/**
 * Feed Module internal endpoints
 */

router.get(
    '/feed/allProjects',
    serviceCheck,
    c((req) => {}, internalController.getAllProjects),
);

router.post(
    '/feed/score-bulk-update',
    serviceCheck,
    celebrate({
        body: Joi.array()
            .items(
                Joi.object().keys({
                    id: Joi.objectId().required(),
                    score: Joi.number().required(),
                }),
            )
            .default([]),
    }),
    c((req) => {
        const data = req.body;
        return { data };
    }, internalController.bulkUpdateScore),
);

/**
 * Client/Creator/PM Internal enpoints
 */

router.post(
    '/user/client/collect-invite',
    serviceCheck,
    celebrate({
        body: Joi.object().keys({
            client: Joi.objectId().required(),
            title: Joi.string().trim().default(''),
            description: Joi.string().trim().default(''),
            deliverables: Joi.array().items(Joi.string().trim()),
        }),
    }),
    c((req) => {
        const { client, title, description, deliverables } = req.body;
        return {
            client,
            title,
            description,
            deliverables,
        };
    }, clientChatController.collectInviteFields),
);

router.put(
    '/user/pm/add-to-studio',
    serviceCheck,
    celebrate({
        body: Joi.object().keys({
            pmId: Joi.objectId().required(),
            creatorId: Joi.objectId().required(),
        }),
    }),
    c((req) => {
        const { pmId, creatorId } = req.body;
        return {
            pmId,
            creatorId,
        };
    }, pmController.addCreatorToStudio),
);

router.put(
    '/user/pm/update-stats',
    serviceCheck,
    celebrate({
        body: Joi.object().keys({
            pmId: Joi.objectId().required(),
            studioProjects: Joi.boolean().default(false),
            collabCount: Joi.boolean().default(false),
        }),
    }),
    c((req) => {
        const { pmId, studioProjects, collabCount } = req.body;
        return {
            pmId,
            studioProjects,
            collabCount,
        };
    }, pmController.updateStudioStats),
);

router.post(
    '/user/pm/create-card',
    serviceCheck,
    celebrate({
        body: Joi.object().keys({
            listname: Joi.string()
                .valid(...Object.values(C.LISTNAMES))
                .required(),
            owner: Joi.objectId().required(),
            user: Joi.objectId().required(),
            message: Joi.objectId().required(),
        }),
    }),
    c((req) => {
        const { listname, owner, user, message } = req.body;
        return { listname, owner, user, message };
    }, pmChatController.createListCard),
);

router.get(
    '/user/pm/get-connected-users',
    serviceCheck,
    c((req) => {
        const { pm, selectEmail } = req.body;
        return { pm, selectEmail };
    }, pmChatController.getConnectedUsers),
);

router.post(
    '/ext-client/accept-request',
    serviceCheck,
    celebrate({
        body: Joi.object().keys({
            userId: Joi.objectId().required(),
            /*    usecase: Joi.string().required(),
            creatorName: Joi.string().required(), */
            serviceRef: Joi.objectId().allow(null).default(null),
        }),
    }),
    c((req) => {
        const { userId, serviceRef } = req.body;
        return { userId, serviceRef };
    }, internalController.acceptRequestAndCreateProject),
);

router.post(
    '/ext-client/initiate-transfer',
    serviceCheck,
    celebrate({
        body: Joi.object().keys({
            mid: Joi.objectId().required(),
            gateway: Joi.string().required(),
        }),
    }),
    c((req) => {
        const { mid, gateway } = req.body;
        return { mid, gateway };
    }, internalController.initiateTransactionExtPay),
);

/**
 * File Store Internal Endpoints
 */

router.post(
    '/file-store/persist',
    serviceCheck,
    celebrate({
        body: Joi.object().keys({
            fileIds: Joi.array().items(Joi.objectId()).required(),
        }),
    }),
    c((req) => {
        const { fileIds } = req.body;
        return { fileIds };
    }, fileStoreController.updateStateAndPersist),
);

/**
 * Web push endpoints
 */

router.post(
    '/web-push/subscribe',
    authChecker,
    celebrate({
        body: Joi.object().keys({
            subscribeData: Joi.object().keys({
                endpoint: Joi.string().uri().required(),
                // expirationTime: Joi.string().allow(null),
                p256dh: Joi.string().required(),
                auth: Joi.string().required(),
            }),
            oldEndpoint: Joi.string().uri().allow('').default(''),
        }),
    }),
    c((req) => {
        const data = req.body;
        const user = req.user;
        return { data: { ...data, userId: user.id } };
    }, internalController.subscribeUserWebPush),
);

router.post(
    '/web-push/unsubscribe',
    authChecker,
    celebrate({
        body: Joi.object().keys({
            // userId: Joi.objectId().required(),
            endpoint: Joi.string().uri().required(),
        }),
    }),
    c((req) => {
        const data = req.body;
        const user = req.user;
        return { ...data, userId: user.id };
    }, internalController.unsubscribeUserWebPush),
);

router.post(
    '/web-push/push-message',
    celebrate({
        body: Joi.object().keys({
            userId: Joi.objectId().required(),
            payload: Joi.string().required(),
        }),
    }),
    c((req) => {
        const { userId, payload } = req.body;
        return {
            userId,
            payload,
        };
    }, internalController.pushWebPushPayload),
);

/**
 * ! Srictly for testing only
 */

/**
 * @apiName Stripe Pay Invoice
 */

router.post(
    '/pay-invoice',
    serviceCheck,
    celebrate({
        body: Joi.object().keys({
            invoiceId: Joi.objectId().required(),
            clientCardCountry: Joi.string().required(),
            clientId: Joi.objectId().required(),
            email: Joi.string().email().required(),
        }),
    }),
    c((req) => {
        const { clientId, email } = req.body;
        const client = {
            id: clientId,
            e: email,
        };
        const { invoiceId, clientCardCountry } = req.body;
        return {
            client,
            invoiceId,
            clientCardCountry,
        };
    }, clientChatController.payInvoice),
);

module.exports = router;

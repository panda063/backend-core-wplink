/**
 * Dependencies
 */
const { celebrate, Joi, isCelebrate } = require('celebrate');
Joi.objectId = require('joi-objectid')(Joi);
const router = require('express').Router();

const c = require('../helper');
const CONSTANTS = require('../../lib/constants');

/**
 * Controller File
 */
const chatController = require('../../controllers/client/chat');
const commonControllers = require('../../controllers/common');

/**
 * Middlewares
 */
const {
    attachConversation,
    attachConversationErrorHandler,
} = require('../middlewares/clientMiddlewares');

/**
 * Services
 */
const {
    miscUpload: { inviteBriefUpload, inviteReferenceUpload },
} = require('../../services/file-upload-service');

/**
 * @apiName Upload brief
 * Returned Url is used in the send invite event
 */
// ! To be deprecated. Use new file upload flow to upload brief and references
router.post(
    '/upload/brief/:cid',
    celebrate({
        params: Joi.object().keys({
            cid: Joi.objectId().required(),
        }),
    }),
    attachConversation,
    inviteBriefUpload.array('brief', 1),
    c((req) => {
        const client = req.user;
        const files = req.files;
        return { client, files };
    }, chatController.uploadBriefOrReference),
    attachConversationErrorHandler,
);

/**
 * @apiName Upload references
 * Returned Url is used in the send invite event
 */
// ! To be deprecated. Use new file upload flow to upload brief and references
router.post(
    '/upload/reference/:cid',
    celebrate({
        params: Joi.object().keys({
            cid: Joi.objectId().required(),
        }),
    }),
    attachConversation,
    inviteReferenceUpload.array('reference', 1),
    c((req) => {
        const client = req.user;
        const files = req.files;
        return { client, files };
    }, chatController.uploadBriefOrReference),
    attachConversationErrorHandler,
);

/**
 * @apiName Get all payments
 */
router.get(
    '/payments',
    c((req) => {
        const client = req.user;
        return { client };
    }, chatController.getPaymentsList),
);

/**
 * @apiName Stripe Pay Invoice
 */
// ! To be deprecated. Find new API in routes/payments which is common to PM/Client
router.post(
    '/pay-invoice',
    celebrate({
        body: Joi.object().keys({
            invoiceId: Joi.objectId().required(),
            clientCardCountry: Joi.string().required(),
        }),
    }),
    c((req) => {
        const client = req.user;
        const { invoiceId, clientCardCountry } = req.body;
        return {
            client,
            invoiceId,
            clientCardCountry,
        };
    }, chatController.payInvoice),
);

/**
 * @apiName Get previous invite field values
 */
router.get(
    '/prevInviteValues',
    c((req) => {
        const client = req.user;
        return {
            client,
        };
    }, chatController.getLastInviteFields),
);

module.exports = router;

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
const chatController = require('../../controllers/creator/chat');
const clientChatController = require('../../controllers/client/chat');
const pmChatController = require('../../controllers/pm/chat');

/**
 * Middlewares
 */
const {
    attachEmptyProposal,
    proposalCoverUploadError,
    attachProposal,
    attachProposalMessage,
} = require('../middlewares/writerMiddlewares');

const {
    attachGroupConversationForAdmin,
} = require('../middlewares/pmMiddlewares');

/**
 * Services
 */
const {
    miscUpload: {
        proposalCoverUpload,
        sendProposalCoverUpload,
        groupImageUpload,
    },
} = require('../../services/file-upload-service');

/**
 * Chat Template Routes
 * ! To be deprecated. Use APIs in routes/chat which are common to both PM/Creator
 */

/**
 * @apiName Create new item for templates
 */
router.post(
    '/template/item',
    celebrate({
        body: Joi.object().keys({
            name: Joi.string().trim().required(),
            description: Joi.string().trim().required(),
            category: Joi.string().required(),
            price: Joi.number().min(0).required(),
        }),
    }),
    c((req) => {
        const creator = req.user;
        const itemData = req.body;
        return { creator, itemData };
    }, chatController.createTemplateItem),
);

/**
 * @apiName Update item
 */
router.put(
    '/template/item/:itemId',
    celebrate({
        params: Joi.object().keys({
            itemId: Joi.objectId().required(),
        }),
        body: Joi.object().keys({
            name: Joi.string().trim().required(),
            description: Joi.string().trim().required(),
            category: Joi.string().required(),
            price: Joi.number().min(0).required(),
        }),
    }),
    c((req) => {
        const creator = req.user;
        const itemData = req.body;
        const { itemId } = req.params;
        return { creator, itemId, itemData };
    }, chatController.updateTemplateItem),
);

/**
 * @apiName Create Proposal Template
 */
// Function to deserialize and validate items field from request
const itemDataValidation = (req, res, next) => {
    try {
        if (!req.body.items) return next();
        const valueAsJson = JSON.parse(req.body.items);
        const itemSchemaValidate = Joi.array().items(
            Joi.object().keys({
                name: Joi.string().trim().required(),
                description: Joi.string().trim().allow('').default(''),
                price: Joi.number().min(0).required(),
            }),
        );
        const { error, value } = itemSchemaValidate.validate(valueAsJson);
        if (error) return next(error);
        req.body.items = value;
        return next();
    } catch (err) {
        return next(err);
    }
};

/**
 * @apiName Create Proposal Template
 */
router.post(
    '/template/proposal',
    attachEmptyProposal,
    proposalCoverUpload.array('cover', 1),
    celebrate({
        body: Joi.object().keys({
            name: Joi.string().trim().required(),
            description: Joi.string().trim().required(),
            category: Joi.string().required(),
            price: Joi.number().min(0).required(),
            currency: Joi.string()
                .valid(...Object.values(CONSTANTS.CURRENCY))
                .required(),
            payoutCondition: Joi.string()
                .valid(...CONSTANTS.PROPOSAL_PAYOUT_CONDITION)
                .trim()
                .required(),
            items: Joi.string().allow('', null),
        }),
    }),
    // Deserialize and validate items field
    itemDataValidation,
    c((req) => {
        const newProposal = req.proposal;
        const proposalData = req.body;
        const creator = req.user;
        return {
            creator,
            newProposal,
            proposalData,
            files: req.files,
        };
    }, chatController.createUpdateTemplateProposal),
    proposalCoverUploadError,
);

/**
 * @apiName Update Proposal Template
 */
router.put(
    '/template/proposal/:pid',
    celebrate({
        params: Joi.object().keys({
            pid: Joi.objectId().required(),
        }),
    }),
    attachProposal,
    proposalCoverUpload.array('cover', 1),
    celebrate({
        body: Joi.object().keys({
            name: Joi.string().trim().required(),
            description: Joi.string().trim().required(),
            category: Joi.string().required(),
            price: Joi.number().min(0).required(),
            currency: Joi.string()
                .valid(...Object.values(CONSTANTS.CURRENCY))
                .required(),
            payoutCondition: Joi.string()
                .valid(...CONSTANTS.PROPOSAL_PAYOUT_CONDITION)
                .trim()
                .required(),
            items: Joi.string().allow('', null),
            cover: Joi.string().default(''),
        }),
    }),
    itemDataValidation,
    c((req) => {
        const proposalData = req.body;
        const creator = req.user;
        return {
            creator,
            newProposal: req.proposal,
            proposalData,
            files: req.files,
        };
    }, chatController.createUpdateTemplateProposal),
    proposalCoverUploadError,
);

/**
 * @apiName Create Form Template
 */

router.post(
    '/template/form',
    celebrate({
        body: Joi.object().keys({
            name: Joi.string().trim().required(),
            description: Joi.string().trim().required(),
            fields: Joi.array()
                .items(
                    Joi.object().keys({
                        required: Joi.boolean().required(),
                        type: Joi.string()
                            .valid(...Object.values(CONSTANTS.FORM_TYPES))
                            .required(),
                        question: Joi.string().trim().required(),
                        options: Joi.when('type', {
                            is: CONSTANTS.FORM_TYPES.TEXT,
                            then: Joi.array().allow(null),
                            otherwise: Joi.array()
                                .items(Joi.string().trim())
                                .min(1)
                                .required(),
                        }),
                        other: Joi.boolean().default(false),
                    }),
                )
                .min(1)
                .required(),
        }),
    }),
    c((req) => {
        const form = req.body;
        const creator = req.user;
        return { form, creator };
    }, chatController.createUpdateFormTemplate),
);

/**
 * @apiName Update Form Template
 */

router.put(
    '/template/form/:id',
    celebrate({
        params: Joi.object().keys({
            id: Joi.objectId().required(),
        }),
        body: Joi.object().keys({
            name: Joi.string().trim().required(),
            description: Joi.string().trim().required(),
            fields: Joi.array()
                .items(
                    Joi.object().keys({
                        required: Joi.boolean().required(),
                        type: Joi.string()
                            .valid(...Object.values(CONSTANTS.FORM_TYPES))
                            .required(),
                        question: Joi.string().trim().required(),
                        options: Joi.when('type', {
                            is: CONSTANTS.FORM_TYPES.TEXT,
                            then: Joi.array().allow(null),
                            otherwise: Joi.array()
                                .items(Joi.string().trim())
                                .min(1)
                                .required(),
                        }),
                        other: Joi.boolean().default(false),
                    }),
                )
                .min(1)
                .required(),
        }),
    }),
    c((req) => {
        const id = req.params.id;
        const form = req.body;
        const creator = req.user;
        return { form, creator, id };
    }, chatController.createUpdateFormTemplate),
);

/**
 * @apiName Delete multiple Templates
 */
router.delete(
    '/template',
    celebrate({
        body: Joi.object().keys({
            itemIds: Joi.array().items(Joi.objectId()).required(),
        }),
    }),
    c((req) => {
        const creator = req.user;
        const { itemIds } = req.body;
        return { creator, itemIds };
    }, chatController.deleteMultipleTemplates),
);

/**
 * @apiName Fetch All templates
 */
router.get(
    '/templates/:type',
    celebrate({
        params: Joi.object().keys({
            type: Joi.string().valid('item', 'proposal', 'form').required(),
        }),
    }),
    c((req) => {
        const creator = req.user;
        const templateType = req.params.type;
        return {
            creator,
            templateType,
        };
    }, chatController.getAllTemplates),
);
/**
 * @apiName Fetch specific templates
 *
 */
router.get(
    '/template/:id',
    celebrate({
        params: Joi.object().keys({
            id: Joi.objectId().required(),
        }),
    }),
    c((req) => {
        const creator = req.user;
        const id = req.params.id;
        return {
            creator,
            id,
        };
    }, chatController.getSpecificTemplate),
);

/**
 * @apiName Pay Invoice
 */

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
    }, clientChatController.payInvoice),
);

/**
 * 1-1 Chat Messaging Routes
 */
/**
 * @apiName Upload Proposal Cover for chat
 *
 */
// ! To be deprecated. Use new file upload flow
router.post(
    '/upload/proposal/:cid',
    celebrate({
        params: Joi.object().keys({
            cid: Joi.objectId().required(),
        }),
    }),
    attachProposalMessage,
    sendProposalCoverUpload.array('cover', 1),
    c((req) => {
        const { proposal } = req;
        return {
            files: req.files,
            proposal,
        };
    }, chatController.sendProposalCoverUpload),
    proposalCoverUploadError,
);

/**
 * * Group Conversation Routes
 */

/**
 * @apiName Create group with studio members
 */
router.post(
    '/group/create-group',
    celebrate({
        body: Joi.object().keys({
            name: Joi.string().trim().required(),
            description: Joi.string().trim().required(),
            userIds: Joi.array().items(Joi.objectId()).unique().default([]),
        }),
    }),
    c((req) => {
        const pm = req.user;
        const data = req.body;
        return { pm, data };
    }, pmChatController.createGroupConversation),
);

/**
 * @apiName Get clients and/or creators which are in a 1-1 conversation with PM
 */
router.get(
    '/group/members-to-add',
    c((req) => {
        const pm = req.user;
        return { pm };
    }, pmChatController.findMembersForGroup),
);

/**
 * @apiName Add participants. Participant can be can any valid user role
 */
router.put(
    '/group/add-participants',
    celebrate({
        body: Joi.object().keys({
            gid: Joi.objectId().required(),
            userIds: Joi.array().items(Joi.objectId()).unique().required(),
        }),
    }),
    c((req) => {
        const pm = req.user;
        const { gid, userIds } = req.body;
        return { pm, gid, userIds };
    }, pmChatController.addGroupParticipants),
);

/**
 * @apiName Add off platform user to group
 */
router.put(
    '/group/add-participant/off-platform/:gid',
    celebrate({
        params: Joi.object().keys({
            gid: Joi.objectId().required(),
        }),
        body: Joi.object().keys({
            email: Joi.string().email().required(),
            firstName: Joi.string().trim().required(),
            lastName: Joi.string().trim().default(''),
            memberType: Joi.string()
                .valid(...Object.values(CONSTANTS.GROUP_USER_OFF_PLATFORM_TYPE))
                .required(),
            admin: Joi.boolean().default(false),
        }),
    }),
    c((req) => {
        const pm = req.user;
        const gid = req.params.gid;
        const data = req.body;
        return { gid, pm, data };
    }, pmChatController.addOffPlatformUser),
);

module.exports = router;

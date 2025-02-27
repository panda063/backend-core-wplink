/**
 * Dependencies
 */
const { celebrate, Joi, isCelebrate } = require('celebrate');
Joi.objectId = require('joi-objectid')(Joi);
const router = require('express').Router();
const C = require('../lib/constants');

const c = require('./helper');
const { BadRequest, NotFound, InternalServerError } = require('../lib/errors');
/**
 * Controller File
 */

const chatControllers = require('../controllers/chat');
const creatorChatController = require('../controllers/creator/chat');

/**
 * Middlewares
 */

const {
    attachFileMessage,
    attachGroupFileMessage,
    attachEmptyProposal,
    proposalCoverUploadError,
    attachProposal,
} = require('./middlewares/writerMiddlewares');

const {
    attachGroupConversationForAdmin,
} = require('./middlewares/pmMiddlewares');

/**
 * Services
 */

const {
    miscUpload: { sendFileUpload, groupImageUpload, proposalCoverUpload },
} = require('../services/file-upload-service');

/**
 * Guard Middlewares
 * Some routes are role specific. To prevent access we have this middleware
 */
const roleAccessGuard = (
    validRoles = [C.ROLES.CLIENT_C, C.ROLES.PM_C, C.ROLES.WRITER_C, C.ROLES.EXT_CLIENT],
) => {
    return (req, res, next) => {
        const role = req.user.__t;
        if (!validRoles.includes(role)) {
            return next(
                new BadRequest('Role not allowed to access this route'),
            );
        }
        return next();
    };
};

/**
 * User timezone
 * User's localtime is shown in chat conversation
 */
router.post(
    '/update-tmz',
    roleAccessGuard([
        C.ROLES.CLIENT_C,
        C.ROLES.PM_C,
        C.ROLES.WRITER_C,
        C.ROLES.GU_C,
    ]),
    celebrate({
        body: Joi.object().keys({
            timezone: Joi.string().required(),
        }),
    }),
    c((req) => {
        const user = req.user;
        const timezone = req.body.timezone;
        return { user, timezone };
    }, chatControllers.updateTimeZone),
);

router.get(
    '/timezone',
    roleAccessGuard([
        C.ROLES.CLIENT_C,
        C.ROLES.PM_C,
        C.ROLES.WRITER_C,
        C.ROLES.GU_C,
    ]),
    c((req) => {
        const user = req.user;
        return { user };
    }, chatControllers.getTimeZone),
);

/**
 * Creator/PM Chat Template Routes
 */

/**
 * @apiName Create new item for templates
 */
router.post(
    '/template/item',
    roleAccessGuard([C.ROLES.PM_C, C.ROLES.WRITER_C]),
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
    }, creatorChatController.createTemplateItem),
);

/**
 * @apiName Update item
 */
router.put(
    '/template/item/:itemId',
    roleAccessGuard([C.ROLES.PM_C, C.ROLES.WRITER_C]),
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
    }, creatorChatController.updateTemplateItem),
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
    roleAccessGuard([C.ROLES.PM_C, C.ROLES.WRITER_C]),
    attachEmptyProposal,
    proposalCoverUpload.array('cover', 1),
    celebrate({
        body: Joi.object().keys({
            name: Joi.string().trim().required(),
            description: Joi.string().trim().required(),
            category: Joi.string().required(),
            price: Joi.number().min(0).required(),
            currency: Joi.string()
                .valid(...Object.values(C.CURRENCY))
                .required(),
            payoutCondition: Joi.string()
                .valid(...C.PROPOSAL_PAYOUT_CONDITION)
                .trim()
                .required(),
            items: Joi.string().allow('', null),
            fileId: Joi.objectId().allow(null, ''),
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
    }, creatorChatController.createUpdateTemplateProposal),
    proposalCoverUploadError,
);

/**
 * @apiName Update Proposal Template
 */

router.put(
    '/template/proposal/:pid',
    roleAccessGuard([C.ROLES.PM_C, C.ROLES.WRITER_C]),
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
                .valid(...Object.values(C.CURRENCY))
                .required(),
            payoutCondition: Joi.string()
                .valid(...C.PROPOSAL_PAYOUT_CONDITION)
                .trim()
                .required(),
            items: Joi.string().allow('', null),
            cover: Joi.string().default(''),
            fileId: Joi.objectId().allow(null, ''),
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
    }, creatorChatController.createUpdateTemplateProposal),
    proposalCoverUploadError,
);

/**
 * @apiName Delete multiple Templates
 */
router.delete(
    '/template',
    roleAccessGuard([C.ROLES.PM_C, C.ROLES.WRITER_C]),
    celebrate({
        body: Joi.object().keys({
            itemIds: Joi.array().items(Joi.objectId()).required(),
        }),
    }),
    c((req) => {
        const creator = req.user;
        const { itemIds } = req.body;
        return { creator, itemIds };
    }, creatorChatController.deleteMultipleTemplates),
);

/**
 * @apiName Fetch All templates
 */

router.get(
    '/templates/:type',
    roleAccessGuard([C.ROLES.PM_C, C.ROLES.WRITER_C]),
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
    }, creatorChatController.getAllTemplates),
);
/**
 * @apiName Fetch specific templates
 *
 */
router.get(
    '/template/:id',
    roleAccessGuard([C.ROLES.PM_C, C.ROLES.WRITER_C]),
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
    }, creatorChatController.getSpecificTemplate),
);

/**
 * @apiName Create Form Template
 */

router.post(
    '/template/form',
    roleAccessGuard([C.ROLES.PM_C, C.ROLES.WRITER_C]),
    celebrate({
        body: Joi.object().keys({
            name: Joi.string().trim().required(),
            description: Joi.string().trim().required(),
            fields: Joi.array()
                .items(
                    Joi.object().keys({
                        required: Joi.boolean().required(),
                        type: Joi.string()
                            .valid(...Object.values(C.FORM_TYPES))
                            .required(),
                        question: Joi.string().trim().required(),
                        options: Joi.when('type', {
                            is: C.FORM_TYPES.TEXT,
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
    }, creatorChatController.createUpdateFormTemplate),
);

/**
 * @apiName Update Form Template
 */

router.put(
    '/template/form/:id',
    roleAccessGuard([C.ROLES.PM_C, C.ROLES.WRITER_C]),
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
                            .valid(...Object.values(C.FORM_TYPES))
                            .required(),
                        question: Joi.string().trim().required(),
                        options: Joi.when('type', {
                            is: C.FORM_TYPES.TEXT,
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
    }, creatorChatController.createUpdateFormTemplate),
);

/**
 * * Common routes for chat (/chat) for client, creator and PM
 * * We have two types chat endpoints - 1-1 and group. See field 'chat' in API comment for info
 */

/**
 * Chat messaging routes
 */

/**
 * @apiName upload file of message type file
 * @chat 1-1 chat
 */
// ! To be deprecated in favour of new file upload flow
router.post(
    '/upload/file/:cid',
    roleAccessGuard(),
    celebrate({
        params: Joi.object().keys({
            cid: Joi.objectId().required(),
        }),
    }),
    attachFileMessage,
    sendFileUpload.array('file', 1),
    c((req) => {
        const user = req.user;
        const files = req.files;
        const message = req.message;
        return { user, files, message };
    }, chatControllers.uploadFile),
);

/**
 * @apiName Get user info for chat global state. user is the authenticated user
 * @chat 1-1 and group
 */
router.get(
    '/user/info',
    roleAccessGuard([
        C.ROLES.CLIENT_C,
        C.ROLES.PM_C,
        C.ROLES.WRITER_C,
        C.ROLES.GU_C,
        C.ROLES.EXT_CLIENT,
    ]),
    c((req) => {
        return {
            user: req.user,
        };
    }, chatControllers.getUserInfo),
);

/**
 * @apiName Get user info of user which is in front of the authenticated user
 * @chat 1-1
 */

router.get(
    '/user/info/front/:convoId',
    roleAccessGuard([
        C.ROLES.CLIENT_C,
        C.ROLES.PM_C,
        C.ROLES.WRITER_C,
        C.ROLES.GU_C,
        C.ROLES.EXT_CLIENT,
    ]),
    celebrate({
        params: Joi.object().keys({
            convoId: Joi.objectId().required(),
        }),
    }),
    c((req) => {
        return {
            user: req.user,
            convoId: req.params.convoId,
        };
    }, chatControllers.getUserInfoFront),
);

/**
 * @apiName Get/create creator conversation
 */

router.get(
    '/conversation-create/:id',
    celebrate({
        params: Joi.object().keys({
            id: Joi.objectId().required(),
        }),
    }),
    c((req) => {
        const user = req.user;
        const { id } = req.params;
        return { user, id };
    }, chatControllers.getCreateConversationCreator),
);

/**
 * @apiName Start conversation using email
 * @version 3.1
 * @chat 1-1
 */

router.post(
    '/conversation/email-invite',
    celebrate({
        body: Joi.object().keys({
            email: Joi.string().email().required(),
            name: Joi.string().required(),
        }),
    }),
    roleAccessGuard([C.ROLES.WRITER_C]),
    c((req) => {
        const user = req.user;
        const { email, name } = req.body;
        return { user, email, name };
    }, chatControllers.inviteEmailToStartConversation),
);

/**
 * @apiName Fetch Conversation list for the tab [inbox, projects]
 * @chat 1-1 and group
 */
router.get(
    '/conversations/:state',
    roleAccessGuard([
        C.ROLES.CLIENT_C,
        C.ROLES.PM_C,
        C.ROLES.WRITER_C,
        C.ROLES.GU_C,
        C.ROLES.EXT_CLIENT,
    ]),
    celebrate({
        params: Joi.object().keys({
            state: Joi.string().valid('inbox', 'projects').required(),
        }),
    }),
    c((req) => {
        const user = req.user;
        const { state } = req.params;
        return { user, state };
    }, chatControllers.fetchConversationList),
);

/**
 * @apiName Fetch all messages of conversation/group converstion. Cursor based pagination is used
 * @chat 1-1 and group
 */
router.post(
    '/messages/:convoId',
    roleAccessGuard([
        C.ROLES.CLIENT_C,
        C.ROLES.PM_C,
        C.ROLES.WRITER_C,
        C.ROLES.GU_C,
        C.ROLES.EXT_CLIENT,
    ]),
    celebrate({
        params: Joi.object().keys({
            convoId: Joi.objectId().required(),
        }),
        body: Joi.object().keys({
            cursor: Joi.string()
                .min(24)
                .regex(/[a-z0-9]/)
                .default(''),
            limit: Joi.number().min(1).default(20),
            group: Joi.boolean().default(false),
            direction: Joi.string()
                .valid('forward', 'backward')
                .default('forward'),
        }),
    }),
    c((req) => {
        const convoId = req.params.convoId;
        const client = req.user;
        const paginate = req.body;
        return { convoId, user: client, paginate };
    }, chatControllers.fetchMessagesOfConversation),
);

/**
 * @apiName Search Text in Conversation
 * @chat 1-1 and group
 */
router.post(
    '/conversation/search/:cid',
    roleAccessGuard([
        C.ROLES.CLIENT_C,
        C.ROLES.PM_C,
        C.ROLES.WRITER_C,
        C.ROLES.GU_C,
        C.ROLES.EXT_CLIENT,
    ]),
    celebrate({
        params: Joi.object().keys({
            cid: Joi.objectId().required(),
        }),
        body: Joi.object().keys({
            searchText: Joi.string().min(1).required(),
            group: Joi.boolean().default(false),
        }),
    }),
    c((req) => {
        const user = req.user;
        const { cid } = req.params;
        const { searchText, group } = req.body;
        return { user, cid, group, searchText };
    }, chatControllers.searchConversation),
);

/**
 * @apiName Group Message by type
 * @chat 1-1 and group
 */
const allowedTypeValues = [
    'Brief',
    'ProposalM',
    'Link',
    'Images',
    'Docs',
    'Invoice',
    'Payments',
    'FormM',
    'ExtRequest',
];
router.post(
    '/messages/group/:convoId',
    roleAccessGuard([
        C.ROLES.CLIENT_C,
        C.ROLES.PM_C,
        C.ROLES.WRITER_C,
        C.ROLES.GU_C,
        C.ROLES.EXT_CLIENT,
    ]),
    celebrate({
        params: Joi.object().keys({
            convoId: Joi.objectId().required(),
        }),
        body: Joi.object().keys({
            type: Joi.string()
                .valid(...allowedTypeValues)
                .required(),
            group: Joi.boolean().default(false),
        }),
    }),
    c((req) => {
        const user = req.user;
        const type = req.body.type;
        const group = req.body.group;
        const convoId = req.params.convoId;
        return { user, type, convoId, group };
    }, chatControllers.fetchMessageByType),
);

/**
 * @apiName Fetch specific Message
 * @chat 1-1
 */
router.get(
    '/message/:mid',
    roleAccessGuard([
        C.ROLES.CLIENT_C,
        C.ROLES.PM_C,
        C.ROLES.WRITER_C,
        C.ROLES.GU_C,
        C.ROLES.EXT_CLIENT,
    ]),
    celebrate({
        params: Joi.object().keys({
            mid: Joi.objectId().required(),
        }),
    }),
    c((req) => {
        const user = req.user;
        const mid = req.params.mid;
        return { user, mid };
    }, chatControllers.fetchSpecificMessage),
);

/**
 * @apiName Start Pagination using message id
 * @chat 1-1
 */

router.get(
    '/message/paginate/:mid',
    roleAccessGuard([
        C.ROLES.CLIENT_C,
        C.ROLES.PM_C,
        C.ROLES.WRITER_C,
        C.ROLES.GU_C,
        C.ROLES.EXT_CLIENT,
    ]),
    celebrate({
        params: Joi.object().keys({
            mid: Joi.objectId().required(),
        }),
    }),
    c((req) => {
        const user = req.user;
        const mid = req.params.mid;
        return { user, mid, group: false };
    }, chatControllers.getCursorFromId),
);

/**
 * @apiName Start Pagination using message id
 * @chat Group
 */

router.get(
    '/group/message/paginate/:mid',
    roleAccessGuard([
        C.ROLES.CLIENT_C,
        C.ROLES.PM_C,
        C.ROLES.WRITER_C,
        C.ROLES.GU_C,
    ]),
    celebrate({
        params: Joi.object().keys({
            mid: Joi.objectId().required(),
        }),
    }),
    c((req) => {
        const user = req.user;
        const mid = req.params.mid;
        return { user, mid, group: true };
    }, chatControllers.getCursorFromId),
);

/**
 * @apiName Get all last payments from all conversations of user
 * @chat 1-1
 */

router.post(
    '/payments',
    roleAccessGuard(),
    c((req) => {
        const user = req.user;
        return { user };
    }, chatControllers.getPaymentsList),
);

/**
 * @apiName Change Conversation State
 * @chat 1-1
 */

router.put(
    '/state/conversation/:convoId',
    roleAccessGuard(),
    celebrate({
        body: Joi.object().keys({
            state: Joi.string()
                .valid(...Object.values(C.CONVERSATION_LOCAL_STATE))
                .required(),
        }),
    }),
    c((req) => {
        const user = req.user;
        const state = req.body.state;
        const convoId = req.params.convoId;
        return {
            user,
            state,
            convoId,
        };
    }, chatControllers.updateConversationState),
);

/**
 * @apiName Give form response
 * @chat 1-1
 */

router.post(
    '/form/submit/:mid',
    roleAccessGuard([
        C.ROLES.CLIENT_C,
        C.ROLES.PM_C,
        C.ROLES.WRITER_C,
        C.ROLES.GU_C,
        C.ROLES.EXT_CLIENT,
    ]),
    celebrate({
        params: Joi.object().keys({
            mid: Joi.objectId().required(),
        }),
        body: Joi.object().keys({
            fields: Joi.array()
                .items(
                    Joi.object().keys({
                        id: Joi.objectId().required(),
                        answer: Joi.string().trim().default(''),
                        selected: Joi.alternatives()
                            .try(
                                Joi.objectId().allow(''),
                                Joi.array().items(Joi.objectId()).unique(),
                            )
                            .default(''),
                    }),
                )
                .min(1)
                .required(),
        }),
    }),
    c((req) => {
        const mid = req.params.mid;
        const form = req.body;
        const user = req.user;
        return { user, mid, form };
    }, chatControllers.submitFormResponse),
);

/**
 * ****** Group conversations***************
 */

/**
 * @apiName Create group conversation
 */

router.post(
    '/group/create-group',
    roleAccessGuard([
        C.ROLES.CLIENT_C,
        C.ROLES.PM_C,
        C.ROLES.WRITER_C,
        C.ROLES.EXT_CLIENT,
    ]),
    celebrate({
        body: Joi.object().keys({
            name: Joi.string().trim().required(),
            description: Joi.string().trim().required(),
            userIds: Joi.array().items(Joi.objectId()).unique().default([]),
        }),
    }),
    c((req) => {
        const user = req.user;
        const data = req.body;
        return { user, data };
    }, chatControllers.createGroupConversation),
);

/**
 * @apiName Add participants. Participant can be can any valid user role
 */

router.put(
    '/group/add-participants',
    roleAccessGuard([
        C.ROLES.CLIENT_C,
        C.ROLES.PM_C,
        C.ROLES.WRITER_C,
        C.ROLES.EXT_CLIENT,
    ]),
    celebrate({
        body: Joi.object().keys({
            gid: Joi.objectId().required(),
            userIds: Joi.array().items(Joi.objectId()).unique().required(),
        }),
    }),
    c((req) => {
        const user = req.user;
        const { gid, userIds } = req.body;
        return { user, gid, userIds };
    }, chatControllers.addGroupParticipants),
);

/**
 * @apiName Get connected users
 */

router.get(
    '/group/members-to-add',
    roleAccessGuard([
        C.ROLES.CLIENT_C,
        C.ROLES.PM_C,
        C.ROLES.WRITER_C,
        C.ROLES.EXT_CLIENT,
    ]),
    c((req) => {
        const user = req.user;
        return { user };
    }, chatControllers.getMembersToAdd),
);

/**
 * @apiName Add off platform user to group
 * @description Email, name is provided and an ExtClient user is created and added to group
 */

router.put(
    '/group/add-participant/off-platform/:gid',
    roleAccessGuard([
        C.ROLES.CLIENT_C,
        C.ROLES.PM_C,
        C.ROLES.WRITER_C,
        C.ROLES.EXT_CLIENT,
    ]),
    celebrate({
        params: Joi.object().keys({
            gid: Joi.objectId().required(),
        }),
        body: Joi.object().keys({
            email: Joi.string().email().required(),
            name: Joi.string().required(),
            admin: Joi.boolean().default(false),
        }),
    }),
    c((req) => {
        const user = req.user;
        const gid = req.params.gid;
        const data = req.body;
        return { gid, user, data };
    }, chatControllers.addOffPlatformUser),
);

/**
 * @apiName Update group details
 * @chat group
 */

router.put(
    '/group/update-details/:gid',
    roleAccessGuard([
        C.ROLES.CLIENT_C,
        C.ROLES.PM_C,
        C.ROLES.WRITER_C,
        C.ROLES.EXT_CLIENT,
    ]),
    celebrate({
        params: Joi.object().keys({
            gid: Joi.objectId().required(),
        }),
        body: Joi.object().keys({
            name: Joi.string().trim().required(),
            description: Joi.string().trim().required(),
        }),
    }),
    c((req) => {
        const user = req.user;
        const data = req.body;
        const { gid } = req.params;
        return { user, data, gid };
    }, chatControllers.updateGroupDetails),
);

/**
 * @apiName Update group logo
 * @chat group
 */

router.put(
    '/group/logo/:gid',
    roleAccessGuard([
        C.ROLES.CLIENT_C,
        C.ROLES.PM_C,
        C.ROLES.WRITER_C,
        C.ROLES.EXT_CLIENT,
    ]),
    celebrate({
        params: Joi.object().keys({
            gid: Joi.objectId().required(),
        }),
        body: Joi.object().keys({
            fileId: Joi.objectId().allow(null, ''),
        }),
    }),
    attachGroupConversationForAdmin,
    groupImageUpload.single('file'),
    c((req) => {
        const group = req.group;
        const { file } = req;
        const { fileId } = req.body;
        return { group, file, fileId };
    }, chatControllers.updateLogo),
);

/**
 * @apiName Remove group logo
 * @chat group
 */
router.delete(
    '/group/logo/:gid',
    roleAccessGuard([
        C.ROLES.CLIENT_C,
        C.ROLES.PM_C,
        C.ROLES.WRITER_C,
        C.ROLES.EXT_CLIENT,
    ]),
    celebrate({
        params: Joi.object().keys({
            gid: Joi.objectId().required(),
        }),
    }),
    attachGroupConversationForAdmin,
    c((req) => {
        const group = req.group;
        return { group };
    }, chatControllers.removeLogo),
);

/**
 * @apiName Upload file for group message
 * @chat group
 */
// ! To be deprecated in favour of new file upload flow
router.post(
    '/upload/group/file/:cid',
    roleAccessGuard([
        C.ROLES.CLIENT_C,
        C.ROLES.PM_C,
        C.ROLES.WRITER_C,
        C.ROLES.EXT_CLIENT,
    ]),
    celebrate({
        params: Joi.object().keys({
            cid: Joi.objectId().required(),
        }),
    }),
    attachGroupFileMessage,
    sendFileUpload.array('file', 1),
    c((req) => {
        const user = req.user;
        const files = req.files;
        const message = req.message;
        return { user, files, message };
    }, chatControllers.uploadFile),
);

/**
 * @apiName Get Group conversation details and participants
 * @chat group
 *
 */
router.get(
    '/conversation/group/details/:gid',
    roleAccessGuard([
        C.ROLES.CLIENT_C,
        C.ROLES.PM_C,
        C.ROLES.WRITER_C,
        C.ROLES.EXT_CLIENT,
    ]),
    celebrate({
        params: Joi.object().keys({
            gid: Joi.objectId().required(),
        }),
    }),
    c((req) => {
        const user = req.user;
        const gid = req.params.gid;
        return { user, gid };
    }, chatControllers.fetchGroupDetails),
);

module.exports = router;

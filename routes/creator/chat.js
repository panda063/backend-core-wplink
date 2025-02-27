/**
 * Dependencies
 */

const { celebrate, Joi, isCelebrate } = require('celebrate');
Joi.objectId = require('joi-objectid')(Joi);
const router = require('express').Router();

const c = require('../helper');
const CONSTANTS = require('../../lib/constants');
const { CREATOR_BUDGET_LIMITS } = CONSTANTS;

/**
 * Controller File
 */
const chatController = require('../../controllers/creator/chat');
/**
 * Middlewares
 */
const {
    proposalCoverUploadError,
    attachProposalMessage,
} = require('../middlewares/writerMiddlewares');

/**
 * Services
 */
const {
    miscUpload: { sendProposalCoverUpload },
} = require('../../services/file-upload-service');

/**
 * Set budget
 */
router.put(
    '/budget',
    celebrate({
        body: Joi.object().keys({
            minBudget: Joi.number()
                .min(CREATOR_BUDGET_LIMITS.MIN_BUDGET)
                .max(CREATOR_BUDGET_LIMITS.MAX_BUDGET)
                .required(),
            maxBudget: Joi.number()
                .min(CREATOR_BUDGET_LIMITS.MIN_BUDGET)
                .max(CREATOR_BUDGET_LIMITS.MAX_BUDGET)
                .required(),
            perHourCharge: Joi.number()
                .min(CREATOR_BUDGET_LIMITS.MIN_PER_HOUR)
                .max(CREATOR_BUDGET_LIMITS.MAX_PER_HOUR)
                .required(),
        }),
    }),
    c((req) => {
        const creator = req.user;
        const budgetData = req.body;
        return { creator, budgetData };
    }, chatController.setBudget),
);
router.get(
    '/budget',
    c((req) => {
        const creator = req.user;
        return { creator };
    }, chatController.getBudget),
);

/**
 * @apiName Get creators payment analytics
 */
router.get(
    '/analytics',
    c((req) => {
        const creator = req.user;
        return { creator };
    }, chatController.getPaymentAnalytics),
);

/**
 * Chat Messaging Routes
 */

/**
 * Upload Proposal Cover
 */
// ! To be deprecated in favour of new file upload flow
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

module.exports = router;

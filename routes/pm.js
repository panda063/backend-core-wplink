/**
 * Module Dependencies
 */
const _ = require('lodash');
const { celebrate, Joi, isCelebrate } = require('celebrate');
Joi.objectId = require('joi-objectid')(Joi);
const router = require('express').Router();

const c = require('./helper');
const C = require('../lib/constants');
/**
 * Routers
 */
const portfolioRouter = require('./pm/portfolio');
const feedRouter = require('./pm/feed');
const jobBoardRouter = require('./pm/job-board');
const chatRouter = require('./pm/chat');
const paymentsRouter = require('./pm/payments');

/**
 * Controllers
 */

const writerController = require('../controllers/writer');

// Regex pattern for a valid email address
const emailRegex = /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/;

/**
 * @version3
 * Submit for portfolio complete
 */
// ! To be deprecated. Use new API from routes/creator which is common to PM/Creator
router.put(
    '/submit',
    c((req) => {
        const creator = req.user;
        return {
            creator,
        };
    }, writerController.updateSubmit),
);

// Invitation and social share enpoints
// ! To be deprecated. Use new API from routes/creator which is common to PM/Creator
router.post(
    '/invite',
    celebrate({
        body: Joi.object().keys({
            emails: Joi.array()
                .min(1)
                .max(3)
                .items(Joi.string().regex(emailRegex))
                .required(),
        }),
    }),
    c((req) => {
        const user = req.user;
        const { emails } = req.body;
        return { user, emails };
    }, writerController.inviteViaEmail),
);
// ! To be deprecated. Use new API from routes/creator which is common to PM/Creator
router.put(
    '/social-share',
    celebrate({
        body: Joi.object().keys({
            social: Joi.string()
                .valid(...Object.values(C.SOCIAL_SHARE_OPTIONS))
                .required(),
            status: Joi.string().valid('clicked').required(),
        }),
    }),
    c((req) => {
        const { social, status } = req.body;
        const user = req.user;
        return { user, social, status };
    }, writerController.setSocial),
);

// Portfolio Routes
router.use('/portfolio', portfolioRouter);

// Feed Router
router.use('/feed', feedRouter);

// Job board
router.use('/job-board', jobBoardRouter);

// Chat
router.use('/chat', chatRouter);

// Payment
router.use('/payments', paymentsRouter);

module.exports = router;

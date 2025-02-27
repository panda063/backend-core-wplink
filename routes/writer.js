/**
 * Module Dependencies
 */

const _ = require('lodash');
const { celebrate, Joi, isCelebrate } = require('celebrate');
Joi.objectId = require('joi-objectid')(Joi);
const router = require('express').Router();

const c = require('./helper');
const C = require('../lib/constants');

const { BadRequest } = require('../lib/errors');

/**
 * Controllers
 */

const writerController = require('../controllers/writer');

/**
 * Middlewares
 */

const setupProfileGuard = (
    notValidProfileStatus = [C.V3_CREATOR_ONBOARDING_STATES.STEP_SETUP],
) => {
    return (req, res, next) => {
        // Only allow route setup profile
        if (req.path === '/v3.1/portfolio/setup-profile') return next();
        const user = req.user;
        const { onboardState } = user;
        if (notValidProfileStatus.includes(onboardState)) {
            return next(
                new BadRequest(
                    'Setup your profile before accessing this API',
                    'CR401',
                ),
            );
        }
        return next();
    };
};

/**
 * External Service Dependencies
 */

/**
 * Routers
 */

const chatRouter = require('./creator/chat');
const paymentsRouter = require('./creator/payments');
const portfolioRouter = require('./creator/portfolio');
const portfolioRouterV3 = require('./creator/portfolio-v3.1');
const analyticsRouterV1 = require('./creator/analytics-v1');
const jobBoardRouter = require('./creator/job-board');
const feedRouter = require('./creator/feed');
const invoiceRouter = require('./creator/invoice');
const collabRouter = require('./creator/collab-v1.0');

/*
 * Router Level Middlewares
 */

/**
 * Guard against incompleted profiles
 * @version 3.1
 */
router.use(setupProfileGuard());

/**
 * ! New creator onboarding flow states
 */
router.put(
    '/onboard-state',
    celebrate({
        body: Joi.object().keys({
            state: Joi.string()
                .valid(
                    C.CREATOR_ONBOARDING_STATES.PROJECT_PREVIEW,
                    C.CREATOR_ONBOARDING_STATES.DONE,
                )
                .required(),
        }),
    }),
    c((req) => {
        const creator = req.user;
        const { state } = req.body;
        return { creator, state };
    }, writerController.updateOnboardState),
);

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

/**
 * Invitation and social share endpoints
 * @Version2
 */

// Regex pattern for a valid email address
const emailRegex = /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/;
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

/**
 * Find User
 */
// Get Client name and logo
router.post(
    '/findClient',
    celebrate({
        body: Joi.object().keys({
            searchValue: Joi.string().allow(''),
            workedWith: Joi.boolean().default(false),
        }),
    }),
    c((req) => {
        const creator = req.user;
        let { searchValue, workedWith } = req.body;
        return { creator, searchValue, workedWith };
    }, writerController.findClient),
);

// Get Creator name and Image
router.post(
    '/findCreator',
    celebrate({
        body: Joi.object().keys({
            searchValue: Joi.string().allow(''),
        }),
    }),
    c((req) => {
        const creator = req.user;
        let { searchValue } = req.body;
        return { creator, searchValue };
    }, writerController.findCreator),
);

// ! Creator Portfolio endpoints
router.use('/portfolio', portfolioRouter);

router.use('/v3.1/portfolio', portfolioRouterV3);

router.use('/invoice', invoiceRouter);

router.use('/v1/analytics', analyticsRouterV1);

// Job board Endpoints
router.use('/job-board', jobBoardRouter);

// Feed
router.use('/feed', feedRouter);

// Chat
router.use('/chat', chatRouter);

// Payments
router.use('/payments', paymentsRouter);

// Collaboration
router.use('/collab', collabRouter);

module.exports = router;

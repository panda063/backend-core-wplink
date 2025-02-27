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
 * Controllers
 */
const writerController = require('../controllers/writer');

// Sub level Routers
const portfolioRouter = require('./creator-pm/portfolio');

/**
 * * These are the routes which are common to both PM and Creator
 */

/**
 * Submit for portfolio complete
 */

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

// Creator Portfolio endpoints
router.use('/portfolio', portfolioRouter);

module.exports = router;

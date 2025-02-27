const { celebrate, Joi } = require('celebrate');
Joi.objectId = require('joi-objectid')(Joi);
const router = require('express').Router();
const passport = require('passport');
const C = require('../lib/constants');
const c = require('./helper');

require('../config/passport');

const clientGamificationController = require('../controllers/clientGamification');

/**
 * @version 2.1
 */

router.post(
    '/v2/register',
    celebrate({
        body: Joi.object().keys({
            firstName: Joi.string().required(),
            // allow empty lastName
            lastName: Joi.string().allow('').default(''),
            email: Joi.string().email().required(),
            industry: Joi.string().required(),
            website: Joi.string().required(),
            company: Joi.string().required(),
            clientRole: Joi.string().valid('individual', 'employee').required(),
            refId: Joi.string().default(''),
            social: Joi.string().default(''),
        }),
    }),
    c((req) => {
        const data = req.body;
        return { ...data };
    }, clientGamificationController.addClientToWaitlist),
);
router.post(
    '/waitlist',
    celebrate({
        body: Joi.object().keys({
            email: Joi.string().email().required(),
            token: Joi.string().allow(null),
            social: Joi.string().allow(null),
        }),
    }),
    c((req) => {
        const { email, token, social } = req.body;
        return {
            email,
            token,
            social,
        };
    }, clientGamificationController.addToWishlist),
);

router.post(
    '/register',
    passport.authenticate('gamification', {
        session: false,
        failWithError: true,
    }),
    celebrate({
        body: Joi.object().keys({
            firstName: Joi.string().required(),
            lastName: Joi.string().required(),
            website: Joi.string().required(),
            company: Joi.string().required(),
            medium: Joi.string().valid(
                'email',
                'twitter',
                'facebook',
                'linkedin',
                'instagram',
                'google',
                'referral',
            ),
            city: Joi.string().required(),
            country: Joi.string().required(),
            lookingFor: Joi.string().valid('writer', 'designer'),
            industry: Joi.string().required(),
        }),
    }),
    c((req) => {
        const { user } = req;
        const {
            firstName,
            lastName,
            website,
            company,
            medium,
            city,
            country,
            lookingFor,
            industry,
        } = req.body;
        return {
            user,
            firstName,
            lastName,
            website,
            company,
            medium,
            city,
            country,
            lookingFor,
            industry,
        };
    }, clientGamificationController.registerUser),
);

router.post(
    '/verify',
    celebrate({
        body: Joi.object().keys({
            token: Joi.string().required(),
        }),
    }),
    c((req) => {
        const { token } = req.body;
        return { token };
    }, clientGamificationController.verify),
);

router.post(
    '/invite',
    passport.authenticate('gamification', {
        session: false,
        failWithError: true,
    }),
    celebrate({
        body: Joi.object().keys({
            emails: Joi.array().required(),
        }),
    }),
    c((req) => {
        const { user } = req;
        const { emails } = req.body;
        return { emails, id: user.id, name: user.n, ref: user.r, user };
    }, clientGamificationController.inviteViaEmails),
);

router.get(
    '/',
    passport.authenticate('gamification', {
        session: false,
        failWithError: true,
    }),
    c((req) => {
        const { user } = req;
        return { user };
    }, clientGamificationController.getGamificationData),
);

router.post(
    '/send-reset-link',
    celebrate({
        body: Joi.object().keys({
            email: Joi.string().required(),
        }),
    }),
    c((req) => {
        const { email } = req.body;
        return { email };
    }, clientGamificationController.sentResetPasswordLink),
);

// When Client clicks on Social Share Buttons
router.put(
    '/social-share',
    celebrate({
        body: Joi.object().keys({
            ref: Joi.string().required(),
            social: Joi.string()
                .valid('facebook', 'twitter', 'linkedin')
                .required(),
            status: Joi.string().valid('clicked', 'posted').required(),
        }),
    }),
    c((req) => {
        const { ref, social, status } = req.body;
        return { ref, social, status };
    }, clientGamificationController.setSocial),
);

module.exports = router;

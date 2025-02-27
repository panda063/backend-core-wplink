const { celebrate, Joi } = require('celebrate');
Joi.objectId = require('joi-objectid')(Joi);
const router = require('express').Router();
const passport = require('passport');
const C = require('../lib/constants');
const c = require('./helper');

require('../config/passport');

const gamificationController = require('../controllers/gamification');

router.post(
    '/wishlist',
    celebrate({
        body: Joi.object().keys({
            email: Joi.string().required(),
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
    }, gamificationController.addToWishlist),
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
            linkedIn: Joi.string().required(),
            country: Joi.string().required(),
            city: Joi.string().required(),
            creatorType: Joi.string().valid('writer', 'designer'), // was designation
            experience: Joi.string().valid('<1', '2-5', '5-10', '10+', ''),
            designation: Joi.string().required(), // was industry
            medium: Joi.string().valid(
                'email',
                'twitter',
                'facebook',
                'linkedin',
                'instagram',
                'google',
                'referral',
            ),
            password: Joi.string()
                .min(6)
                .max(16)
                .regex(/[ `!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~]/)
                .required(),
        }),
    }),
    c((req) => {
        const { user } = req;
        const {
            firstName,
            lastName,
            linkedIn,
            country,
            city,
            creatorType,
            experience,
            designation,
            password,
        } = req.body;
        return {
            user,
            firstName,
            lastName,
            linkedIn,
            country,
            city,
            creatorType,
            experience,
            designation,
            password,
        };
    }, gamificationController.registerUser),
);

router.post(
    '/login',
    celebrate({
        body: Joi.object().keys({
            email: Joi.string().required(),
            password: Joi.string().required(),
        }),
    }),
    c((req) => {
        const { email, password } = req.body;
        return { email, password };
    }, gamificationController.login),
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
    }, gamificationController.verify),
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
        return { emails, user, name: user.n.f, ref: user.r };
    }, gamificationController.inviteViaEmails),
);

router.post(
    '/action',
    celebrate({
        body: Joi.object().keys({
            action: Joi.string().valid(
                'GAURANTEED_PROJECT',
                'FAST_GROWTH',
                'BE_A_LEADER',
            ),
        }),
    }),
    passport.authenticate('gamification', {
        session: false,
        failWithError: true,
    }),
    c((req) => {
        const { user } = req;
        const { action } = req.body;
        return { user, action };
    }, gamificationController.usePerks),
);

router.get(
    '/',
    passport.authenticate('gamification', {
        session: false,
        failWithError: true,
    }),
    c((req) => {
        const { user } = req;
        return { id: user.id, user };
    }, gamificationController.getGamificationData),
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
    }, gamificationController.sentResetPasswordLink),
);

router.post(
    '/reset-password',
    celebrate({
        body: Joi.object().keys({
            password: Joi.string().required(),
            token: Joi.string().required(),
        }),
    }),
    c((req) => {
        const { password, token } = req.body;
        return { password, token };
    }, gamificationController.resetPassword),
);

router.get(
    '/mentors',
    celebrate({
        query: {
            page: Joi.number().required().min(1),
            interests: Joi.string().allow('', null),
        },
    }),
    c((req) => {
        // const { emails, type } = req.body;
        const { page = 1, limit = 8, interests } = req.query;
        return { page, limit, filter: interests };
    }, gamificationController.getMentors),
);

// Handle when survey taken by user
router.post(
    '/taken-survey',
    celebrate({
        body: Joi.object().keys({
            email: Joi.string().required(),
        }),
    }),
    c((req) => {
        const { email } = req.body;
        return { email };
    }, gamificationController.takenSurvey),
);

// Handle when user posts on social media

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
    }, gamificationController.setSocial),
);

router.post(
    '/add-mentor',
    celebrate({
        body: Joi.object().keys({
            fullName: Joi.string().required(),
            curJobTitleAndCompany: Joi.string().allow('', null),
            interests: Joi.string().allow('', null),
            linkedIn: Joi.string().allow('', null),
            img: Joi.string().allow('', null),
            email: Joi.string().required(),
            calendly: Joi.string().allow('', null),
            otherLang: Joi.string().allow('', null),
        }),
    }),
    c((req) => {
        const {
            fullName,
            curJobTitleAndCompany,
            interests,
            linkedIn,
            img,
            email,
            calendly,
            otherLang,
        } = req.body;
        return {
            fullName,
            curJobTitleAndCompany,
            interests,
            linkedIn,
            img,
            email,
            calendly,
            otherLang,
        };
    }, gamificationController.addMentor),
);

module.exports = router;

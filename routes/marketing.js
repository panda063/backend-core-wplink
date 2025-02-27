const router = require('express').Router();
const { celebrate, Joi } = require('celebrate');

const c = require('./helper');

const marketingControllers = require('../controllers/marketing');

router.post(
    '/register',
    celebrate({
        body: Joi.object().keys({
            token: Joi.string().allow(null, '').default(''),
            email: Joi.string().email().trim().required(),
            name: Joi.string().max(100).required(),
            role: Joi.string().max(100).required(),
            revenue: Joi.string().max(100).required(),
            directAccess: Joi.boolean().default(false),
        }),
    }),
    c((req) => {
        const { token, email, name, role, revenue, directAccess } = req.body;
        return {
            token,
            email,
            name,
            role,
            revenue,
            directAccess,
        };
    }, marketingControllers.registerUser),
);

router.post(
    '/get-referral-link',
    celebrate({
        body: Joi.object().keys({
            token: Joi.string().required(),
        }),
    }),
    c((req) => {
        const { token } = req.body;
        return {
            token,
        };
    }, marketingControllers.getReferralLink),
);

router.post(
    '/access-first-resource',
    celebrate({
        body: Joi.object().keys({
            token: Joi.string().required(),
        }),
    }),
    c((req) => {
        const { token } = req.body;
        return {
            token,
        };
    }, marketingControllers.accessedFirstResource),
);

module.exports = router;

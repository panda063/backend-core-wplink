/**
 * Dependencies
 */
const { celebrate, Joi, isCelebrate } = require('celebrate');
Joi.objectId = require('joi-objectid')(Joi);
const router = require('express').Router();

const c = require('../helper');

const paymentControllers = require('../../controllers/creator/payments');

// ! Deprecated soon. Use new APIs from the routes/payments which are common to both PM and Creator
router.post(
    '/onboard',
    c((req) => {
        const creator = req.user;
        return { creator };
    }, paymentControllers.accountOnboard),
);
// ! Deprecated soon. Use new APIs from the routes/payments which are common to both PM and Creator
router.post('/success', async (req, res) => {
    return res.json('return');
});
// ! Deprecated soon. Use new APIs from the routes/payments which are common to both PM and Creator
router.get(
    '/onboard-user/refresh',
    c((req) => {
        const creator = req.user;
        return {
            creator,
        };
    }, paymentControllers.generateRefreshUrl),
);
// ! Deprecated soon. Use new APIs from the routes/payments which are common to both PM and Creator
router.get(
    '/onboarding-state',
    c((req) => {
        const creator = req.user;
        return {
            creator,
        };
    }, paymentControllers.getAccountOnboardState),
);

module.exports = router;

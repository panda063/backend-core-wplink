// Manish added new file
const { celebrate, Joi, isCelebrate } = require('celebrate');
Joi.objectId = require('joi-objectid')(Joi);
const router = require('express').Router();
const c = require('./helper');
const C = require('./../lib/constants');
const portfolioV3Controllers = require('./../controllers/creator/portfolio-v3.1');

router.put(
    '/update-state',
    celebrate({
        body: Joi.object().keys({
            type: Joi.string()
                .valid(
                    'onboardState',
                    'firstLogin',
                    'analytics',
                    'inbox',
                    'dnd',
                )
                .default('onboardState'),
            state: Joi.string()
                .valid(
                    C.V3_CREATOR_ONBOARDING_STATES.STEP_DONE,
                    'start',
                    'not_done',
                )
                .required(),
        }),
    }),
    c((req) => {
        const user = req.user;
        const { state, type } = req.body;
        return { user, state, type };
    }, portfolioV3Controllers.updateOnboardState),
);

module.exports = router;

const { celebrate, Joi } = require('celebrate');
Joi.objectId = require('joi-objectid')(Joi);
const router = require('express').Router();
const passport = require('passport');
const C = require('../lib/constants');
const c = require('./helper');
require('../config/passport');

const gamificationAdminController = require('../controllers/gamificationAdmin');
const { getFiltersForGamification } = require('../utils/gamificationUtils');

/*
// TODO : Allow special access for admin route
router.post(
  "/register",
  celebrate({
    body: Joi.object().keys({
      email: Joi.string().required(),
      password: Joi.string().required(),
    }),
  }),
  c((req) => {
    const { email, password } = req.body;
    return { email, password };
  }, gamificationAdminController.register)
);
*/
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
    }, gamificationAdminController.login),
);

// ************Gamification Routes***************

router.post(
    '/user-list',
    passport.authenticate('gamificationAdmin', {
        session: false,
        failWithError: true,
    }),
    celebrate({
        body: Joi.object().keys({
            userType: Joi.string()
                .allow('CREATOR', 'BUSINESS')
                .default('CREATOR'),
            onPlan: Joi.string()
                .allow(
                    C.GAMIFICATION_PLAN_FILTERS.NONE,
                    C.GAMIFICATION_PLAN_FILTERS.PERK1,
                    C.GAMIFICATION_PLAN_FILTERS.PERK2,
                    C.GAMIFICATION_PLAN_FILTERS.PERK3,
                )
                .allow(''),
            onTime: Joi.string()
                .allow(
                    C.GAMIFICATION_TIMELINE_FILTERS.ACTIVE,
                    C.GAMIFICATION_TIMELINE_FILTERS.INACTIVE,
                )
                .allow(''),
            userAction: Joi.string()
                .allow(
                    C.GAMIFICATION_USER_ACTION_FILTERS.VERIFIED,
                    // C.GAMIFICATION_USER_ACTION_FILTERS.SOCIAL,
                    C.GAMIFICATION_USER_ACTION_FILTERS.MAILED,
                    C.GAMIFICATION_USER_ACTION_FILTERS.SURVEY,
                )
                .allow(''),
            userActionStatus: Joi.boolean(),
            perks: Joi.number().greater(-1),
            sortBy: Joi.string()
                .allow(
                    'PERKS',
                    'INVITATION',
                    'SUCCESS_INVITATION',
                    'LAST_ACTIVE',
                )
                .allow(''),
            sortDirection: Joi.number().allow(-1, 1),
        }),
    }),
    c((req) => {
        const {
            onPlan,
            onTime,
            userAction,
            userActionStatus,
            perks,
            sortBy,
            sortDirection,
            userType,
        } = req.body;
        const filters =
            userType === 'BUSINESS'
                ? {}
                : getFiltersForGamification(
                      onPlan,
                      onTime,
                      userAction,
                      userActionStatus,
                      perks,
                  );
        return { filter: filters, sortBy, sortDirection, userType };
    }, gamificationAdminController.getList),
);

router.post(
    '/takenSurvey',
    passport.authenticate('gamificationAdmin', {
        session: false,
        failWithError: true,
    }),
    celebrate({
        body: Joi.object().keys({
            emails: Joi.array().required(),
        }),
    }),
    c((req) => {
        const { emails } = req.body;
        return { emails };
    }, gamificationAdminController.setTakeSurvey),
);

router.post(
    '/addPerks',
    passport.authenticate('gamificationAdmin', {
        session: false,
        failWithError: true,
    }),
    celebrate({
        body: Joi.object().keys({
            emails: Joi.array().required(),
            perks: Joi.number().required(),
        }),
    }),
    c((req) => {
        const { emails, perks } = req.body;
        return { emails, perks };
    }, gamificationAdminController.addPerks),
);

router.post(
    '/sentMail',
    passport.authenticate('gamificationAdmin', {
        session: false,
        failWithError: true,
    }),
    celebrate({
        body: Joi.object().keys({
            emails: Joi.array().required(),
            type: Joi.string().allow('REGISTER', 'PLAN1', 'PLAN2', 'PLAN3'),
        }),
    }),
    c((req) => {
        const { emails, type } = req.body;
        return { emails, type };
    }, gamificationAdminController.sendMailToMultipleUser),
);

router.post(
    '/add-mentors',
    passport.authenticate('gamificationAdmin', {
        session: false,
        failWithError: true,
    }),
    // celebrate({
    // 	body: Joi.object().keys({}),
    // }),
    c((req) => {
        // const { emails, type } = req.body;
        return {};
    }, gamificationAdminController.addMentorsFromSheet),
);

router.post(
    '/check-survey',
    passport.authenticate('gamificationAdmin', {
        session: false,
        failWithError: true,
    }),
    // celebrate({
    // 	body: Joi.object().keys({}),
    // }),
    c((req) => {
        // const { emails, type } = req.body;
        return {};
    }, gamificationAdminController.setTakeSurvey),
);

module.exports = router;

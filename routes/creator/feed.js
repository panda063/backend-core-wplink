/**
 * Module Dependencies
 */
const _ = require('lodash');
const { celebrate, Joi, isCelebrate } = require('celebrate');
Joi.objectId = require('joi-objectid')(Joi);
const router = require('express').Router();
const {
    BadRequest,
    InternalServerError,
    NotAuthorized,
} = require('../../lib/errors');

const c = require('../helper');
const C = require('../../lib/constants');

/**
 * Controllers
 */

const feedController = require('../../controllers/creator/feed');

// Routes

router.post(
    '/studio',
    celebrate({
        body: Joi.object().keys({
            studioType: Joi.string()
                .valid('copywriting', 'design')
                .default('copywriting'),
            activeMembers: Joi.string().valid('<5').default('<5'),
            studioProjects: Joi.number().valid(1, -1).default(-1),
            pmRating: Joi.number().min(0).max(5).default(0),
            city: Joi.string().trim().allow('').default(''),
            studioName: Joi.string().allow('').default(''),
            page: Joi.number().min(1).default(1),
        }),
    }),
    c((req) => {
        const creator = req.user;
        const filters = req.body;
        return { creator, filters };
    }, feedController.studioFeed),
);

router.post(
    '/studios-connected',
    c((req) => {
        const creator = req.user;
        return { creator };
    }, feedController.getConnectedStudios),
);

module.exports = router;

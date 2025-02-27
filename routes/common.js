/**
 * Module Dependencies
 */

const _ = require('lodash');
const { celebrate, Joi } = require('celebrate');
Joi.objectId = require('joi-objectid')(Joi);
const router = require('express').Router();
const passport = require('passport');
require('../config/passport');
const { passportAuthenticate } = require('../middlewares/authorization');
const c = require('./helper');
const CONSTANTS = require('../lib/constants');

// Controllers
const commonController = require('../controllers/common');
const paymentControllers = require('../controllers/payments');

/**
 * Common Portfolio routes
 */

/**
 * Common Endpoints to both authenticated and non-authenticated Users to fetch portfolio
 */

// TODO: What about banned, inactive and new users in this case?
const authChecker = [passportAuthenticate(passport, true)];

/**
 * ! Creator Portfolio fetch routes
 * ! @version 2
 */

// Creator Portfolio General Info
router.get(
    '/portfolio/generalInfo/:pn',
    celebrate({
        params: Joi.object().keys({
            pn: Joi.string().required(),
        }),
    }),
    authChecker,
    c((req) => {
        let user = req.user;
        const { pn } = req.params;
        return { user, pn };
    }, commonController.portfolioGeneralInfo),
);

// Get portfolio projects (cards or longform)
_.forEach([CONSTANTS.MODELS.CARDS, CONSTANTS.MODELS.LONG_FORM], (ptype) => {
    router.post(
        `/portfolio/${ptype}/:pn`,
        celebrate({
            params: Joi.object().keys({
                pn: Joi.string().required(),
            }),
            body: Joi.object().keys({
                page: Joi.number().min(1).default(1),
            }),
        }),
        authChecker,
        c((req) => {
            let user = req.user;
            const { page } = req.body;
            const { pn } = req.params;
            return { user, page, ptype, pn };
        }, commonController.getPortfolioProjects),
    );
});

// Get projects of all type
router.post(
    '/portfolio/projects/:pn',
    celebrate({
        params: Joi.object().keys({
            pn: Joi.string().required(),
        }),
        body: Joi.object().keys({
            page: Joi.number().min(1).default(1),
        }),
    }),
    authChecker,
    c((req) => {
        const user = req.user;
        const { page } = req.body;
        const { pn } = req.params;
        return { user, page, pn, allTypes: true };
    }, commonController.getPortfolioProjects),
);

// Get Project from public url
router.get(
    '/portfolio/public/project/:pul',
    celebrate({
        params: Joi.object().keys({
            pul: Joi.string().required(),
        }),
    }),
    authChecker,
    c((req) => {
        const { pul } = req.params;
        const user = req.user;
        return { user, pul };
    }, commonController.getProjectFromUrl),
);

/**
 * * v3.1 Portfolio Routes
 * @version 3.1
 */

/**
 * @apiName Authentication check
 */

router.get(
    '/auth-check',
    authChecker,
    c((req) => {
        const user = req.user;
        return { user };
    }, commonController.userAuthCheck),
);

/**
 * @apiName Get in touch with creator for a service
 */

router.post(
    '/v3.1/portfolio/get-in-touch/:sid',
    celebrate({
        params: Joi.object().keys({
            sid: Joi.objectId().required(),
        }),
        body: Joi.object().keys({
            email: Joi.string().regex(CONSTANTS.emailRegex).default(''),
            calendlyScheduled: Joi.boolean().default(false),
            formFields: Joi.object()
                .keys({
                    name: Joi.string().trim().allow('').default(''),
                    contact: Joi.string().trim().allow('').default(''),
                    company: Joi.string().trim().allow('').default(''),
                    projectType: Joi.string().trim().allow('').default(''),
                    duration: Joi.string().trim().allow('').default(''),
                    budget: Joi.string().trim().allow('').default(''),
                    description: Joi.string().trim().allow('').default(''),
                })
                .default({
                    name: '',
                    contact: '',
                    company: '',
                    projectType: '',
                    duration: '',
                    description: '',
                }),
        }),
    }),
    authChecker,
    c((req) => {
        const { email, calendlyScheduled, formFields } = req.body;
        const { sid } = req.params;
        const user = req.user;
        return { email, sid, user, calendlyScheduled, formFields };
    }, commonController.getInTouchCreator),
);

router.post(
    '/v3.1/portfolio/get-in-touch/details/:mid',
    celebrate({
        params: Joi.object().keys({
            mid: Joi.objectId().required(),
        }),
        body: Joi.object().keys({
            name: Joi.string().trim().allow('').default(''),
            contact: Joi.string().trim().allow('').default(''),
            company: Joi.string().trim().allow('').default(''),
            projectType: Joi.string().trim().allow('').default(''),
            duration: Joi.string().trim().allow('').default(''),
            budget: Joi.string().trim().allow('').default(''),
            description: Joi.string().trim().allow('').default(''),
        }),
    }),
    c((req) => {
        const mid = req.params.mid;
        const data = req.body;
        return { mid, data };
    }, commonController.addMoreDetails),
);

/**
 * @apiName Instant pay for service
 */

router.post(
    '/v3.1/portfolio/service/pay/:sid',
    celebrate({
        params: Joi.object().keys({
            sid: Joi.objectId().required(),
        }),
        body: Joi.object().keys({
            email: Joi.string()
                .regex(CONSTANTS.emailRegex)
                .allow('')
                .default(''),
            name: Joi.string().trim().allow('').default(''),
            clientCardCountry: Joi.string().default(''),
            message: Joi.string().allow('').default(''),
            formFields: Joi.object()
                .keys({
                    name: Joi.string().trim().allow('').default(''),
                    contact: Joi.string().trim().allow('').default(''),
                    company: Joi.string().trim().allow('').default(''),
                    projectType: Joi.string().trim().allow('').default(''),
                    duration: Joi.string().trim().allow('').default(''),
                    budget: Joi.string().trim().allow('').default(''),
                    description: Joi.string().trim().allow('').default(''),
                })
                .default({
                    name: '',
                    contact: '',
                    company: '',
                    projectType: '',
                    duration: '',
                    description: '',
                }),
        }),
    }),
    authChecker,
    c((req) => {
        const { email, name, clientCardCountry, message, formFields } =
            req.body;
        const { sid } = req.params;
        const user = req.user;
        return {
            email,
            name,
            sid,
            clientCardCountry,
            user,
            message,
            formFields,
        };
    }, commonController.payService),
);

/**
 * @apiName Get penname from domain
 */

router.post(
    '/v3.1/penname-from-domain',
    celebrate({
        body: Joi.object().keys({
            domain: Joi.string().min(1).max(50).required(),
        }),
    }),
    c((req) => {
        const { domain } = req.body;
        return { domain };
    }, commonController.getPennameFromDomain),
);

/**
 * @apiName Check if domain exits
 */

router.get(
    '/v3.1/check-domain/:domain',
    celebrate({
        params: Joi.object().keys({
            domain: Joi.string().min(1).max(50).required(),
        }),
    }),
    c((req) => {
        const { domain } = req.params;
        return { domain };
    }, commonController.checkIfDomainExits),
);

/**
 * @apiName Fetch portfolio with blocks
 */

router.get(
    '/v3.1/check-domain/:domain',
    celebrate({
        params: Joi.object().keys({
            domain: Joi.string().min(1).max(50).required(),
        }),
    }),
    c((req) => {
        const { domain } = req.params;
        return { domain };
    }, commonController.checkIfDomainExits),
);

/**
 * @apiName Fetch portfolio with blocks
 */

router.post(
    '/v3.1/portfolio/:pn',
    celebrate({
        params: Joi.object().keys({
            pn: Joi.string().required(),
        }),
        body: Joi.object().keys({
            pageIds: Joi.array()
                .min(1)
                .items(Joi.objectId())
                .allow(null)
                .error(
                    new Joi.ValidationError(
                        'pageIds should be null or if it is an array atleast one id should be in it',
                    ),
                ),
            fetchPublic: Joi.boolean().default(false),
            fetchCommunity: Joi.boolean().default(false),
            // Below parameters provided if we want to fetch a private page
            urlName: Joi.string().allow('', null),
        }),
    }),
    authChecker,
    c((req) => {
        let user = req.user;
        const { pn } = req.params;
        const { pageIds, fetchPublic, fetchCommunity, urlName } = req.body;
        return { user, pn, pageIds, fetchPublic, fetchCommunity, urlName };
    }, commonController.fetchPortfolio),
);

/**
 * @apiName Fetch portfolio. Fetch single page with blocks only
 * @version 3.2
 */

router.post(
    '/v3.2/portfolio/:pn',
    celebrate({
        params: Joi.object().keys({
            pn: Joi.string().required(),
        }),
        body: Joi.object().keys({
            fetchPublic: Joi.boolean().default(false),
            // urlName of specific page to fetch
            // if empty/null fetch first page
            urlName: Joi.string().allow('', null),
        }),
    }),
    authChecker,
    c((req) => {
        let user = req.user;
        const { pn } = req.params;
        const { fetchPublic, urlName } = req.body;
        return { user, pn, fetchPublic, urlName };
    }, commonController.fetchPortfolioV2),
);

// @apiName Get all testimonials
// version v3.1

router.post(
    '/v3.1/portfolio/:pn/testimonial',
    celebrate({
        params: Joi.object().keys({
            pn: Joi.string().required(),
        }),
        body: {
            pageId: Joi.objectId().required(),
        },
    }),
    authChecker,
    c((req) => {
        const pn = req.params.pn;
        const user = req.user;
        const { pageId } = req.body;
        return { user, pn, pageId };
    }, commonController.getPortfolioTestimonials),
);

/**
 * @apiName Fetch all services
 */

router.post(
    '/v3.1/portfolio/:pn/services',
    celebrate({
        params: Joi.object().keys({
            pn: Joi.string().required(),
        }),
        body: {
            pageId: Joi.objectId().required(),
        },
    }),
    authChecker,
    c((req) => {
        const pn = req.params.pn;
        const user = req.user;
        const { pageId } = req.body;
        return { user, pn, pageId };
    }, commonController.getPortfolioServices),
);

/**
 * @apiName Get all experiences
 * @version 3.1
 */

router.get(
    '/v3.1/portfolio/:pn/experience',
    celebrate({
        params: Joi.object().keys({
            pn: Joi.string().required(),
        }),
    }),
    authChecker,
    c((req) => {
        const pn = req.params.pn;
        const user = req.user;
        return { user, pn };
    }, commonController.getPortfolioExperiences),
);

/**
 * @apiName Fetch Single block
 * @version 3.1
 */

router.get(
    '/v3.1/block/:pul',
    celebrate({
        params: Joi.object().keys({
            pul: Joi.string().required(),
        }),
    }),
    authChecker,
    c((req) => {
        const pul = req.params.pul;
        const user = req.user;
        return { user, pul };
    }, commonController.getSingleBlock),
);

/**
 * @apiName Fetch Experience Block
 * @version 3.1
 */

router.get(
    '/v3.1/block/experience/:id',
    celebrate({
        params: Joi.object().keys({
            id: Joi.string().required(),
        }),
    }),
    authChecker,
    c((req) => {
        const id = req.params.id;
        const user = req.user;
        return { user, id };
    }, commonController.getSingleBlock),
);

/**
 * @apiName Fetch Testimonial Block
 * @version 3.1
 */

router.get(
    '/v3.1/block/testimonial/:id',
    celebrate({
        params: Joi.object().keys({
            id: Joi.string().required(),
        }),
    }),
    authChecker,
    c((req) => {
        const id = req.params.id;
        const user = req.user;
        return { user, id };
    }, commonController.getSingleBlock),
);

/**
 * @apiName Fetch Single block publicUrl
 * @version 3.1
 */

router.get(
    '/v3.1/block-url/:id',
    celebrate({
        params: Joi.object().keys({
            id: Joi.objectId().required(),
        }),
    }),

    c((req) => {
        const id = req.params.id;
        const user = req.user;
        return { user, id };
    }, commonController.getBlockUrl),
);

/**
 * @apiName Fetch Invoice
 * @version 3.1
 */

router.get(
    '/v3.1/fetch-invoice/:id',
    celebrate({
        params: Joi.object().keys({
            id: Joi.objectId().required(),
        }),
    }),
    c((req) => {
        const { id } = req.params;
        return {
            id,
        };
    }, commonController.fetchInvoice),
);

/**
 * @version 3.1
 * @description Pay Invoice endpoints using stripe and razorpay
 */

// Stripe Pay Invoice
router.post(
    '/stripe/pay-invoice',
    celebrate({
        body: Joi.object().keys({
            invoiceId: Joi.objectId().required(),
            clientCardCountry: Joi.string().required(),
        }),
    }),
    c((req) => {
        const { invoiceId, clientCardCountry } = req.body;
        return {
            invoiceId,
            clientCardCountry,
        };
    }, paymentControllers.payInvoiceStripe),
);

// Razorpay Pay Invoice
router.post(
    '/rp/pay-invoice',
    celebrate({
        body: Joi.object().keys({
            invoiceId: Joi.objectId().required(),
        }),
    }),
    c((req) => {
        const { invoiceId } = req.body;
        return { invoiceId };
    }, paymentControllers.payInvoiceRazorpay),
);

/**
 * * Studio Portfolio Fetch Routes
 * TODO: Updates needed
 */

router.get(
    '/studio/portfolio/generalInfo/:stid',
    celebrate({
        params: Joi.object().keys({
            stid: Joi.string().required(),
        }),
    }),
    authChecker,
    c((req) => {
        let user = req.user;
        const { stid } = req.params;
        return { user, stid };
    }, commonController.studioGeneralInfo),
);

// Get studio portfolio projects (cards or longform)
_.forEach([CONSTANTS.MODELS.CARDS, CONSTANTS.MODELS.LONG_FORM], (ptype) => {
    router.post(
        `/studio/portfolio/${ptype}/:stid`,
        celebrate({
            params: Joi.object().keys({
                stid: Joi.string().required(),
            }),
            body: Joi.object().keys({
                imported: Joi.boolean().default(false),
                page: Joi.number().min(1).default(1),
            }),
        }),
        authChecker,
        c((req) => {
            let user = req.user;
            const { page, imported } = req.body;
            const { stid } = req.params;
            return { user, page, ptype, stid, imported };
        }, commonController.getStudioProjects),
    );
});

// Get first page of all projects
router.post(
    `/studio/portfolio/projects-first/:stid`,
    celebrate({
        params: Joi.object().keys({
            stid: Joi.string().required(),
        }),
    }),
    authChecker,
    c((req) => {
        let user = req.user;
        const { stid } = req.params;
        return { user, stid };
    }, commonController.getAllStudioProjects),
);

module.exports = router;

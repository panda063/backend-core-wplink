/**
 * Module Dependencies
 */
const _ = require('lodash');
const { celebrate, Joi, isCelebrate } = require('celebrate');
Joi.objectId = require('joi-objectid')(Joi);
const router = require('express').Router();
const c = require('../helper');
const C = require('../../lib/constants');
const moment = require('moment');

// Controllers
const creatorPMControllers = require('../../controllers/creator-pm/portfolio');

// Middlewares
const { addProject } = require('../middlewares/writerMiddlewares');

// Regex pattern for a valid email address
const emailRegex = /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/;

/**
 * ****************Portfolio Project Endpoints*******************
 * @version3
 */

// * Common Routes for both PM and Creator
// * Creator project controllers are reused for these APIs as well
// * Only difference is that, in PM projects studioProject field is true and cid = pm user id

// **********  Short Form Project *********************

// Add Short Form Card
router.post(
    '/project/short-form',
    celebrate({
        body: Joi.object().keys({
            title: Joi.string()
                .min(1)
                .max(C.SHORT_FORM_TITLE)
                .trim()
                .required(),
            description: Joi.string()
                .max(C.SHORT_FORM_DESCRIPTION)
                .allow('', null),
            // primaryTag: Joi.string().required(),
            category: Joi.array().items(Joi.string()).min(1).max(3).required(),
            tone: Joi.string()
                .valid(...Object.values(C.TONES))
                .default(''),
            industry: Joi.string().default(''),
            additionalTags: Joi.array()
                .items(Joi.string().min(1))
                .max(10)
                .allow(null),
            collaboraters: Joi.array().items(Joi.objectId()).default([]),
            txtCards: Joi.array()
                .items(Joi.string().min(1).max(C.SHORT_FORM_CARD))
                .max(5)
                .allow(null),
        }),
    }),
    c((req) => {
        const creator = req.user;
        const cardData = req.body;
        return { creator, cardData };
    }, creatorPMControllers.addShortFormCard),
);
// Upate Short Form
router.put(
    '/project/short-form/:sid',
    celebrate({
        params: Joi.object().keys({
            sid: Joi.objectId().required(),
        }),
        body: Joi.object().keys({
            title: Joi.string()
                .min(1)
                .max(C.SHORT_FORM_TITLE)
                .trim()
                .required(),
            description: Joi.string()
                .max(C.SHORT_FORM_DESCRIPTION)
                .allow('', null),
            // primaryTag: Joi.string().required(),
            category: Joi.array().items(Joi.string()).min(1).max(3).required(),
            tone: Joi.string()
                .valid(...Object.values(C.TONES))
                .default(''),
            industry: Joi.string().default(''),
            additionalTags: Joi.array()
                .items(Joi.string().min(1))
                .max(10)
                .allow(null),
            collaboraters: Joi.array().items(Joi.objectId()).default([]),
            txtCards: Joi.array()
                .items(Joi.string().min(1).max(C.SHORT_FORM_CARD))
                .max(5)
                .allow(null),
        }),
    }),
    c((req) => {
        const creator = req.user;
        const cardData = req.body;
        const sid = req.params.sid;
        return { creator, cardData, sid };
    }, creatorPMControllers.updateShortFormCard),
);
// **************** Design Projects *******************

router.post(
    '/project/design',
    celebrate({
        body: Joi.object().keys({
            title: Joi.string().min(1).trim().max(C.TITLE).required(),
            description: Joi.string().max(C.DESCRIPTION).trim().default(''),
            // primaryTag: Joi.string().required(),
            category: Joi.array().items(Joi.string()).min(1).max(3).required(),
            style: Joi.string().default(''),
            industry: Joi.string().default(''),
            additionalTags: Joi.array()
                .items(Joi.string().min(1))
                .max(10)
                .default([]),
            collaboraters: Joi.array().items(Joi.objectId()).default([]),
            fileIds: Joi.array().items(Joi.objectId()).min(1).max(5).required(),
        }),
    }),
    c((req) => {
        const creator = req.user;
        const cardData = req.body;
        return { creator, cardData };
    }, creatorPMControllers.addDesignProject),
);

router.put(
    '/project/design/:pid',
    celebrate({
        params: Joi.object().keys({
            pid: Joi.objectId().required(),
        }),
        body: Joi.object().keys({
            title: Joi.string().min(1).trim().max(C.TITLE).required(),
            description: Joi.string().max(C.DESCRIPTION).trim().default(''),
            // primaryTag: Joi.string().required(),
            category: Joi.array().items(Joi.string()).min(1).max(3).required(),
            style: Joi.string().default(''),
            industry: Joi.string().default(''),
            additionalTags: Joi.array()
                .items(Joi.string().min(1))
                .max(10)
                .default([]),
            collaboraters: Joi.array().items(Joi.objectId()).default([]),
            fileIds: Joi.array()
                .items(Joi.objectId())
                .min(1)
                .max(C.DESIGN_MAX_CARDS)
                .required(),
        }),
    }),
    c((req) => {
        const creator = req.user;
        const cardData = req.body;
        const { pid } = req.params;
        return { creator, cardData, pid };
    }, creatorPMControllers.updateDesignProject),
);

// ********************* Long Form Endpoints ********************

router.post(
    '/project/long-form',
    c((req) => {
        const creator = req.user;
        return { creator };
    }, creatorPMControllers.initializeLongForm),
);

// Save Long Form
router.put(
    '/project/long-form/save/:pid',
    celebrate({
        params: Joi.object().keys({
            pid: Joi.objectId().required(),
        }),
        body: Joi.object().keys({
            content: Joi.string().required().allow(''),
            previewText: Joi.string().trim().allow('').default(''),
            publish: Joi.boolean().required(),
            title: Joi.string().min(1).trim().required(),
            description: Joi.string().allow('', null),
            // primaryTag: Joi.string().required(),
            category: Joi.array().items(Joi.string()).min(1).max(3).required(),
            tone: Joi.string()
                .valid(...Object.values(C.TONES))
                .default(''),
            industry: Joi.string().default(''),
            additionalTags: Joi.array()
                .items(Joi.string().min(1))
                .max(10)
                .allow(null),
            collaboraters: Joi.array().items(Joi.objectId()).default([]),
        }),
    }),
    c((req) => {
        const creator = req.user;
        const { pid } = req.params;
        const data = req.body;
        return { pid, creator, data };
    }, creatorPMControllers.saveLongForm),
);

router.post(
    '/project/long-form/image/:pid',
    celebrate({
        params: Joi.object().keys({
            pid: Joi.objectId().required(),
        }),
        body: Joi.object().keys({
            fileIds: Joi.array().items(Joi.objectId()).min(1).max(1).required(),
        }),
    }),
    c((req) => {
        const creator = req.user;
        const { fileIds } = req.body;
        const { pid } = req.params;
        return { creator, fileIds, pid };
    }, creatorPMControllers.addImageToLongForm),
);

router.post(
    '/project/long-form/import',
    celebrate({
        body: Joi.object().keys({
            targetUrl: Joi.string().uri().required(),
        }),
    }),
    c((req) => {
        const creator = req.user;
        const { targetUrl } = req.body;
        return { creator, targetUrl };
    }, creatorPMControllers.importArticle),
);

router.get(
    '/project/long-form/data/:pid',
    celebrate({
        params: Joi.object().keys({
            pid: Joi.objectId().required(),
        }),
    }),
    c((req) => {
        const creator = req.user;
        const pid = req.params.pid;
        return { creator, pid };
    }, creatorPMControllers.getFileData),
);

/**
 * Project Common
 */

// Remove Images from project
// Design and Long Form
// TODO: The old API for for design is /project/design/:pid. Update this on FE
_.forEach(['long-form', 'design'], (projectSub) => {
    router.delete(
        `/project/${projectSub}/image/:pid`,
        celebrate({
            params: Joi.object().keys({
                pid: Joi.objectId().required(),
            }),
            body: Joi.object().keys({
                imageIds: Joi.array().items(Joi.objectId()).required(),
            }),
        }),
        c((req) => {
            const creator = req.user;
            const pid = req.params.pid;
            const { imageIds } = req.body;
            return {
                creator,
                pid,
                imageIds,
                ptype:
                    projectSub == 'long-form'
                        ? C.MODELS.LONG_FORM
                        : C.MODELS.CARDS,
            };
        }, creatorPMControllers.removeImagesFromProject),
    );
});

// Remove Project
router.delete(
    '/project/delete/:pid',
    celebrate({
        params: Joi.object().keys({
            pid: Joi.objectId().required(),
        }),
    }),
    c((req) => {
        const creator = req.user;
        const { pid } = req.params;
        return { creator, pid };
    }, creatorPMControllers.removeProject),
);

// Get Project from project Id
router.get(
    '/project/:pid',
    celebrate({
        params: Joi.object().keys({
            pid: Joi.objectId().required(),
        }),
    }),
    c((req) => {
        let creator = req.user;
        const { pid } = req.params;
        return { creator, pid };
    }, creatorPMControllers.getSpecificProject),
);

/**
 * ********** Portfolio Testimonial endpoints ***********
 * * Common for both PM and Creator
 */

router.post(
    '/testimonials/request-via-email',
    celebrate({
        body: Joi.object().keys({
            email: Joi.string().regex(emailRegex).required(),
            reqMessage: Joi.string().min(1).max(C.REQMESSAGE).trim().required(),
        }),
    }),
    c((req) => {
        const creator = req.user;
        const { email, reqMessage } = req.body;
        return { creator, email, reqMessage };
    }, creatorPMControllers.testimonialViaEmail),
);

router.put(
    '/testimonials/change-visibility/:tid',
    celebrate({
        params: Joi.object().keys({
            tid: Joi.objectId().required(),
        }),
        body: Joi.object().keys({
            isPublic: Joi.boolean().required(),
            isBookmarked: Joi.when('isPublic', {
                is: false,
                then: Joi.boolean().valid(false),
                otherwise: Joi.boolean().required(),
            }),
        }),
    }),
    c((req) => {
        const creator = req.user;
        const updatedStatus = req.body;
        const { tid } = req.params;
        return { creator, updatedStatus, tid };
    }, creatorPMControllers.changeTestimonialVisibility),
);
/**
 * @apiName Add brand logo to portfolio
 */
router.post(
    '/logo-testimonial',
    celebrate({
        body: Joi.object().keys({
            company: Joi.string().trim().required(),
            fileId: Joi.objectId().default(''),
            logo: Joi.string().uri().default(''),
        }),
    }),
    c((req) => {
        const creator = req.user;
        const { company, fileId } = req.body;
        return { creator, company, fileId, logo };
    }, creatorPMControllers.addBrandLogo),
);

/**
 * @apiName Delete brand logo from db and s3
 */
router.delete(
    '/testimonial/:testimonialId',
    celebrate({
        params: Joi.object().keys({
            testimonialId: Joi.objectId().required(),
        }),
    }),
    c((req) => {
        const creator = req.user;
        const testimonialId = req.params.testimonialId;
        return { creator, testimonialId };
    }, creatorPMControllers.deleteTestimonial),
);

module.exports = router;

/**
 * Module Dependencies
 */
const _ = require('lodash');
const { celebrate, Joi, isCelebrate } = require('celebrate');
Joi.objectId = require('joi-objectid')(Joi);
const router = require('express').Router();
const c = require('../helper');
const CONSTANTS = require('../../lib/constants');

/**
 * Controlllers
 */

const writerController = require('../../controllers/creator/portfolio');
/**
 * Middlewares
 */

const {
    createNewExp,
    addExpErrorHandler,
    attachBrandLogo,
    addBrandLogoErrorHandler,
    attachExp,
    createEmptyProject,
    addDesignErrorHandler,
    addProject,
    uploadImagesMiddlewareSetup,
    updateDesignErrorHandler,
} = require('../middlewares/writerMiddlewares');

/**
 * External Service Dependencies
 */
const {
    portfolioImgUpload: portfolioImgUploadService,
} = require('../../services/file-upload');

const {
    upload,
    miscUpload: { experienceLogoUpload, brandLogoUpload },
} = require('../../services/file-upload-service');

/**
 * Creator Portfolio Endpoints
 * @version2
 */
// Regex pattern for a valid email address
const emailRegex = /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/;

// Edit personal Info
router.put(
    '/personalinfo',
    celebrate({
        body: Joi.object().keys({
            firstName: Joi.string().min(1).required(),
            lastName: Joi.string().allow('').default(''),
            // ! Temporarily disabled
            // country: Joi.string().min(1).trim().required(),
            city: Joi.string().trim().allow('', null),
            professionalDesignation: Joi.string()
                .max(200)
                .trim()
                .allow('', null),
            skills: Joi.array().items(Joi.string().min(1)).allow(null),
            bio: Joi.string().trim().max(500).default(''),
        }),
    }),
    c((req) => {
        const creator = req.user;
        const personalInfo = req.body;
        return {
            creator,
            personalInfo,
        };
    }, writerController.putPortfolioPersonalInfo),
);

// Edit Social Info
router.put(
    '/socialInfo',
    celebrate({
        body: Joi.object().keys({
            linkedin: Joi.string().uri().trim().allow('', null),
            instagram: Joi.string().uri().trim().allow('', null),
            twitter: Joi.string().uri().trim().allow('', null),
            medium: Joi.string().uri().trim().allow('', null),
            dribbble: Joi.string().uri().trim().allow('', null),
        }),
    }),
    c((req) => {
        const creator = req.user;
        const socialInfo = req.body;
        return {
            creator,
            socialInfo,
        };
    }, writerController.putPortfolioSocialInfo),
);

// ! Deprecated soon. Use new API in user APIs
router.put(
    '/image',
    portfolioImgUploadService.single('file'),
    c((req) => {
        const user = req.user;
        const { file } = req;
        return { user, file };
    }, writerController.uploadPortfolioImg),
);

// ! Deprecated soon. Use new API in user APIs
router.delete(
    '/image',
    c((req) => {
        const user = req.user;
        return { user };
    }, writerController.removePortfolioImage),
);

/**
 * Portfolio Professional Info Endpoints
 * @version2
 */
// Add Experience
router.post(
    '/professionalinfo',
    createNewExp,
    experienceLogoUpload.single('file'),
    celebrate({
        body: Joi.object().keys({
            title: Joi.string().trim().max(100).required(), // designation
            organization: Joi.string().trim().required(), // org or porject name
            isWorkingHere: Joi.boolean().default(false),
            start: Joi.date().required(),
            end: Joi.when('isWorkingHere', {
                is: true,
                then: Joi.date().valid('', null),
                otherwise: Joi.date().required(),
            }),
            logo: Joi.string().uri().default(''),
            categories: Joi.array().items(Joi.string().min(1)).allow(null),
            description: Joi.string().allow(null, ''),
            fileId: Joi.objectId().allow(null, ''),
        }),
    }),
    c((req) => {
        const creator = req.user;
        const professionalInfo = req.body;
        const exp = req.exp;
        const file = req.file;
        return { creator, professionalInfo, exp, file };
    }, writerController.addUpdateExperience),
    addExpErrorHandler,
);

// Update Experience
// To change logo
router.put(
    '/professionalinfo/:expId',
    celebrate({
        params: Joi.object().keys({
            expId: Joi.objectId().required(),
        }),
    }),
    attachExp,
    experienceLogoUpload.single('file'),
    celebrate({
        body: Joi.object().keys({
            title: Joi.string().trim().max(100).required(), // designation
            organization: Joi.string().trim().required(), // org or porject name
            isWorkingHere: Joi.boolean().default(false),
            start: Joi.date().required(),
            end: Joi.when('isWorkingHere', {
                is: true,
                then: Joi.date().valid('', null),
                otherwise: Joi.date().required(),
            }),
            logo: Joi.string().uri().default(''),
            categories: Joi.array().items(Joi.string().min(1)).allow(null),
            description: Joi.string().allow(null, ''),
            fileId: Joi.objectId().allow(null, ''),
        }),
    }),
    c((req) => {
        const creator = req.user;
        const professionalInfo = req.body;
        const exp = req.exp;
        const file = req.file;
        return { creator, professionalInfo, exp, file };
    }, writerController.addUpdateExperience),
);

// Remove Experience
router.delete(
    '/professionalinfo/:expId',
    celebrate({
        params: Joi.object().keys({
            expId: Joi.objectId().required(),
        }),
    }),
    c((req) => {
        const creator = req.user;
        const expId = req.params.expId;
        return { creator, expId };
    }, writerController.removeExperience),
);

/**
 * Porfolio Testimonials Endpoints
 * @version2
 */

/**
 * @apiName Request for testimonial via email
 */
// ! Deprecated soon. Use new API in creator-pm/portfolio APIs
router.post(
    '/testimonials/request-via-email',
    celebrate({
        body: Joi.object().keys({
            email: Joi.string().regex(emailRegex).required(),
            reqMessage: Joi.string()
                .min(1)
                .max(CONSTANTS.REQMESSAGE)
                .trim()
                .required(),
        }),
    }),
    c((req) => {
        const creator = req.user;
        const { email, reqMessage } = req.body;
        return { creator, email, reqMessage };
    }, writerController.testimonialViaEmail),
);

/**
 * @apiName Change visibility status of testimonial
 */
// ! Deprecated soon. Use new API in creator-pm/portfolio APIs
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
    }, writerController.changeTestimonialVisibility),
);

/**
 * @apiName Add brand logo to portfolio
 */
// ! Deprecated soon. Use new API in creator-pm/portfolio APIs
router.post(
    '/logo-testimonial',
    attachBrandLogo,
    brandLogoUpload.single('file'),
    celebrate({
        body: Joi.object().keys({
            company: Joi.string().trim().required(),
            logo: Joi.string().uri().default(''),
        }),
    }),
    c((req) => {
        const creator = req.user;
        const { company, logo } = req.body;
        const file = req.file;
        const logo_testimonaial = req.logo_testimonaial;
        return { creator, company, file, logo, logo_testimonaial };
    }, writerController.addBrandLogo),
    addBrandLogoErrorHandler,
);

/**
 * @apiName Delete brand logo from db and s3
 */
// ! Deprecated soon. Use new API in creator-pm/portfolio APIs
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
    }, writerController.deleteTestimonial),
);

/**
 * ****************Portfolio Project Endpoints*******************
 * @version3
 */

// **********  Short Form Project *********************

// ! Deprecated soon. Use new API in creator-pm/portfolio APIs
// Add Short Form Card
router.post(
    '/project/short-form',
    celebrate({
        body: Joi.object().keys({
            title: Joi.string()
                .min(1)
                .max(CONSTANTS.SHORT_FORM_TITLE)
                .trim()
                .required(),
            description: Joi.string()
                .max(CONSTANTS.SHORT_FORM_DESCRIPTION)
                .allow('', null),
            // primaryTag: Joi.string().required(),
            category: Joi.array().items(Joi.string()).min(1).max(3).required(),
            tone: Joi.string()
                .valid(...Object.values(CONSTANTS.TONES))
                .default(''),
            industry: Joi.string().default(''),
            additionalTags: Joi.array()
                .items(Joi.string().min(1))
                .max(10)
                .default([]),
            collaboraters: Joi.array().items(Joi.objectId()).default([]),
            txtCards: Joi.array()
                .items(Joi.string().min(1).max(CONSTANTS.SHORT_FORM_CARD))
                .max(5)
                .allow(null),
        }),
    }),
    c((req) => {
        const creator = req.user;
        const cardData = req.body;
        return { creator, cardData };
    }, writerController.addShortFormCard),
);

// ! Deprecated soon. Use new API in creator-pm/portfolio APIs
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
                .max(CONSTANTS.SHORT_FORM_TITLE)
                .trim()
                .required(),
            description: Joi.string()
                .max(CONSTANTS.SHORT_FORM_DESCRIPTION)
                .allow('', null),
            // primaryTag: Joi.string().required(),
            category: Joi.array().items(Joi.string()).min(1).max(3).required(),
            tone: Joi.string()
                .valid(...Object.values(CONSTANTS.TONES))
                .default(''),
            industry: Joi.string().default(''),
            additionalTags: Joi.array()
                .items(Joi.string().min(1))
                .max(10)
                .default([]),
            collaboraters: Joi.array().items(Joi.objectId()).default([]),
            txtCards: Joi.array()
                .items(Joi.string().min(1).max(CONSTANTS.SHORT_FORM_CARD))
                .max(5)
                .allow(null),
        }),
    }),
    c((req) => {
        const creator = req.user;
        const cardData = req.body;
        const sid = req.params.sid;
        return { creator, cardData, sid };
    }, writerController.updateShortFormCard),
);
// **************** Design Projects *******************

// ! Deprecated soon. Use new API in creator-pm/portfolio APIs
router.post(
    '/project/design',
    // Middleware to create empty Project. This middleware also adds 'project' property to req object which is accessed as req.project
    createEmptyProject,
    // Middleware to upload files to s3
    upload.array('files', CONSTANTS.DESIGN_MAX_CARDS),
    // req.files now contains file information
    // req.body contains the text fields
    // Validate text fileds from req.body
    celebrate({
        body: Joi.object().keys({
            title: Joi.string().min(1).trim().max(CONSTANTS.TITLE).required(),
            description: Joi.string()
                .max(CONSTANTS.DESCRIPTION)
                .allow('', null),
            // primaryTag: Joi.string().required(),
            category: Joi.array().items(Joi.string()).min(1).max(3).required(),
            style: Joi.string().default(''),
            industry: Joi.string().default(''),
            additionalTags: Joi.array()
                .items(Joi.string().min(1))
                .max(10)
                .default([]),
            collaboraters: Joi.array().items(Joi.objectId()).default([]),
        }),
    }),
    c((req) => {
        const creator = req.user;
        const newProject = req.project;
        const cardData = req.body;
        return { creator, newProject, cardData };
    }, writerController.addDesignProject),
    // Middleware to handle errors
    addDesignErrorHandler,
);

// ! Deprecated soon. Use new API in creator-pm/portfolio APIs
// Remove Images from project
router.delete(
    '/project/design/:pid',
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
        const imageIds = req.body.imageIds;
        return { creator, pid, imageIds, ptype: CONSTANTS.MODELS.CARDS };
    }, writerController.removeImagesFromProject),
);

// ! Deprecated soon. Use new API in creator-pm/portfolio APIs
// Update Design project
// Upload new images, update other textual info
const uploadImagesMiddleware = uploadImagesMiddlewareSetup;
router.put(
    '/project/design/:pid',
    celebrate({
        params: Joi.object().keys({
            pid: Joi.objectId().required(),
        }),
    }),
    // attach 'project' to req object
    addProject(CONSTANTS.MODELS.CARDS),
    uploadImagesMiddleware,
    celebrate({
        body: Joi.object().keys({
            title: Joi.string().min(1).trim().max(CONSTANTS.TITLE).required(),
            description: Joi.string()
                .max(CONSTANTS.DESCRIPTION)
                .allow('', null),
            // primaryTag: Joi.string().required(),
            category: Joi.array().items(Joi.string()).min(1).max(3).required(),
            style: Joi.string().default(''),
            industry: Joi.string().default(''),
            additionalTags: Joi.array()
                .items(Joi.string().min(1))
                .max(10)
                .default([]),
            collaboraters: Joi.array().items(Joi.objectId()).default([]),
        }),
    }),
    c((req) => {
        const creator = req.user;
        const project = req.project;
        const cardData = req.body;
        return { creator, project, cardData };
    }, writerController.updateDesignProject),
    // Delete uploaded files if error occured
    updateDesignErrorHandler,
);

// ********************* Long Form Endpoints ********************

// ! Deprecated soon. Use new API in creator-pm/portfolio APIs
router.post(
    '/project/long-form',
    c((req) => {
        const creator = req.user;
        return { creator };
    }, writerController.initializeLongForm),
);

// ! Deprecated soon. Use new API in creator-pm/portfolio APIs
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
            coverImg: Joi.string().uri().default(''),
            publish: Joi.boolean().required(),
            title: Joi.string().min(1).trim().required(),
            description: Joi.string().allow('', null),
            // primaryTag: Joi.string().required(),
            category: Joi.array().items(Joi.string()).min(1).max(3).required(),
            tone: Joi.string()
                .valid(...Object.values(CONSTANTS.TONES))
                .default(''),
            industry: Joi.string().default(''),
            additionalTags: Joi.array()
                .items(Joi.string().min(1))
                .max(10)
                .default([]),
            collaboraters: Joi.array().items(Joi.objectId()).default([]),
        }),
    }),
    c((req) => {
        const creator = req.user;
        const { pid } = req.params;
        const data = req.body;
        return { pid, creator, data };
    }, writerController.saveLongForm),
);

// ! Deprecated soon. Use new API in creator-pm/portfolio APIs
router.post(
    '/project/long-form/image/:pid',
    celebrate({
        params: Joi.object().keys({
            pid: Joi.objectId().required(),
        }),
    }),
    addProject(CONSTANTS.MODELS.LONG_FORM),
    upload.array('files', 1),
    c((req) => {
        const creator = req.user;
        const { files, project } = req;
        return { creator, files, project };
    }, writerController.addImageToLongForm),
);

// ! Deprecated soon. Use new API in creator-pm/portfolio APIs
router.delete(
    '/project/long-form/image/:pid',
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
        return { creator, pid, imageIds, ptype: CONSTANTS.MODELS.LONG_FORM };
    }, writerController.removeImagesFromProject),
);

// ! Deprecated soon. Use new API in creator-pm/portfolio APIs
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
    }, writerController.importArticle),
);

// ! Deprecated soon. Use new API in creator-pm/portfolio APIs
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
    }, writerController.getFileData),
);

// ********************* PDF Endpoints ********************

// Uses new file upload flow
router.post(
    '/project/pdf',
    celebrate({
        body: Joi.object().keys({
            fileId: Joi.objectId().required(),
            coverId: Joi.objectId().required(),
            title: Joi.string().min(1).trim().required(),
            description: Joi.string().allow('', null),
            // primaryTag: Joi.string().required(),
            category: Joi.array().items(Joi.string()).min(1).max(3).required(),
            tone: Joi.string()
                .valid(...Object.values(CONSTANTS.TONES))
                .default(''),
            industry: Joi.string().default(''),
            additionalTags: Joi.array()
                .items(Joi.string().min(1))
                .max(10)
                .default([]),
            collaboraters: Joi.array().items(Joi.objectId()).default([]),
        }),
    }),
    c((req) => {
        const creator = req.user;
        const data = req.body;
        return { creator, data };
    }, writerController.createUpdatePdf),
);

// Uses new file upload flow
router.put(
    '/project/pdf/:pid',
    celebrate({
        params: Joi.object().keys({
            pid: Joi.objectId().required(),
        }),
        body: Joi.object().keys({
            fileId: Joi.objectId().allow(null, ''),
            coverId: Joi.objectId().allow(null, ''),
            title: Joi.string().min(1).trim().required(),
            description: Joi.string().allow('', null),
            // primaryTag: Joi.string().required(),
            category: Joi.array().items(Joi.string()).min(1).max(3).required(),
            tone: Joi.string()
                .valid(...Object.values(CONSTANTS.TONES))
                .default(''),
            industry: Joi.string().default(''),
            additionalTags: Joi.array()
                .items(Joi.string().min(1))
                .max(10)
                .default([]),
            collaboraters: Joi.array().items(Joi.objectId()).default([]),
        }),
    }),
    c((req) => {
        const creator = req.user;
        const data = req.body;
        const pid = req.params.pid;
        return { creator, data, pid };
    }, writerController.createUpdatePdf),
);

/**
 * Project Common
 */

// ! Deprecated soon. Use new API in creator-pm/portfolio APIs
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
    }, writerController.removeProject),
);

// ! Deprecated soon. Use new API in creator-pm/portfolio APIs
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
    }, writerController.getSpecificProject),
);

module.exports = router;

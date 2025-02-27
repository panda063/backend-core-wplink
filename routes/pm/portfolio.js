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

/**
 * Router Middlewares
 */

const {
    createEmptyProject,
    attachBrandLogo,
    addBrandLogoErrorHandler,
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
    pmStudioImageUpload,
} = require('../../services/file-upload');

const {
    upload,
    miscUpload: { brandLogoUpload },
} = require('../../services/file-upload-service');

/**
 * Controllers
 */
const portfolioController = require('../../controllers/pm/portfolio');
const writerController = require('../../controllers/creator/portfolio');
const commonController = require('../../controllers/common');

// Regex pattern for a valid email address
const emailRegex = /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/;

// ! Deprecated soon. Use new API in user APIs
// Reusing logic to upload and remove profile image
router.put(
    '/profile-image',
    portfolioImgUploadService.single('file'),
    c((req) => {
        const user = req.user;
        const { file } = req;
        return { user, file };
    }, writerController.uploadPortfolioImg),
);

// ! Deprecated soon. Use new API in user APIs
router.delete(
    '/profile-image',
    c((req) => {
        const user = req.user;
        return { user };
    }, writerController.removePortfolioImage),
);

// Studio image
// ! Deprecated soon with new v2 APIs below
router.put(
    '/studio-image',
    pmStudioImageUpload.single('file'),
    c((req) => {
        const user = req.user;
        const { file } = req;
        return { user, file };
    }, portfolioController.uploadStudioImg),
);

// ! Deprecated soon with new v2 APIs below
router.delete(
    '/studio-image',
    c((req) => {
        const user = req.user;
        return { user };
    }, portfolioController.removeStudioImage),
);

// Studio image
router.put(
    '/v2/studio-image',
    celebrate({
        body: Joi.object().keys({
            fileId: Joi.objectId().required(),
        }),
    }),
    c((req) => {
        const user = req.user;
        const { fileId } = req.body;
        return { user, fileId };
    }, portfolioController.uploadStudioImgv2),
);

router.delete(
    '/v2/studio-image',
    c((req) => {
        const user = req.user;
        return { user };
    }, portfolioController.removeStudioImagev2),
);

/**
 * @apiName Send invitation emails to creators to join studio
 */
router.post(
    '/studio-invite',
    celebrate({
        body: Joi.object().keys({
            emails: Joi.array()
                .items(Joi.string().email())
                .min(1)
                .max(3)
                .required(),
        }),
    }),
    c((req) => {
        const pm = req.user;
        const { emails } = req.body;
        return { pm, emails };
    }, portfolioController.studioInvite),
);

/**
 * @apiName Update Pm studio info
 */
router.put(
    '/studioInfo',
    celebrate({
        body: Joi.object().keys({
            name: Joi.string().trim().required(),
            description: Joi.string().trim().default(''),
            availability: Joi.boolean().default(true),
            availableFrom: Joi.date().greater(new Date(moment())).default(null),
            creatorRequests: Joi.boolean().required(),
            creatorsAllowed: Joi.when('creatorRequests', {
                is: true,
                then: Joi.array()
                    .items(
                        Joi.string().valid(
                            C.CREATOR_TYPES.WRITER,
                            C.CREATOR_TYPES.DESIGNER,
                        ),
                    )
                    .min(1)
                    .required(),
                otherwise: Joi.array().default([]),
            }),
            expertise: Joi.array()
                .items(Joi.string().trim())
                .min(2)
                .max(3)
                .required(),
        }),
    }),
    c((req) => {
        const pm = req.user;
        const studioInfo = req.body;
        return { pm, studioInfo };
    }, portfolioController.updateStudioInfo),
);

/**
 * @apiName Update Pm info
 */
router.put(
    '/pmInfo',
    celebrate({
        body: Joi.object().keys({
            firstname: Joi.string().trim().required(),
            // allow empty lastName
            lastname: Joi.string().trim().allow('').default(''),
            designation: Joi.string().trim().required(),
        }),
    }),
    c((req) => {
        const pm = req.user;
        const pmInfo = req.body;
        return { pm, pmInfo };
    }, portfolioController.updatePmInfo),
);

router.get(
    '/studio-members',
    c((req) => {
        const pm = req.user;
        return { pm };
    }, portfolioController.getStudioMembers),
);

/**
 * @apiName Set availability of a studio member
 */
router.put(
    '/set-availability',
    celebrate({
        body: Joi.object().keys({
            memberId: Joi.objectId().required(),
            availability: Joi.boolean().required(),
        }),
    }),
    c((req) => {
        const pm = req.user;
        const { memberId, availability } = req.body;
        return { pm, memberId, availability };
    }, portfolioController.setMemberAvailability),
);

/**
 * @apiName Uppdate creator information of conversation
 */
router.put(
    '/creator-info/:cid',
    celebrate({
        params: Joi.object().keys({
            cid: Joi.objectId().required(),
        }),
        body: Joi.object().keys({
            badge: Joi.string()
                .valid(...Object.values(C.STUDIO_MEMBER_BADGES))
                .allow(null),
            tags: Joi.array().items(Joi.string().trim()).allow(null),
            employmentType: Joi.string()
                .valid(...Object.values(C.STUDIO_MEMBER_EMPLOYMENTS))
                .allow(null),
        }),
    }),
    c((req) => {
        const pm = req.user;
        const { cid } = req.params;
        const { badge, tags, employmentType } = req.body;
        return { pm, cid, badge, tags, employmentType };
    }, portfolioController.updateCreatorInfo),
);

router.get(
    '/generalInfo',
    c((req) => {
        let user = req.user;
        return { userId: user.id };
    }, commonController.exportedStudioGeneralInfoStripped),
);

/**
 * @apiName Get all list cards
 */

router.get(
    '/listcards',
    c((req) => {
        const pm = req.user;
        return { pm };
    }, portfolioController.getListCards),
);

/**
 * @apiName Update card position
 */

router.put(
    '/listcards/card/position',
    celebrate({
        body: Joi.object().keys({
            cardId: Joi.objectId().required(),
            position: Joi.string().required(),
            status: Joi.string().valid(C.LIST_CARD_STATUS.SEEN).default(''),
        }),
    }),
    c((req) => {
        const pm = req.user;
        const { cardId, position, status } = req.body;
        return { pm, cardId, position, status };
    }, portfolioController.updateListCardPosition),
);

/**
 * ****************Portfolio Project Endpoints*******************
 * @version3
 */

// * PM Specific  Project Routes

// Import project for portfolio
router.put(
    '/project/import/:pid',
    celebrate({
        params: Joi.object().keys({
            pid: Joi.objectId().required(),
        }),
    }),
    c((req) => {
        let pm = req.user;
        const { pid } = req.params;
        return { pm, pid };
    }, portfolioController.importProjectForPortfolio),
);

// Get portfolio projects (cards or longform)
_.forEach([C.MODELS.CARDS, C.MODELS.LONG_FORM], (ptype) => {
    router.post(
        `/${ptype}`,
        celebrate({
            body: Joi.object().keys({
                imported: Joi.boolean().default(false),
                page: Joi.number().min(1).default(1),
            }),
        }),
        c((req) => {
            let user = req.user;
            const { page, imported } = req.body;
            return { user, page, ptype, imported, portfolio_owner: true };
        }, commonController.exportedGetStudioProjectsByType),
    );
});

router.get(
    '/projects/latest',
    c((req) => {
        const creator = req.user;
        return {
            creatorId: creator.id,
        };
    }, commonController.exportedGetLatestProjectsOfCreator),
);

// * Common Routes for both PM and Creator
// * Creator project controllers are reused for these APIs as well
// * Only difference is that, in PM projects studioProject field is true and cid = pm user id

// **********  Short Form Project *********************

// ! Deprecated soon. Use new API in creator-pm/portfolio APIs
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
    }, writerController.updateShortFormCard),
);
// **************** Design Projects *******************

// ! Deprecated soon. Use new API in creator-pm/portfolio APIs
router.post(
    '/project/design',
    // Middleware to create empty Project. This middleware also adds 'project' property to req object which is accessed as req.project
    createEmptyProject,
    // Middleware to upload files to s3
    upload.array('files', C.DESIGN_MAX_CARDS),
    // req.files now contains file information
    // req.body contains the text fields
    // Validate text fileds from req.body
    celebrate({
        body: Joi.object().keys({
            title: Joi.string().min(1).trim().max(C.TITLE).required(),
            description: Joi.string().max(C.DESCRIPTION).allow('', null),
            // primaryTag: Joi.string().required(),
            category: Joi.array().items(Joi.string()).min(1).max(3).required(),
            style: Joi.string().default(''),
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
        return { creator, pid, imageIds, ptype: C.MODELS.CARDS };
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
    addProject(C.MODELS.CARDS),
    uploadImagesMiddleware,
    celebrate({
        body: Joi.object().keys({
            title: Joi.string().min(1).trim().max(C.TITLE).required(),
            description: Joi.string().max(C.DESCRIPTION).allow('', null),
            // primaryTag: Joi.string().required(),
            category: Joi.array().items(Joi.string()).min(1).max(3).required(),
            style: Joi.string().default(''),
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
    addProject(C.MODELS.LONG_FORM),
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
        return { creator, pid, imageIds, ptype: C.MODELS.LONG_FORM };
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

/**
 * ********** Portfolio Testimonial endpoints ***********
 * * Common for both PM and Creator
 */

// ! Deprecated soon. Use new API in creator-pm/portfolio APIs
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
    }, writerController.testimonialViaEmail),
);
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
        }),
    }),
    c((req) => {
        const creator = req.user;
        const { company } = req.body;
        const file = req.file;
        const logo_testimonaial = req.logo_testimonaial;
        return { creator, company, file, logo_testimonaial };
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
module.exports = router;

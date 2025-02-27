/**
 * Module Dependencies
 */

const _ = require('lodash');
const { celebrate, Joi, isCelebrate } = require('celebrate');
Joi.objectId = require('joi-objectid')(Joi);
const router = require('express').Router();
const c = require('../helper');
const env = require('../../config/env');
const C = require('../../lib/constants');
const multer = require('multer');
const upload = multer();

/**
 * Middlewares
 */

const {
    captureBlockEvent,
    captureProfileEvent,
} = require('../middlewares/writerMiddlewares');

/**
 * Controllers
 */

const portfolioV3Controllers = require('../../controllers/creator/portfolio-v3.1');
const commonControllers = require('../../controllers/common');

// Regex pattern for a valid email address
const emailRegex = /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/;

const templateData = require('../../assets/templates/templates.json')[
    env.NODE_ENV
];

// **** Portfolio details *****

/**
 * @apiName Setup Portfolio
 */

// TODO: Without onboarding complete only '/setup-profile' shoule be allowed access. Add a guard middleware

router.post(
    '/setup-profile',
    celebrate({
        body: Joi.object().keys({
            // If templateId is given use template to create data
            templateId: Joi.string()
                .valid(...Object.keys(templateData))
                .allow('')
                .default(''),

            // * STEP 1
            fullname: Joi.string().trim().max(100).required(),
            /*    firstName: Joi.string().trim().required(),
            // allow empty lastName
            lastName: Joi.string().trim().allow('').default(''), */
            country: Joi.string().trim().required(),
            city: Joi.string().trim().required(),
            medium: Joi.string().valid(
                'email',
                'twitter',
                'facebook',
                'linkedin',
                'instagram',
                'google',
                'referral',
            ),
            mobileCountry: Joi.string().min(1).max(8).default('+91'),
            mobile: Joi.string()
                .regex(/^[0-9]+$/)
                .min(1)
                .required(),
            // * STEP 2
            designation: Joi.string().max(80).trim().allow('').default(''),
            role: Joi.array()
                .items(Joi.string().trim())
                .min(1)
                .max(5)
                .default([]),
            skills: Joi.array()
                .items(Joi.string().trim())
                .min(1)
                .max(5)
                .default([]),
            experience: Joi.string()
                .valid(...Object.values(C.PROFILE_SETUP_EXPERIENCE))
                .required(),
            niche: Joi.string().allow('').default(''),
            // * STEP 3
            // * One of sampleUploads OR sampleLinks
            sampleUploads: Joi.array()
                .items(
                    Joi.object().keys({
                        fileId: Joi.objectId().required(),
                        fileType: Joi.string().valid('image', 'pdf'),
                        coverId: Joi.when('fileType', {
                            is: 'pdf',
                            then: Joi.objectId().required(),
                            otherwise: Joi.objectId().valid(null),
                        }),
                    }),
                )
                .max(3)
                .default([]),
            // TODO: fulfil using Joi
            sampleLinks: Joi.array()
                .items(
                    Joi.string().regex(
                        /[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/,
                    ),
                )
                .default([]),
            // * STEP 4
            link: Joi.when('templateId', {
                is: Joi.string().valid(...Object.keys(templateData)),
                then: Joi.string()
                    .regex(
                        /[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/,
                    )
                    .default(''),
                otherwise: Joi.string()
                    .regex(
                        /[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/,
                    )
                    .required(),
            }),
            testimonials: Joi.array()
                .items(
                    Joi.object().keys({
                        logo: Joi.string().uri().allow('').default(''),
                        name: Joi.string().required(),
                    }),
                )
                .max(4)
                .default([]),
            // * STEP 5
            /*  devoteTime: Joi.string()
                .valid(...Object.values(C.PROFILE_SETUP_DEVOTE_TIME))
                .required(),
            currency: Joi.string()
                .valid(...Object.values(C.CURRENCY))
                .default(C.CURRENCY.INR),
            minPay: Joi.number().min(0).max(900000000).required(),
            minPayUnit: Joi.number().valid(
                ...Object.values(C.PROFILE_SETUP_MINPAY_UNIT),
            ),
            expectedIncome: Joi.number().min(0).max(900000000).required(), */
            service: Joi.object()
                .keys({
                    title: Joi.string().trim().required(),
                    description: Joi.string().trim().allow('').default(''),
                    currency: Joi.string().required(),
                    price: Joi.number().min(0).max(900000000).required(),
                })
                .allow(null)
                .default(null),
            // *
            theme: Joi.string()
                .valid(...Object.values(C.PORTFOLIO_THEMES))
                .allow(null),
        }),
    }),
    c((req) => {
        const user = req.user;
        const { templateId, ...data } = req.body;
        return { user, data, templateId };
    }, portfolioV3Controllers.setupPortfolio),
);

/**
 * @apiName Sumbit portfolio API rewards system
 */

router.put(
    '/submit',
    c((req) => {
        const user = req.user;
        return {
            user,
        };
    }, portfolioV3Controllers.updateSubmit),
);

/**
 * @apiName Change penname
 * ^(?=.{4,20}$)(?![-])(?![-]{2})[a-zA-Z0-9-]+(?<![-])$
    └──┬────┘   └───┬─┘└─────┬─┘└─────┬─────┘ └───┬───┘
       │            │        │        │           no - at the end
       │            │        │        │
       │            │        │        allowed characters
       │            │        │
       │            │         no -- inside
       │            │
       │           no - at the beginning
       │
       username is 4-20 characters long
 */

router.put(
    '/change-username',
    celebrate({
        body: Joi.object().keys({
            penname: Joi.string()
                .trim()
                .regex(/^(?=.{4,20}$)(?![-])(?![-]{2})[a-zA-Z0-9-]+(?<![-])$/)
                .required(),
        }),
    }),
    c(
        (req) => {
            const user = req.user;
            const { penname } = req.body;
            return { user, penname };
        },
        portfolioV3Controllers.updatePenname,
        true,
    ),
    captureProfileEvent,
);

/**
 * @apiName Update User Details
 */

router.put(
    '/user-details',
    celebrate({
        body: Joi.object().keys({
            name: Joi.string().max(50).min(1).trim().default(null),
            bio: Joi.string().trim().max(1000).default(null),
            designation: Joi.string().max(80).trim().allow('').default(null),
            preferCollab: Joi.string()
                .valid(...Object.values(C.COLLAB_TYPE))
                .default(null),
        }),
    }),
    c(
        (req) => {
            const data = req.body;
            const user = req.user;
            return { data, user };
        },
        portfolioV3Controllers.udpateUserDetails,
        true,
    ),
    captureProfileEvent,
);

/**
 * @apiName Fetch user details
 */

router.get(
    '/user-details',
    c((req) => {
        const user = req.user;
        return { user };
    }, portfolioV3Controllers.fetchUserDetails),
);

/**
 * @apiName Update upload state
 */

router.put(
    '/onboard-state',
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

/**
 * @apiName
 */

router.put(
    '/report-seen',
    c((req) => {
        const user = req.user;
        return { user };
    }, portfolioV3Controllers.seenReport),
);

/**
 * @apiName Set custom domain
 */

router.post(
    '/set-custom-domain',
    celebrate({
        body: Joi.object().keys({
            domain: Joi.string().min(1).max(50).required(),
        }),
    }),
    c((req) => {
        const user = req.user;
        const { domain } = req.body;
        return { user, domain };
    }, portfolioV3Controllers.setCustomDomain),
);

/**
 * @apiName Check Custom domain
 */

router.post(
    '/check-custom-domain',
    c((req) => {
        const user = req.user;
        return { user };
    }, portfolioV3Controllers.customDomainCheck),
);

/**
 * @apiName Delete custom domain
 */

router.delete(
    '/delete-custom-domain',
    c((req) => {
        const user = req.user;
        return { user };
    }, portfolioV3Controllers.deleteCustomDomain),
);

//  ******* Page APIs ********

/**
 * @apiName Create Page
 */

router.post(
    '/page/create',
    celebrate({
        body: Joi.object().keys({
            name: Joi.string().required(),
        }),
    }),
    c(
        (req) => {
            const user = req.user;
            const { name } = req.body;
            return { user, name };
        },
        portfolioV3Controllers.createPage,
        true,
    ),
    captureProfileEvent,
);

/**
 * @apiName Update Page Name
 */

router.put(
    '/page/update/:id',
    celebrate({
        params: Joi.object().keys({
            id: Joi.objectId().required(),
        }),
        body: Joi.object().keys({
            name: Joi.string().trim().allow(null, ''),
            // homepage: Joi.boolean().default(false),
        }),
    }),
    c(
        (req) => {
            const user = req.user;
            const { id } = req.params;
            const { name } = req.body;
            return { user, id, name };
        },
        portfolioV3Controllers.updatePage,
        true,
    ),
    captureProfileEvent,
);

/**
 * @apiName Get creator pages
 */

router.get(
    '/pages',
    c((req) => {
        let user = req.user;
        return { user };
    }, portfolioV3Controllers.getPortfolioPages),
);

/**
 * @apiName Copy Page
 */

router.post(
    '/page/copy/:pageId',
    celebrate({
        params: Joi.object().keys({
            pageId: Joi.objectId().required(),
        }),
    }),
    c(
        (req) => {
            const { pageId } = req.params;
            const user = req.user;
            return { pageId, user };
        },
        portfolioV3Controllers.copyPage,
        true,
    ),
    captureProfileEvent,
);

/**
 * @apiName Get state of page
 */

router.get(
    '/page/state/:id',
    celebrate({
        params: Joi.object().keys({
            id: Joi.objectId().required(),
        }),
    }),
    c((req) => {
        const { id } = req.params;
        const user = req.user;
        return { user, id };
    }, portfolioV3Controllers.getPageState),
);

/**
 * @apiName Delete Page
 * Also deletes all blocks within that page
 */

router.delete(
    '/page/delete/:id',
    celebrate({
        params: Joi.object().keys({
            id: Joi.objectId().required(),
        }),
    }),
    c(
        (req) => {
            const user = req.user;
            const { id } = req.params;
            return { user, id };
        },
        portfolioV3Controllers.deletePage,
        true,
    ),
    captureProfileEvent,
);

/**
 * @apiName Update Page Image
 */

router.post(
    '/page/image',
    celebrate({
        body: Joi.object().keys({
            fileId: Joi.objectId().required(),
            pageId: Joi.objectId().required(),
        }),
    }),
    c(
        (req) => {
            const user = req.user;
            const { fileId, pageId } = req.body;
            return { user, fileId, pageId };
        },
        portfolioV3Controllers.updatePageImage,
        true,
    ),
    captureProfileEvent,
);

/**
 * @apiName Delete Page Image
 */

router.delete(
    '/page/image',
    celebrate({
        body: Joi.object().keys({
            pageId: Joi.objectId().required(),
        }),
    }),
    c(
        (req) => {
            const user = req.user;
            const { pageId } = req.body;
            return { user, pageId };
        },
        portfolioV3Controllers.deletePageImage,
        true,
    ),
    captureProfileEvent,
);

/**
 * @apiName Update Page bio details
 */

router.put(
    '/details',
    celebrate({
        body: Joi.object().keys({
            name: Joi.string().max(50).trim().required(),
            bio: Joi.string().trim().max(1000).default(''),
            designation: Joi.string().max(80).trim().allow('').default(''),
            socialLink: Joi.array()
                .items(
                    Joi.object().keys({
                        field: Joi.string().required(),
                        link: Joi.string()
                            .regex(
                                /[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/,
                            )
                            .allow('')
                            .default(''),
                    }),
                )
                .default([]),
            pageId: Joi.objectId().required(),
        }),
    }),
    c(
        (req) => {
            const { pageId, ...data } = req.body;
            const user = req.user;
            return { data, user, pageId };
        },
        portfolioV3Controllers.updatePageDetails,
        true,
    ),
    captureProfileEvent,
);

/**
 * @apiName Update Page Social Link position
 */

router.put(
    '/social-link-position',
    celebrate({
        body: Joi.object().keys({
            field: Joi.string().required(),
            position: Joi.string().trim().required(),
            pageId: Joi.objectId().required(),
        }),
    }),
    c(
        (req) => {
            const user = req.user;
            const { pageId, ...data } = req.body;
            return { data, user, pageId };
        },
        portfolioV3Controllers.updatePageSocialLinkPosition,
        true,
    ),
    captureProfileEvent,
);

/**
 * @apiName Update layout and profileColor
 */

router.put(
    '/color-layout',
    celebrate({
        body: Joi.object().keys({
            layout: Joi.string()
                .valid(...Object.values(C.PORTFOLIO_LAYOUT))
                .allow(null),
            profileColor: Joi.string()
                .valid(...Object.values(C.PORTFOLIO_THEMES))
                .allow(null),
            themeId: Joi.objectId().allow(null).default(null),
            pageId: Joi.objectId().required(),
        }),
    }),
    c(
        (req) => {
            const user = req.user;
            const { pageId, ...data } = req.body;
            return { data, user, pageId };
        },
        portfolioV3Controllers.updatePageLayoutAndColor,
        true,
    ),
    captureProfileEvent,
);

/**
 * @apiName Page Customization
 */

router.put(
    '/page/customize/:pageId',
    celebrate({
        params: Joi.object().keys({
            pageId: Joi.objectId().required(),
        }),
        body: Joi.object().keys({
            profileLayout: Joi.string()
                .valid(...Object.values(C.PAGE_PROFILE_LAYOUT))
                .allow(null)
                .default(null),
            photoShape: Joi.number().min(0).max(100).allow(null).default(null),
            profileBorder: Joi.boolean().allow(null).default(null),
            borderColor: Joi.string()
                .regex(/^#(?:[0-9a-fA-F]{3}){1,2}$/)
                .allow(null)
                .default(null),
            profileBackground: Joi.boolean().allow(null).default(null),
            backgroundImage: Joi.objectId().allow('', null).default(null),
            fontColor: Joi.string()
                .regex(/^#(?:[0-9a-fA-F]{3}){1,2}$/)
                .default(null)
                .allow(null),
            blockHighlight: Joi.string()
                .valid(...Object.values(C.PAGE_BLOCK_HIGHLIGHT))
                .allow(null)
                .default(null),
            highlightColor: Joi.string()
                .regex(/^#(?:[0-9a-fA-F]{3}){1,2}$/)
                .allow(null)
                .default(null),
        }),
    }),
    c((req) => {
        const user = req.user;
        const { pageId } = req.params;
        const data = req.body;
        return { user, pageId, data };
    }, portfolioV3Controllers.customizePage),
);

/**
 * @apiName Reset customization to default API
 */

router.put(
    '/page/customize-reset/:pageId',
    celebrate({
        params: Joi.object().keys({
            pageId: Joi.objectId().required(),
        }),
    }),
    c((req) => {
        const user = req.user;
        const { pageId } = req.params;
        return { user, pageId };
    }, portfolioV3Controllers.resetCustomize),
);

/**
 * @apiName Create New theme
 */

router.post(
    '/theme',
    celebrate({
        body: Joi.object().keys({
            name: Joi.string().max(100).required(),

            backgroundImage: Joi.objectId().allow('', null).default(''),

            text: Joi.string().required(),
            labelText: Joi.string().required(),
            primaryFontFamily: Joi.string().required(),
            secondaryFontFamily: Joi.string().required(),
            header: Joi.string().required(),
            headerBorder: Joi.string().required(),
            headerBoxShadow: Joi.string().required(),
            boxShadow: Joi.string().required(),
            pageBreak: Joi.string().required(),
            sidebar: Joi.string().required(),
            sidebarFont: Joi.string().required(),
            button: Joi.string().required(),
            buttonHover: Joi.string().required(),
            buttonActive: Joi.string().required(),
            buttonFont: Joi.string().required(),
            buttonBorder: Joi.string().required(),
            primaryButton: Joi.string().required(),
            primaryButtonHover: Joi.string().required(),
            primaryButtonActive: Joi.string().required(),
            primaryButtonFont: Joi.string().required(),
            primaryButtonBorder: Joi.string().required(),
            userDetails: Joi.string().required(),

            userDetailsBorder: Joi.string().required(),
            userDetailsFont: Joi.string().required(),
            experienceEmpty: Joi.string().required(),
            experienceEmptyFont: Joi.string().required(),
            experienceEmptyBorder: Joi.string().required(),
            experienceItem: Joi.string().required(),
            experienceItemFont: Joi.string().required(),
            experienceItemBorder: Joi.string().required(),
            accent: Joi.string().required(),
            fontAccent: Joi.string().required(),
            dots: Joi.string().required(),
            dotsBackground: Joi.string().required(),
            addButton: Joi.string().required(),

            cardSecondaryText: Joi.string().required(),
            serviceCard: Joi.string().required(),
            serviceBorder: Joi.string().required(),
            serviceFont: Joi.string().required(),
            serviceButton: Joi.string().required(),
            serviceButtonText: Joi.string().required(),
            serviceInput: Joi.string().required(),
            serviceInputText: Joi.string().required(),
            serviceInputBorder: Joi.string().allow('').default(''),
            serviceInner: Joi.string().required(),
            serviceInnerTitle: Joi.string().required(),
            serviceInnerText: Joi.string().required(),
            serviceSecondaryText: Joi.string().allow('').default(''),

            linkCard: Joi.string().required(),
            linkFont: Joi.string().required(),
            readMore: Joi.string().allow('').default(''),
            postCard: Joi.string().required(),
            postFont: Joi.string().required(),
            postBorder: Joi.string().required(),
            testimonialCard: Joi.string().required(),

            testimonialFont: Joi.string().required(),
            testimonialBorder: Joi.string().required(),
            background: Joi.string().required(),
            editBackground: Joi.string().required(),

            isCustom: Joi.boolean().default(true),
            useDarkLogo: Joi.boolean().default(false),
            isDark: Joi.boolean().default(false),
            isPastel: Joi.boolean().default(false),
        }),
    }),
    c((req) => {
        const user = req.user;
        const data = req.body;
        return {
            user,
            data,
        };
    }, portfolioV3Controllers.createNewTheme),
);

/**
 * @apiName Update theme
 */

router.put(
    '/theme/:id',
    celebrate({
        params: Joi.object().keys({
            id: Joi.objectId().required(),
        }),
        body: Joi.object().keys({
            name: Joi.string().max(100).required(),

            /*   backgroundImage: Joi.string().allow('', null).default(''),
            fileId: Joi.objectId().allow('', null).default(null), */

            backgroundImage: Joi.alternatives(
                Joi.objectId().allow(''),
                Joi.string().allow(''),
            ),

            text: Joi.string().required(),
            labelText: Joi.string().required(),
            primaryFontFamily: Joi.string().required(),
            secondaryFontFamily: Joi.string().required(),
            header: Joi.string().required(),
            headerBorder: Joi.string().required(),
            headerBoxShadow: Joi.string().required(),
            boxShadow: Joi.string().required(),
            pageBreak: Joi.string().required(),
            sidebar: Joi.string().required(),
            sidebarFont: Joi.string().required(),
            button: Joi.string().required(),
            buttonHover: Joi.string().required(),
            buttonActive: Joi.string().required(),
            buttonFont: Joi.string().required(),
            buttonBorder: Joi.string().required(),
            primaryButton: Joi.string().required(),
            primaryButtonHover: Joi.string().required(),
            primaryButtonActive: Joi.string().required(),
            primaryButtonFont: Joi.string().required(),
            primaryButtonBorder: Joi.string().required(),
            userDetails: Joi.string().required(),

            userDetailsBorder: Joi.string().required(),
            userDetailsFont: Joi.string().required(),
            experienceEmpty: Joi.string().required(),
            experienceEmptyFont: Joi.string().required(),
            experienceEmptyBorder: Joi.string().required(),
            experienceItem: Joi.string().required(),
            experienceItemFont: Joi.string().required(),
            experienceItemBorder: Joi.string().required(),
            accent: Joi.string().required(),
            fontAccent: Joi.string().required(),
            dots: Joi.string().required(),
            dotsBackground: Joi.string().required(),
            addButton: Joi.string().required(),

            cardSecondaryText: Joi.string().required(),
            serviceCard: Joi.string().required(),
            serviceBorder: Joi.string().required(),
            serviceFont: Joi.string().required(),
            serviceButton: Joi.string().required(),
            serviceButtonText: Joi.string().required(),
            serviceInput: Joi.string().required(),
            serviceInputText: Joi.string().required(),
            serviceInputBorder: Joi.string().allow('').default(''),
            serviceInner: Joi.string().required(),
            serviceInnerTitle: Joi.string().required(),
            serviceInnerText: Joi.string().required(),
            serviceSecondaryText: Joi.string().allow('').default(''),

            linkCard: Joi.string().required(),
            linkFont: Joi.string().required(),
            readMore: Joi.string().allow('').default(''),
            postCard: Joi.string().required(),
            postFont: Joi.string().required(),
            postBorder: Joi.string().required(),
            testimonialCard: Joi.string().required(),

            testimonialFont: Joi.string().required(),
            testimonialBorder: Joi.string().required(),
            background: Joi.string().required(),
            editBackground: Joi.string().required(),

            isCustom: Joi.boolean().default(true),
            useDarkLogo: Joi.boolean().default(false),
            isDark: Joi.boolean().default(false),
            isPastel: Joi.boolean().default(false),
        }),
    }),
    c((req) => {
        const user = req.user;
        const data = req.body;
        const { id } = req.params;
        return {
            id,
            user,
            data,
        };
    }, portfolioV3Controllers.updateTheme),
);

/**
 * @apiName Delete Theme by id
 */

router.delete(
    '/theme/:id',
    celebrate({
        params: Joi.object().keys({
            id: Joi.objectId().required(),
        }),
    }),
    c((req) => {
        const user = req.user;
        const { id } = req.params;
        return {
            user,
            id,
        };
    }, portfolioV3Controllers.deleteTheme),
);

/**
 * @apiName Get all themes
 */

router.get(
    '/themes',
    c((req) => {
        const user = req.user;
        return {
            user,
        };
    }, portfolioV3Controllers.fetchAllThemes),
);

/**
 * @apiName Select theme for page
 */

router.post(
    '/page/set-theme/:pageId',
    celebrate({
        params: Joi.object().keys({
            pageId: Joi.objectId().required(),
        }),
        body: Joi.object().keys({
            themeId: Joi.objectId().required(),
        }),
    }),
    c((req) => {
        const user = req.user;
        const { pageId } = req.params;
        const { themeId } = req.body;
        return {
            user,
            pageId,
            themeId,
        };
    }, portfolioV3Controllers.selectThemeForPage),
);

/**
 * @apiName Use template
 */

router.post(
    '/use-template',
    celebrate({
        body: Joi.object().keys({
            templateId: Joi.string().required(),
        }),
    }),
    c((req) => {
        const user = req.user;
        const { templateId } = req.body;
        return {
            user,
            templateId,
        };
    }, portfolioV3Controllers.useTemplate),
);

/**
 * @apiName Make page public/private
 */

router.put(
    '/page/visibility',
    celebrate({
        body: Joi.object().keys({
            pageId: Joi.objectId().required(),
            public: Joi.boolean().default(true),
            position: Joi.string().trim().allow('').default(''),
        }),
    }),
    c(
        (req) => {
            const user = req.user;
            const { pageId, public, position } = req.body;
            return {
                user,
                pageId,
                public,
                position,
            };
        },
        portfolioV3Controllers.changePageVisibility,
        true,
    ),
    captureProfileEvent,
);

/**
 * @apiName Change page bio visibility
 */

router.put(
    '/page/bio-visibility',
    celebrate({
        body: Joi.object().keys({
            pageId: Joi.objectId().required(),
            showBio: Joi.boolean().default(true),
        }),
    }),
    c(
        (req) => {
            const user = req.user;
            const { pageId, showBio } = req.body;
            return {
                user,
                pageId,
                showBio,
            };
        },
        portfolioV3Controllers.showHidePageBioSection,
        true,
    ),
    captureProfileEvent,
);

/**
 * @apiName Change page position
 */

router.put(
    '/page/position',
    celebrate({
        body: Joi.object().keys({
            pageId: Joi.objectId().required(),
            position: Joi.string().required(),
        }),
    }),
    c(
        (req) => {
            const user = req.user;
            const { pageId, position } = req.body;
            return {
                user,
                pageId,
                position,
            };
        },
        portfolioV3Controllers.changePagePosition,
        true,
    ),
    captureProfileEvent,
);

/**
 * @apiName Fetch Pages
 */

router.get(
    '/pages',
    c((req) => {
        const user = req.user;
        return { user };
    }, portfolioV3Controllers.fetchAllPageNames),
);

// **** Testimonial ****

/**
 * @apiName Request Testimonial from client
 */

router.post(
    '/testimonial/request-via-email',
    celebrate({
        body: Joi.object().keys({
            email: Joi.string().regex(emailRegex).required(),
            reqMessage: Joi.string().min(1).max(C.REQMESSAGE).trim().required(),
            position: Joi.string().trim().required(),
            id: Joi.objectId().allow(null).default(null),
            pageId: Joi.objectId().required(),
        }),
    }),
    c(
        (req) => {
            const creator = req.user;
            const { email, reqMessage, position, pageId, id } = req.body;
            return { creator, email, reqMessage, position, pageId, id };
        },
        portfolioV3Controllers.testimonialViaEmail,
        true,
    ),
    captureBlockEvent,
);

/**
 * @apiName Add brand logo to portfolio
 */

router.post(
    '/testimonial/logo',
    celebrate({
        body: Joi.alternatives(
            Joi.object().keys({
                company: Joi.string().trim().required(),
                logo: Joi.string().uri().allow('').default(''),
                reviewText: Joi.string().trim().allow('').default(''),
                position: Joi.string().trim().required(),
                id: Joi.objectId().allow(null).default(null),

                pageId: Joi.objectId().required(),
                customize: Joi.object()
                    .keys({
                        highlight: Joi.boolean().default(false),
                        customTitle: Joi.boolean().default(false),
                        blockTitle: Joi.string().allow('').default(''),
                        layout: Joi.string()
                            .valid('overview', 'detailed')
                            .default('overview'),
                        slideshowTime: Joi.number().min(0).max(15).default(0),
                    })
                    .default({
                        highlight: false,
                        customTitle: false,
                        blockTitle: '',
                        layout: 'overview',
                        slideshowTime: 0,
                    }),
            }),
            Joi.object().keys({
                company: Joi.string().trim().required(),
                fileId: Joi.objectId().required(),
                reviewText: Joi.string().trim().allow('').default(''),
                position: Joi.string().trim().required(),
                id: Joi.objectId().allow(null).default(null),

                pageId: Joi.objectId().required(),
                customize: Joi.object()
                    .keys({
                        highlight: Joi.boolean().default(false),
                        customTitle: Joi.boolean().default(false),
                        blockTitle: Joi.string().allow('').default(''),
                        layout: Joi.string()
                            .valid('overview', 'detailed')
                            .default('overview'),
                        slideshowTime: Joi.number().min(0).max(15).default(0),
                    })
                    .default({
                        highlight: false,
                        customTitle: false,
                        blockTitle: '',
                        layout: 'overview',
                        slideshowTime: 0,
                    }),
            }),
        ),
    }),
    c(
        (req) => {
            const creator = req.user;
            const {
                company,
                logo,
                fileId,
                position,
                reviewText,
                pageId,
                id,
                customize,
            } = req.body;
            return {
                creator,
                company,
                logo,
                fileId,
                position,
                reviewText,
                pageId,
                id,
                customize,
            };
        },
        portfolioV3Controllers.addBrandLogo,
        true,
    ),
    captureBlockEvent,
);

/**
 * @apiName Update brand logo
 */

router.put(
    '/testimonial/logo',
    celebrate({
        body: Joi.object().keys({
            id: Joi.objectId().required(),
            logoId: Joi.objectId().required(),
            reviewText: Joi.string().trim().allow('').default(''),
        }),
    }),
    c(
        (req) => {
            const creator = req.user;
            const { id, logoId, reviewText } = req.body;
            return {
                creator,
                id,
                logoId,
                reviewText,
            };
        },
        portfolioV3Controllers.updateBrandLogo,
        true,
    ),
    captureBlockEvent,
);

/**
 * @apiName Delete testimonial
 */

router.delete(
    '/testimonial/:testimonialId',
    celebrate({
        params: Joi.object().keys({
            testimonialId: Joi.objectId().required(),
        }),
        body: Joi.object().keys({
            id: Joi.objectId().required(),
        }),
    }),
    c(
        (req) => {
            const creator = req.user;
            const testimonialId = req.params.testimonialId;
            const { id } = req.body;
            return { creator, testimonialId, id };
        },
        portfolioV3Controllers.deleteTestimonial,
        true,
    ),
    captureBlockEvent,
);

/**
 * @apiName Update testimonial position
 */

router.post(
    '/testimonial/position/:id',
    celebrate({
        params: Joi.object().keys({
            id: Joi.objectId().required(),
        }),
        body: Joi.object().keys({
            position: Joi.string().trim().required(),
        }),
    }),
    c(
        (req) => {
            const creator = req.user;
            const id = req.params.id;
            const { position } = req.body;
            return { creator, id, position };
        },
        portfolioV3Controllers.changeTestimonialPosition,
        true,
    ),
    captureBlockEvent,
);

/**
 * @apiName Customize Testimonial block
 */

router.put(
    '/block/testimonial/customize/:id',
    celebrate({
        params: Joi.object().keys({
            id: Joi.objectId().required(),
        }),
        body: Joi.object().keys({
            highlight: Joi.boolean().default(false),
            customTitle: Joi.boolean().default(false),
            blockTitle: Joi.string().allow('').default(''),
            layout: Joi.string()
                .valid('overview', 'detailed')
                .default('overview'),
            slideshowTime: Joi.number().min(0).max(15).default(0),
        }),
    }),
    c((req) => {
        const user = req.user;
        const data = req.body;
        const { id } = req.params;
        return {
            user,
            data,
            id,
        };
    }, portfolioV3Controllers.customizeTestimonial),
);

// *** Image Block ***

/**
 * @apiName Add Image block
 */

router.post(
    '/block/image',
    celebrate({
        body: Joi.object().keys({
            pageId: Joi.objectId().required(),
            position: Joi.string().required(),
            title: Joi.string().trim().required(),
            description: Joi.string().trim().allow('').default(''),
            category: Joi.string().trim().allow('').default(''),
            tags: Joi.array().items(Joi.string().trim()).max(5).default([]),
            fileIds: Joi.array()
                .items(
                    Joi.object().keys({
                        fileId: Joi.objectId().required(),
                        thumbId: Joi.objectId().required(),
                    }),
                )
                .min(1)
                .max(C.MAX_IN_IMAGE_BLOCK)
                .required(),
            customize: Joi.object()
                .keys({
                    highlight: Joi.boolean().default(false),
                    blockFormat: Joi.string()
                        .valid('normal', 'immersive')
                        .default('normal'),
                })
                .default({
                    highlight: false,
                    blockFormat: 'normal',
                }),
        }),
    }),
    c(
        (req) => {
            const user = req.user;
            const { customize, ...data } = req.body;

            return { user, data, customize };
        },
        portfolioV3Controllers.addNewImageBlock,
        true,
    ),
    captureBlockEvent,
);

/**
 * @apiName Update Image block
 */

router.put(
    '/block/image/:id',
    celebrate({
        params: Joi.object().keys({
            id: Joi.objectId().required(),
        }),
        body: Joi.object().keys({
            title: Joi.string().trim().required(),
            description: Joi.string().trim().allow('').default(''),
            tags: Joi.array().items(Joi.string().trim()).max(5).default([]),
            category: Joi.string().trim().allow('').default(''),
            fileIds: Joi.array()
                .items(
                    Joi.object().keys({
                        fileId: Joi.objectId().required(),
                        thumbId: Joi.objectId().required(),
                    }),
                )
                .max(C.MAX_IN_IMAGE_BLOCK)
                .default([]),
            newThumbs: Joi.array()
                .items(
                    Joi.object().keys({
                        imageId: Joi.objectId().required(),
                        thumbId: Joi.objectId().required(),
                    }),
                )
                .max(C.MAX_IN_IMAGE_BLOCK)
                .default([]),
        }),
    }),
    c(
        (req) => {
            const user = req.user;
            const data = req.body;
            const id = req.params.id;
            return { id, user, data };
        },
        portfolioV3Controllers.updateImageBlock,
        true,
    ),
    captureBlockEvent,
);

/**
 * @apiName Customize Image block
 */

router.put(
    '/block/image/customize/:id',
    celebrate({
        params: Joi.object().keys({
            id: Joi.objectId().required(),
        }),
        body: Joi.object().keys({
            highlight: Joi.boolean().default(false),
        }),
    }),
    c((req) => {
        const user = req.user;
        const data = req.body;
        const { id } = req.params;
        return {
            user,
            data,
            id,
        };
    }, portfolioV3Controllers.customizeImage),
);

// **** Link Block ****

/**
 * @apiName Create link block
 */

router.post(
    '/block/link',
    celebrate({
        body: Joi.object().keys({
            pageId: Joi.objectId().required(),
            position: Joi.string().required(),
            title: Joi.string().trim().required(),
            description: Joi.string().trim().allow('').default(''),
            tags: Joi.array().items(Joi.string().trim()).max(5).default([]),
            url: Joi.string()
                .regex(
                    /[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/,
                )
                .required(),
            coverImage: Joi.string().uri().allow('').default(''),
            category: Joi.string().trim().allow('').default(''),
            fileId: Joi.objectId().allow('').default(''),
            customize: Joi.object()
                .keys({
                    highlight: Joi.boolean().default(false),
                    showLinkIcon: Joi.boolean().default(true),
                })
                .default({
                    highlight: false,
                    showLinkIcon: true,
                }),
        }),
    }),
    c(
        (req) => {
            const user = req.user;
            const { customize, ...data } = req.body;
            return { user, data, customize };
        },
        portfolioV3Controllers.addLinkBlock,
        true,
    ),
    captureBlockEvent,
);

/**
 * @apiName Update a link block
 */

router.put(
    '/block/link/:id',
    celebrate({
        params: Joi.object().keys({
            id: Joi.objectId().required(),
        }),
        body: Joi.object().keys({
            title: Joi.string().trim().required(),
            description: Joi.string().trim().allow('').default(''),
            tags: Joi.array().items(Joi.string().trim()).max(5).default([]),
            url: Joi.string()
                .regex(
                    /[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/,
                )
                .required(),
            category: Joi.string().trim().allow('').default(''),
            coverImage: Joi.string().uri().allow('').default(''),
            fileId: Joi.objectId().allow('').default(''),
        }),
    }),
    c(
        (req) => {
            const user = req.user;
            const data = req.body;
            const id = req.params.id;
            return { id, user, data };
        },
        portfolioV3Controllers.updateLinkBlock,
        true,
    ),
    captureBlockEvent,
);

/**
 * @apiName Customize link block
 */

router.put(
    '/block/link/customize/:id',
    celebrate({
        params: Joi.object().keys({
            id: Joi.objectId().required(),
        }),
        body: Joi.object().keys({
            highlight: Joi.boolean().default(false),
            showLinkIcon: Joi.boolean().default(true),
        }),
    }),
    c((req) => {
        const user = req.user;
        const data = req.body;
        const { id } = req.params;
        return {
            user,
            data,
            id,
        };
    }, portfolioV3Controllers.customizeLink),
);

// ******** Text Editor ***********

router.post(
    '/editor/content',
    celebrate({
        body: Joi.object().keys({
            pageId: Joi.objectId().required(),
        }),
    }),
    c((req) => {
        const user = req.user;
        const { pageId } = req.body;
        return { user, pageId };
    }, portfolioV3Controllers.createTextEditor),
);

/**
 * @apiName Save content of text editor
 * @description This is a multipart/form-data request, handled by multer
 */

router.post(
    '/editor/save',
    upload.none(),
    celebrate({
        body: Joi.object().keys({
            content: Joi.string().required(),
            id: Joi.objectId().required(),
        }),
    }),
    c((req) => {
        const user = req.user;
        const { id, content } = req.body;
        return { user, content, id };
    }, portfolioV3Controllers.saveTextEditorContent),
);

/**
 * @apiName Add Image to text editor
 */

router.post(
    '/editor/image',
    celebrate({
        body: Joi.object().keys({
            fileIds: Joi.array().items(Joi.objectId()).required(),
            id: Joi.objectId().required(),
        }),
    }),
    c((req) => {
        const user = req.user;
        const { fileIds, id } = req.body;
        return { user, fileIds, id };
    }, portfolioV3Controllers.addImageToTextEditor),
);

/**
 * @apiName Delete Image from text editor
 */

router.delete(
    '/editor/image',
    celebrate({
        body: Joi.object().keys({
            imageIds: Joi.array().items(Joi.objectId()).required(),
            id: Joi.objectId().required(),
        }),
    }),
    c((req) => {
        const { imageIds, id } = req.body;
        const user = req.user;
        return { user, imageIds, id };
    }, portfolioV3Controllers.deleteImagesFromTextEditor),
);

// ******** Project Block *********

/**
 * @apiName Initialize new project block
 */

/* router.post(
    '/block/project/init',
    celebrate({
        body: Joi.object().keys({
            position: Joi.string().required(),
        }),
    }),
    c((req) => {
        const user = req.user;
        const position = req.body.position;
        return { user, position };
    }, portfolioV3Controllers.initializeProjectBlock),
);
 */

/**
 * @apiName Create project block
 */

router.post(
    '/block/project',
    celebrate({
        body: Joi.object().keys({
            pageId: Joi.objectId().required(),
            position: Joi.string().required(),
            title: Joi.string().trim().required(),
            description: Joi.string().trim().allow('').default(''),
            category: Joi.string().trim().allow('').default(''),
            tags: Joi.array().items(Joi.string().trim()).max(5).default([]),
            coverImage: Joi.string().allow('').default(''),
            customize: Joi.object()
                .keys({
                    highlight: Joi.boolean().default(false),
                })
                .default({
                    highlight: false,
                }),
        }),
    }),
    c(
        (req) => {
            const user = req.user;
            const { customize, ...data } = req.body;
            return { user, data, customize };
        },
        portfolioV3Controllers.createProjectBlock,
        true,
    ),
    captureBlockEvent,
);

/**
 * @apiName Save content and/or update project block
 * @description This is a multipart/form-data request, handled by multer
 */

router.post(
    '/block/project/:id',
    upload.none(),
    celebrate({
        params: Joi.object().keys({
            id: Joi.objectId().required(),
        }),
        body: Joi.object().keys({
            title: Joi.string().trim().required(),
            description: Joi.string().trim().allow('').default(''),
            category: Joi.string().trim().allow('').default(''),
            tags: Joi.array().items(Joi.string().trim()).max(5).default([]),
            content: Joi.string().trim().allow(''),
            coverImage: Joi.string().allow('').default(''),
        }),
    }),
    c(
        (req) => {
            const user = req.user;
            const data = req.body;
            const id = req.params.id;
            return { user, id, data };
        },
        portfolioV3Controllers.saveProjectBlock,
        true,
    ),
    captureBlockEvent,
);

/**
 * @apiName Customize Project block block
 */

router.put(
    '/block/project/customize/:id',
    celebrate({
        params: Joi.object().keys({
            id: Joi.objectId().required(),
        }),
        body: Joi.object().keys({
            highlight: Joi.boolean().default(false),
        }),
    }),
    c((req) => {
        const user = req.user;
        const data = req.body;
        const { id } = req.params;
        return {
            user,
            data,
            id,
        };
    }, portfolioV3Controllers.customizeProject),
);

/**
 * @apiName Add Image to project Block
 */

router.post(
    '/block/project/image/:id',
    celebrate({
        params: Joi.object().keys({
            id: Joi.objectId().required(),
        }),
        body: Joi.object().keys({
            fileIds: Joi.array().items(Joi.objectId()).required(),
        }),
    }),
    c(
        (req) => {
            const user = req.user;
            const { fileIds } = req.body;
            const id = req.params.id;
            return { user, fileIds, id };
        },
        portfolioV3Controllers.addImageToBlock,
        true,
    ),
    captureBlockEvent,
);

/**
 * @apiName Delete Image from block (image or project)
 */

router.delete(
    '/block/delete-images/:id',
    celebrate({
        params: Joi.object().keys({
            id: Joi.objectId().required(),
        }),
        body: Joi.object().keys({
            imageIds: Joi.array().items(Joi.objectId()).required(),
        }),
    }),
    c(
        (req) => {
            const { imageIds } = req.body;
            const { id } = req.params;
            const user = req.user;
            return { user, imageIds, id };
        },
        portfolioV3Controllers.deleteImagesFromBlock,
        true,
    ),
    captureBlockEvent,
);

// ******* Experience ******

// Experience can be:
// 1. A block in a page. // Experience is treated as a block but has a fixed position on the portfolio on each page
// 2. Part of user details in user schema
// These APIs work for both

// If page id was provided we are performing operation on experience block on a page
// otherwise performing operation in user schema

/**
 * @apiName Add new experience
 */

router.post(
    '/block/experience',
    celebrate({
        body: Joi.object().keys({
            id: Joi.objectId().allow('', null).default(''),
            pageId: Joi.objectId().allow('', null),
            company: Joi.string().trim().max(100).required(),
            isWorkingHere: Joi.boolean().default(false),
            start: Joi.date().required(),
            end: Joi.when('isWorkingHere', {
                is: true,
                then: Joi.date().valid('', null),
                otherwise: Joi.date().required(),
            }),
            designation: Joi.string().max(80).trim().required(),
            logo: Joi.string().uri().allow('').default(''),
            fileId: Joi.objectId().allow('').default(''),
            position: Joi.string().required(),
            description: Joi.string().allow(null, '').default(''),
            customize: Joi.object()
                .keys({
                    highlight: Joi.boolean().default(false),
                    customTitle: Joi.boolean().default(false),
                    blockTitle: Joi.string().max(50).allow('').default(''),
                })
                .default({
                    highlight: false,
                    customTitle: false,
                    blockTitle: '',
                }),
        }),
    }),
    c((req) => {
        const user = req.user;
        const { id, pageId, customize, ...data } = req.body;
        return { user, data, pageId, id, customize };
    }, portfolioV3Controllers.addExperience),
);

/**
 * @apiName Update experience
 */

router.put(
    '/block/experience/:expId',
    celebrate({
        params: Joi.object().keys({
            expId: Joi.objectId().required(),
        }),
        body: Joi.object().keys({
            id: Joi.objectId().allow('', null).default(''),
            pageId: Joi.objectId().allow('', null),
            company: Joi.string().trim().max(100).required(),
            isWorkingHere: Joi.boolean().default(false),
            start: Joi.date().required(),
            end: Joi.when('isWorkingHere', {
                is: true,
                then: Joi.date().valid('', null),
                otherwise: Joi.date().required(),
            }),
            designation: Joi.string().max(80).trim().required(),
            logo: Joi.string().uri().allow('').default(''),
            fileId: Joi.objectId().allow('').default(''),
            description: Joi.string().allow(null, '').default(''),
        }),
    }),
    c((req) => {
        const { id, pageId, ...data } = req.body;
        const user = req.user;
        const expId = req.params.expId;
        return { id, expId, data, user, pageId };
    }, portfolioV3Controllers.updateExperience),
);

/**
 * @apiName Update Experience position
 */

router.put(
    '/block/experience/position/:expId',
    celebrate({
        params: Joi.object().keys({
            expId: Joi.objectId().required(),
        }),
        body: Joi.object().keys({
            id: Joi.objectId().allow('', null).default(''),
            position: Joi.string().required(),
            pageId: Joi.objectId().allow('', null),
        }),
    }),
    c((req) => {
        const user = req.user;
        const expId = req.params.expId;
        const { position, pageId, id } = req.body;
        return { user, expId, id, position, pageId };
    }, portfolioV3Controllers.updateExperiencePosition),
);

/**
 * @apiName Customize Experience block
 */

router.put(
    '/block/experience/customize/:id',
    celebrate({
        params: Joi.object().keys({
            id: Joi.objectId().required(),
        }),
        body: Joi.object().keys({
            highlight: Joi.boolean().default(false),
            customTitle: Joi.boolean().default(false),
            blockTitle: Joi.string().max(50).allow('').default(''),
        }),
    }),
    c((req) => {
        const user = req.user;
        const data = req.body;
        const { id } = req.params;
        return {
            user,
            data,
            id,
        };
    }, portfolioV3Controllers.customizeExperience),
);

/**
 * @apiName Delete Experience
 */

router.delete(
    '/block/experience/:expId',
    celebrate({
        params: Joi.object().keys({
            expId: Joi.objectId().required(),
        }),
        body: Joi.object().keys({
            id: Joi.objectId().allow('', null).default(''),
            pageId: Joi.objectId().allow('', null),
        }),
    }),
    c((req) => {
        const user = req.user;
        const expId = req.params.expId;
        const { pageId, id } = req.body;
        return { user, expId, id, pageId };
    }, portfolioV3Controllers.deleteExperience),
);

// ******* Service Block **********

/**
 * @apiName Add new service block
 */

router.post(
    '/block/service',
    celebrate({
        body: Joi.object().keys({
            pageId: Joi.objectId().required(),
            position: Joi.string().required(),
            title: Joi.string().trim().required(),
            description: Joi.string().trim().required(),
            tags: Joi.array().items(Joi.string().trim()).max(5).default([]),
            feesType: Joi.string()
                .valid(...Object.values(C.SERVICE_BLOCK_FEES_TYPE))
                .required(),
            currency: Joi.string().required(),
            price: Joi.when('feesType', {
                is: 'contact',
                then: Joi.number().min(0).max(900000000).required(),
                otherwise: Joi.number().min(1).max(900000000).required(),
            }),
            rateUnit: Joi.when('feesType', {
                is: 'rate',
                then: Joi.string()
                    .valid(...Object.values(C.SERVICE_BLOCK_RATE_UNIT))
                    .required(),
                otherwise: Joi.string()
                    .valid(null, '')
                    .error(
                        new Joi.ValidationError(
                            'rateUnit is not required if feesType is contact/fixed/prepaid',
                        ),
                    ),
            }),
            calendly: Joi.string()
                .regex(
                    /^(http(s)?:\/\/)?([\w]+\.)?calendly\.com\/[a-zA-Z0-9-_]+\/?[a-zA-Z0-9-_]*/,
                )
                .allow(''),
            deliveryTime: Joi.string().default(''),
            customMessage: Joi.string().max(300).allow('').default(''),
            askMoreFields: Joi.array()
                .items(
                    Joi.string().valid(
                        ...Object.values(C.SERVICE_BLOCK_ASK_MORE),
                    ),
                )
                .default([]),
            customize: Joi.object()
                .keys({
                    highlight: Joi.boolean().default(false),
                    customTitle: Joi.boolean().default(false),
                    gitTitle: Joi.string().allow('').default(''),
                    calendlyTitle: Joi.string().allow('').default(''),
                })
                .default({
                    highlight: false,
                    customTitle: false,
                    gitTitle: '',
                    calendlyTitle: '',
                }),
        }),
    }),
    c(
        (req) => {
            const { customize, ...data } = req.body;
            const user = req.user;
            return { user, data, customize };
        },
        portfolioV3Controllers.addServiceBlock,
        true,
    ),
    captureBlockEvent,
);

/**
 * @apiName Update existing service block
 */
router.put(
    '/block/service/:id',
    celebrate({
        body: Joi.object().keys({
            title: Joi.string().trim().required(),
            description: Joi.string().trim().required(),
            tags: Joi.array().items(Joi.string().trim()).max(5).default([]),
            feesType: Joi.string()
                .valid(...Object.values(C.SERVICE_BLOCK_FEES_TYPE))
                .required(),
            currency: Joi.string().required(),
            price: Joi.when('feesType', {
                is: 'contact',
                then: Joi.number().min(0).max(900000000).required(),
                otherwise: Joi.number().min(1).max(900000000).required(),
            }),
            rateUnit: Joi.when('feesType', {
                is: 'rate',
                then: Joi.string()
                    .valid(...Object.values(C.SERVICE_BLOCK_RATE_UNIT))
                    .required(),
                otherwise: Joi.string()
                    .valid(null, '')
                    .error(
                        new Joi.ValidationError(
                            'rateUnit is not required if feesType is contact/fixed/prepaid',
                        ),
                    ),
            }),
            calendly: Joi.string()
                .regex(
                    /^(http(s)?:\/\/)?([\w]+\.)?calendly\.com\/[a-zA-Z0-9-_]+\/?[a-zA-Z0-9-_]*/,
                )
                .allow(''),
            deliveryTime: Joi.string().default(''),
            customMessage: Joi.string().max(300).allow('').default(''),
            askMoreFields: Joi.array()
                .items(
                    Joi.string().valid(
                        ...Object.values(C.SERVICE_BLOCK_ASK_MORE),
                    ),
                )
                .default([]),
        }),
    }),
    c(
        (req) => {
            const data = req.body;
            const user = req.user;
            const id = req.params.id;
            return { id, data, user };
        },
        portfolioV3Controllers.updateServiceBlock,
        true,
    ),
    captureBlockEvent,
);

/**
 * @apiName Update managed imported service block
 */

router.put(
    '/block/managed-service/:id',
    celebrate({
        body: Joi.object().keys({
            title: Joi.string().trim().required(),
            description: Joi.string().trim().required(),
            tags: Joi.array().items(Joi.string().trim()).default([]),
            feesType: Joi.string()
                .valid(...Object.values(C.SERVICE_BLOCK_FEES_TYPE))
                .required(),
            currency: Joi.string().required(),
            price: Joi.when('feesType', {
                is: 'contact',
                then: Joi.number().min(0).max(900000000).required(),
                otherwise: Joi.number().min(1).max(900000000).required(),
            }),
            rateUnit: Joi.when('feesType', {
                is: 'rate',
                then: Joi.string()
                    .valid(...Object.values(C.SERVICE_BLOCK_RATE_UNIT))
                    .required(),
                otherwise: Joi.string()
                    .valid(null, '')
                    .error(
                        new Joi.ValidationError(
                            'rateUnit is not required if feesType is contact/fixed/prepaid',
                        ),
                    ),
            }),
            calendly: Joi.string()
                .regex(
                    /^(http(s)?:\/\/)?([\w]+\.)?calendly\.com\/[a-zA-Z0-9-_]+\/?[a-zA-Z0-9-_]*/,
                )
                .allow(''),
            deliveryTime: Joi.string().default(''),
            customMessage: Joi.string().max(300).allow('').default(''),
            askMoreFields: Joi.array()
                .items(
                    Joi.string().valid(
                        ...Object.values(C.SERVICE_BLOCK_ASK_MORE),
                    ),
                )
                .default([]),
        }),
    }),
    c(
        (req) => {
            const data = req.body;
            const user = req.user;
            const id = req.params.id;
            return { id, data, user };
        },
        portfolioV3Controllers.updateManagedImported,
        true,
    ),
    captureBlockEvent,
);

/**
 * @apiName Fetch services grouped by page
 */

router.get(
    '/block/services',
    c((req) => {
        const user = req.user;
        return { user };
    }, portfolioV3Controllers.fetchEachPageServices),
);

/**
 * @apiName Customize Service block
 */

router.put(
    '/block/service/customize/:id',
    celebrate({
        params: Joi.object().keys({
            id: Joi.objectId().required(),
        }),
        body: Joi.object().keys({
            highlight: Joi.boolean().default(false),
            customTitle: Joi.boolean().default(false),
            gitTitle: Joi.string().allow('').default(''),
            calendlyTitle: Joi.string().allow('').default(''),
            isCollab: Joi.boolean().default(false),
        }),
    }),
    c((req) => {
        const user = req.user;
        const data = req.body;
        const { id } = req.params;
        return {
            user,
            data,
            id,
        };
    }, portfolioV3Controllers.customizeService),
);

// ****** PDF Block ********

/**
 * @apiName Add new PDF Block
 */
router.post(
    '/block/pdf',
    celebrate({
        body: Joi.object().keys({
            pageId: Joi.objectId().required(),
            position: Joi.string().required(),
            title: Joi.string().trim().required(),
            description: Joi.string().trim().allow('').default(''),
            tags: Joi.array().items(Joi.string().trim()).max(5).default([]),
            category: Joi.string().trim().allow('').default(''),
            fileId: Joi.objectId().required(),
            coverId: Joi.objectId().required(),
            customize: Joi.object()
                .keys({
                    highlight: Joi.boolean().default(false),
                })
                .default({
                    highlight: false,
                }),
        }),
    }),
    c(
        (req) => {
            const user = req.user;
            const { customize, ...data } = req.body;
            return { user, data, customize };
        },
        portfolioV3Controllers.addUpdatePdfBlock,
        true,
    ),
    captureBlockEvent,
);

/**
 * @apiName Update existing PDF block
 */
router.put(
    '/block/pdf/:id',
    celebrate({
        params: Joi.object().keys({
            id: Joi.objectId().required(),
        }),
        body: Joi.alternatives(
            // If we want to update file, we should also update cover image
            Joi.object().keys({
                title: Joi.string().trim().required(),
                description: Joi.string().trim().allow('').default(''),
                tags: Joi.array().items(Joi.string().trim()).max(5).default([]),
                category: Joi.string().trim().allow('').default(''),
                fileId: Joi.objectId().required(),
                coverId: Joi.objectId().required(),
            }),
            // We are not updating file, only other details
            Joi.object().keys({
                title: Joi.string().trim().required(),
                description: Joi.string().trim().allow('').default(''),
                tags: Joi.array().items(Joi.string().trim()).max(5).default([]),
                category: Joi.string().trim().allow('').default(''),
            }),
        ),
    }),
    c(
        (req) => {
            const user = req.user;
            const data = req.body;
            const id = req.params.id;
            return { user, data, id };
        },
        portfolioV3Controllers.addUpdatePdfBlock,
        true,
    ),
    captureBlockEvent,
);

/**
 * @apiName Customize PDF block block
 */

router.put(
    '/block/pdf/customize/:id',
    celebrate({
        params: Joi.object().keys({
            id: Joi.objectId().required(),
        }),
        body: Joi.object().keys({
            highlight: Joi.boolean().default(false),
        }),
    }),
    c((req) => {
        const user = req.user;
        const data = req.body;
        const { id } = req.params;
        return {
            user,
            data,
            id,
        };
    }, portfolioV3Controllers.customizePdf),
);

// ******* Page Break Block *******

/**
 * @apiName Create Page Break block
 */

router.post(
    '/block/page-break',
    celebrate({
        body: Joi.object().keys({
            pageId: Joi.objectId().required(),
            position: Joi.string().required(),
            title: Joi.string().allow('').default(''),
            breakType: Joi.string()
                .valid(...Object.values(C.PAGE_BREAK_TYPES))
                .required(),
        }),
    }),
    c(
        (req) => {
            const user = req.user;
            const data = req.body;
            return {
                user,
                data,
            };
        },
        portfolioV3Controllers.addPageBreak,
        true,
    ),
    captureBlockEvent,
);

/**
 * @apiName Update page break block
 */

router.put(
    '/block/page-break/:id',
    celebrate({
        params: Joi.object().keys({
            id: Joi.objectId().required(),
        }),
        body: Joi.object().keys({
            title: Joi.string().allow('').default(''),
            breakType: Joi.string()
                .valid(...Object.values(C.PAGE_BREAK_TYPES))
                .allow('', null)
                .default(null),
            breakHeight: Joi.string()
                .valid(...Object.values(C.PAGE_BREAK_HEIGHT))
                .allow('', null)
                .default(null),
            textAlign: Joi.string()
                .valid(...Object.values(C.PAGE_BREAK_TEXT_ALIGN))
                .allow('', null)
                .default(null),
            textFont: Joi.string()
                .valid(...Object.values(C.PAGE_BREAK_TEXT_FONT))
                .allow('', null)
                .default(null),
            textSize: Joi.string()
                .valid(...Object.values(C.PAGE_BREAK_TEXT_SIZE))
                .allow('', null)
                .default(null),
            textStyle: Joi.string()
                .valid(...Object.values(C.PAGE_BREAK_TEXT_STYLE))
                .allow('', null)
                .default(null),
            italics: Joi.boolean().allow(null, '').default(null),
            bold: Joi.boolean().allow(null, '').default(null),
            layout: Joi.string()
                .valid(...Object.values(C.PORTFOLIO_LAYOUT))
                .allow('', null),
        }),
    }),
    c(
        (req) => {
            const user = req.user;
            const { id } = req.params;
            const data = req.body;
            return { id, user, data };
        },
        portfolioV3Controllers.updatePageBreak,
        true,
    ),
    captureBlockEvent,
);

// ******* Common block APIs ******

/**
 * @apiName Uddate Block Position
 */

router.put(
    '/block/position/:id',
    celebrate({
        params: Joi.object().keys({
            id: Joi.objectId().required(),
        }),
        body: Joi.object().keys({
            position: Joi.string().required(),
        }),
    }),
    c(
        (req) => {
            const user = req.user;
            const id = req.params.id;
            const position = req.body.position;
            return { user, id, position };
        },
        portfolioV3Controllers.updateBlockPosition,
        true,
    ),
    captureBlockEvent,
);

/**
 * @apiName Show / hide block
 */

router.put(
    '/block/visibility/:id',
    celebrate({
        params: Joi.object().keys({
            id: Joi.objectId().required(),
        }),
        body: Joi.object().keys({
            hidden: Joi.boolean().default(false),
            position: Joi.when('hidden', {
                is: false,
                then: Joi.string().required(),
                otherwise: Joi.string().valid('', null).default(''),
            }),
        }),
    }),
    c((req) => {
        const user = req.user;
        const { id } = req.params;
        const { hidden, position } = req.body;
        return { user, id, hidden, position };
    }, portfolioV3Controllers.changeBlockVisibility),
);

/**
 * @apiName Change page of block
 */

router.put(
    '/block/page/:id',
    celebrate({
        params: Joi.object().keys({
            id: Joi.objectId().required(),
        }),
        body: Joi.object().keys({
            pageId: Joi.objectId().required(),
            position: Joi.string().required(),
        }),
    }),
    c(
        (req) => {
            const user = req.user;
            const { id } = req.params;
            const { pageId, position } = req.body;
            return {
                user,
                id,
                pageId,
                position,
            };
        },
        portfolioV3Controllers.changePageOfBlock,
        true,
    ),
    captureBlockEvent,
);

/**
 * @apiName Delete Block of any type
 */

router.delete(
    '/block/:id',
    celebrate({
        params: Joi.object().keys({
            id: Joi.objectId().required(),
        }),
    }),
    c(
        (req) => {
            const { id } = req.params;
            const user = req.user;
            return { user, id };
        },
        portfolioV3Controllers.deleteBlock,
        true,
    ),
    captureBlockEvent,
);

/**
 * @apiName Fetch Single Block by id
 */

router.get(
    '/block/:id',
    celebrate({
        params: Joi.object().keys({
            id: Joi.objectId().required(),
        }),
    }),

    c((req) => {
        const id = req.params.id;
        const user = req.user;
        return { user, id };
    }, commonControllers.getSingleBlock),
);

module.exports = router;

const router = require('express').Router();
const { celebrate, Joi } = require('celebrate');
Joi.objectId = require('joi-objectid')(Joi);

const c = require('./helper');
const adminController = require('../controllers/admin');
const genController = require('../controllers/general');
const C = require('../lib/constants');
const { badgeImageUpload } = require('../services/file-upload');
const moment = require('moment');

const ROLES_VALUES = Object.values(C.ROLES);
const {
    JOB_BOARD_EMPLOYMENT_TYPES,
    JOB_BOARD_SENIORITY_LEVELS,
    JOB_BOARD_DURATION_UNITS,
    JOB_BOARD_RENUMERATION_UNITS,
    JOB_BOARD_OPPORTUNITY_STATES,
    JOB_BOARD_APPLICATION_STATES,
} = require('../lib/constants');

router.get(
    '/roles',
    c(() => {}, adminController.getUserRoles),
);

/**
 * @version 2.1
 * Creator/Client invite only approval APIs
 */
router.put(
    '/user/approve',
    celebrate({
        body: Joi.object().keys({
            email: Joi.string().email().required(),
            role: Joi.string()
                .valid(C.ROLES.WRITER_C, C.ROLES.CLIENT_C)
                .required(),
        }),
    }),
    c((req) => {
        const { email, role } = req.body;
        return { email, role };
    }, adminController.approveUserSignup),
);
// Approve jobs under review
// Suggest creators to job
router.put(
    '/job/approve',
    celebrate({
        body: Joi.object().keys({
            jobId: Joi.objectId().required(),
            creatorIds: Joi.array().unique().items(Joi.objectId()).default([]),
        }),
    }),
    c((req) => {
        const { jobId, creatorIds } = req.body;
        return { jobId, creatorIds };
    }, adminController.approveJob),
);

// Suggest creators to approved jobs
router.put(
    '/job/suggest',
    celebrate({
        body: Joi.object().keys({
            jobId: Joi.objectId().required(),
            creatorIds: Joi.array().unique().items(Joi.objectId()).default([]),
        }),
    }),
    c((req) => {
        const { jobId, creatorIds } = req.body;
        return { jobId, creatorIds };
    }, adminController.suggestCreatorsToJob),
);

router.post(
    '/creator/report/:id',
    celebrate({
        params: Joi.object().keys({
            id: Joi.objectId().required(),
        }),
        body: Joi.object().keys({
            earning: Joi.string().trim().required(),
            charges: Joi.string().trim().required(),
            note: Joi.string().trim().required(),
        }),
    }),
    c((req) => {
        const { id } = req.params;
        const data = req.body;
        return {
            id,
            data,
        };
    }, adminController.setCreatorReport),
);

// ? Create new user via Admin
router.post(
    '/users',
    (req, res, next) => {
        const {
            firstName,
            lastName,
            role,
            email,
            password,
            company,
            mobile,
            category,
        } = req.body;
        // tow JOI schemas
        let schema = {};
        if (
            role === C.ROLES.CSM_C ||
            role === C.ROLES.ME_C ||
            role === C.ROLES.SA_C
        ) {
            schema = Joi.object().keys({
                firstName: Joi.string().required(),
                lastName: Joi.string(),
                role: Joi.string()
                    .equal([...ROLES_VALUES])
                    .required(),
                email: Joi.string().email().required(),
                password: Joi.string().required(),
            });
        } else if (role === C.ROLES.CLIENT_C) {
            schema = Joi.object().keys({
                role: Joi.string().equal(C.ROLES.CLIENT_C).required(),
                email: Joi.string().email().required(),
                password: Joi.string().required(),
                mobile: Joi.string().length(10).required(),
                company: Joi.string().required(),
            });
        } else {
            schema = Joi.object().keys({
                firstName: Joi.string().required(),
                lastName: Joi.string(),
                role: Joi.string()
                    .equal([...ROLES_VALUES])
                    .required(),
                email: Joi.string().email().required(),
                password: Joi.string().required(),
                mobile: Joi.string().length(10).required(),
            });
        }

        schema = schema.options({ stripUnknown: true });

        const { error } = Joi.validate(
            {
                firstName,
                lastName,
                role,
                email,
                password,
                mobile,
                company,
                category,
            },
            schema,
        );
        // validation error
        if (error) {
            next(error);
        } else {
            next();
        }
    },
    c((req) => {
        const { id } = req.user;
        const {
            firstName,
            lastName,
            role,
            email,
            password,
            company,
            mobile,
            category,
        } = req.body;
        return {
            firstName,
            lastName,
            role,
            email,
            password,
            id,
            company,
            category,
            mobile,
        };
    }, adminController.createUserByRole),
);

router.get(
    '/users/:role',
    c((req) => {
        const { role } = req.params;
        return { role };
    }, adminController.getUsers),
);

router.get(
    '/writer/account/stats',
    c((req) => {
        const { id } = req.user;
        return { id };
    }, adminController.getWriterAccountStats),
);

router.get(
    '/writer/level/stats',
    c((req) => {
        const { id } = req.user;
        return { id };
    }, adminController.getWriterLevelStats),
);

router.get(
    '/writer/date/stats/:date',
    c((req) => {
        const { date } = req.params;
        return { date };
    }, adminController.getWriterDateStats),
);

router.put(
    '/bypass-verification',
    celebrate({
        body: Joi.object().keys({
            email: Joi.string().email().required(),
        }),
    }),
    c((req) => {
        const { email } = req.body;
        return { email };
    }, adminController.bypassVerification),
);

/* router.post(
    '/badge-image-upload',
    badgeImageUpload.single('file'),
    c((req) => {
        const sa = req.user;
        const { file } = req;
        return { sa, file };
    }, adminController.uploadBadgeImage),
); */

//Job-Board End Points
//Admin Module

//POST Opportunity Page ******************************************************

//Get All Clients
router.get(
    '/getClients',
    c(() => {}, adminController.getClientsData),
);

//Get Data of Specific Job
router.get(
    '/jobBoard/:jobId',
    celebrate({
        params: Joi.object().keys({
            jobId: Joi.objectId().required(),
        }),
    }),
    c((req) => {
        const admin = req.user;
        const { jobId } = req.params;
        return { admin, jobId };
    }, adminController.specificJob),
);

//Update Specific Job
router.put(
    '/jobBoard/edit/:jobId',
    celebrate({
        params: Joi.object().keys({
            jobId: Joi.objectId().required(),
        }),
        body: Joi.object()
            .keys({
                employmentType: Joi.string()
                    .valid(...Object.values(JOB_BOARD_EMPLOYMENT_TYPES))
                    .required(),
                title: Joi.string().required(),
                location: Joi.when('employmentType', {
                    is: JOB_BOARD_EMPLOYMENT_TYPES.PROJECT,
                    then: Joi.string().allow(''),
                    otherwise: Joi.when('remoteFriendly', {
                        is: true,
                        then: '',
                        otherwise: Joi.string().required(),
                    }),
                }),
                remoteFriendly: Joi.when('employmentType', {
                    is: JOB_BOARD_EMPLOYMENT_TYPES.PROJECT,
                    then: true,
                    otherwise: Joi.boolean().default(false).required(),
                }),
                creatorType: Joi.string()
                    .valid('DESIGNER', 'WRITER')
                    .required(),
                responsibility: Joi.string().max(600).trim().required(),

                renumeration: Joi.number().min(1).required(),
                renumerationUnit: Joi.when('employmentType', {
                    is: JOB_BOARD_EMPLOYMENT_TYPES.PROJECT,
                    then: Joi.string().valid(
                        JOB_BOARD_RENUMERATION_UNITS.PER_HOUR,
                    ),
                    otherwise: Joi.when('employmentType', {
                        is: 'full_time',
                        then: Joi.string()
                            .valid(JOB_BOARD_RENUMERATION_UNITS.PER_MONTH)
                            .required(),
                        otherwise: Joi.when('employmentType', {
                            is: 'part_time',
                            then: Joi.string()
                                .valid(
                                    ...Object.values(
                                        JOB_BOARD_RENUMERATION_UNITS,
                                    ),
                                )
                                .required(),
                            otherwise: Joi.string().allow(null, ''),
                        }),
                    }),
                }),

                contentPiecesQty: Joi.when('employmentType', {
                    is: Joi.string()
                        .valid(JOB_BOARD_EMPLOYMENT_TYPES.PROJECT)
                        .required(),
                    then: Joi.number().min(1).required(),
                    otherwise: Joi.number().valid(null, '', 0),
                }),
                openings: Joi.number().min(1).required(),
                deadline: Joi.date()
                    .greater(
                        new Date(moment().add(1, 'd').minutes(0).seconds(0)),
                    )
                    .less(
                        new Date(moment().add(45, 'd').minutes(0).seconds(0)),
                    ),
                ques1: Joi.string().required(),
                ques2: Joi.string().allow(''),
                category: Joi.string().valid('Marketing').required(),
                jobTags: Joi.array().items(Joi.string()),
                seniority: Joi.when('employmentType', {
                    is: JOB_BOARD_EMPLOYMENT_TYPES.FULL_TIME,
                    then: Joi.string()
                        .valid(...Object.values(JOB_BOARD_SENIORITY_LEVELS))
                        .required(),
                    otherwise: Joi.string().allow('', null),
                }),
                preferredQualifications: Joi.when('employmentType', {
                    is: JOB_BOARD_EMPLOYMENT_TYPES.PROJECT,
                    then: Joi.string().allow('', null),
                    otherwise: Joi.string().trim().max(600).required(),
                }),
                // What if admin reopens closed opportunity ?
                status: Joi.string()
                    .valid('active', 'inactive', 'closed')
                    .allow(null, ''),
            })
            .unknown(true),
    }),
    c((req) => {
        const admin = req.user;
        const { jobId } = req.params;
        const reqBody = req.body;
        console.log(reqBody);
        return { admin, jobId, reqBody };
    }, adminController.updateSpecificJob),
);

//Add Jobs
router.post(
    '/jobBoard',
    celebrate({
        body: Joi.object()
            .keys({
                client: Joi.objectId().required(),
                employmentType: Joi.string()
                    .valid(...Object.values(JOB_BOARD_EMPLOYMENT_TYPES))
                    .required(),
                title: Joi.string().required(),
                location: Joi.when('employmentType', {
                    is: JOB_BOARD_EMPLOYMENT_TYPES.PROJECT,
                    then: Joi.string().allow(''),
                    otherwise: Joi.when('remoteFriendly', {
                        is: true,
                        then: '',
                        otherwise: Joi.string().required(),
                    }),
                }),
                remoteFriendly: Joi.when('employmentType', {
                    is: JOB_BOARD_EMPLOYMENT_TYPES.PROJECT,
                    then: true,
                    otherwise: Joi.boolean().default(false).required(),
                }),
                creatorType: Joi.string()
                    .valid('DESIGNER', 'WRITER')
                    .required(),
                responsibility: Joi.string().max(600).trim().required(),

                renumeration: Joi.number().min(1).required(),
                renumerationUnit: Joi.when('employmentType', {
                    is: JOB_BOARD_EMPLOYMENT_TYPES.PROJECT,
                    then: Joi.string().valid(
                        JOB_BOARD_RENUMERATION_UNITS.PER_HOUR,
                    ),
                    otherwise: Joi.when('employmentType', {
                        is: 'full_time',
                        then: Joi.string()
                            .valid(JOB_BOARD_RENUMERATION_UNITS.PER_MONTH)
                            .required(),
                        otherwise: Joi.when('employmentType', {
                            is: 'part_time',
                            then: Joi.string()
                                .valid(
                                    ...Object.values(
                                        JOB_BOARD_RENUMERATION_UNITS,
                                    ),
                                )
                                .required(),
                            otherwise: Joi.string().allow(null, ''),
                        }),
                    }),
                }),

                contentPiecesQty: Joi.when('employmentType', {
                    is: Joi.string()
                        .valid(JOB_BOARD_EMPLOYMENT_TYPES.PROJECT)
                        .required(),
                    then: Joi.number().min(1).required(),
                    otherwise: Joi.number().valid(null, ''),
                }),
                openings: Joi.number().min(1).required(),
                deadline: Joi.date()
                    .greater(
                        new Date(moment().add(1, 'd').minutes(0).seconds(0)),
                    )
                    .less(
                        new Date(moment().add(45, 'd').minutes(0).seconds(0)),
                    ),
                ques1: Joi.string().required(),
                ques2: Joi.string().allow(''),
                category: Joi.string().valid('Marketing').required(),
                jobTags: Joi.array().items(Joi.string()),
                seniority: Joi.when('employmentType', {
                    is: JOB_BOARD_EMPLOYMENT_TYPES.FULL_TIME,
                    then: Joi.string()
                        .valid(...Object.values(JOB_BOARD_SENIORITY_LEVELS))
                        .required(),
                    otherwise: Joi.string().allow('', null),
                }),
                preferredQualifications: Joi.when('employmentType', {
                    is: JOB_BOARD_EMPLOYMENT_TYPES.PROJECT,
                    then: Joi.string().allow('', null),
                    otherwise: Joi.string().trim().max(600).required(),
                }),
            })
            .unknown(true),
    }),
    c((req) => {
        const admin = req.user;
        const reqArguments = req.body;
        return { admin, reqArguments };
    }, adminController.addOpportunity),
);

router.delete(
    '/posts/delete/:jobId',
    celebrate({
        params: Joi.object().keys({
            jobId: Joi.objectId().required(),
        }),
    }),
    c((req) => {
        const admin = req.user;
        const { jobId } = req.reqArguments;
        return { admin, jobId };
    }, adminController.deleteSpecificPost),
);

// Set Job as Trending / Not trending
router.put(
    '/job/trending',
    celebrate({
        body: Joi.object().keys({
            jobIds: Joi.array().required(),
            status: Joi.boolean().required(),
        }),
    }),
    c((req) => {
        const { jobIds, status } = req.body;
        return { jobIds, status };
    }, adminController.setJobTrending),
);

router.post(
    '/posts/:pageNumber/:status',
    celebrate({
        params: Joi.object().keys({
            pageNumber: Joi.number().integer().min(1).required(),
            status: Joi.string()
                .required()
                .valid(...Object.values(C.JOB_BOARD_OPPORTUNITY_STATES))
                .allow('all'),
        }),
        body: Joi.object().keys({
            sortBy: Joi.string()
                .valid('createdAt', 'updatedAt', 'deadline', '')
                .default('createdAt'),
            sortByDirection: Joi.number().integer().valid(1, -1).default(-1),
            searchBy: Joi.string()
                .valid('clients', 'title', 'location', '')
                .allow(''),
            searchValue: Joi.string().allow(''),
            remoteFriendly: Joi.boolean().allow(''),
        }),
    }),
    c((req) => {
        const admin = req.user;
        const reqArguments = req.params;
        const reqBody = req.body;
        return { admin, reqArguments, reqBody };
    }, adminController.getAllPosts),
);

//*****************************************************************************

//POST Organization Page ******************************************************
//Get All Active Industries
router.get(
    '/Industries',
    c(() => {}, genController.getIndustries),
);

//Update Specific Organization
router.put(
    '/organizations/edit/:orgId',
    celebrate({
        params: Joi.object().keys({
            orgId: Joi.objectId().required(),
        }),
        body: Joi.object().keys({
            companyLogo: Joi.string().allow(''),
            firstName: Joi.string().min(1).max(10).required(),
            lastName: Joi.string().min(1).max(10).required(),
            orgName: Joi.string().min(1).max(100).allow(''),
            orgDesc: Joi.string().min(1).max(600).allow(''),
            email: Joi.string().min(3).email().allow(''),
            mobile: Joi.string()
                .regex(/^[0-9]{10}$/)
                .allow(''),
            // cin: Joi.string().min(21).max(21).alphanum().allow(''),
            officialWebsite: Joi.string()
                .uri({
                    scheme: ['https'],
                    allowRelative: false,
                })
                .required()
                .allow(''),
            socialMediaLink: Joi.when('officialWebsite', {
                is: '',
                then: Joi.string()
                    .uri({
                        scheme: ['https'],
                        allowRelative: false,
                    })
                    .required(),
                otherwise: Joi.string()
                    .uri({
                        scheme: ['https'],
                        allowRelative: false,
                    })
                    .allow(''),
            }),
            orgSector: Joi.array().allow(''),
        }),
    }),
    c((req) => {
        const admin = req.user;
        const { orgId } = req.params;
        const reqBody = req.body;
        return { admin, orgId, reqBody };
    }, adminController.updateSpecificOrg),
);

//Get Specific Organization
router.get(
    '/organizations/:orgId',
    celebrate({
        params: Joi.object().keys({
            orgId: Joi.objectId().required(),
        }),
    }),
    c((req) => {
        const admin = req.user;
        const { orgId } = req.params;
        return { admin, orgId };
    }, adminController.specificOrg),
);

//Add Organization

router.post(
    '/organizations',
    celebrate({
        body: Joi.object().keys({
            companyLogo: Joi.string().allow(''),
            orgName: Joi.string().min(1).max(100).required(),
            firstName: Joi.string().min(1).max(10).required(),
            lastName: Joi.string().min(1).max(10).required(),
            orgDesc: Joi.string().min(1).max(600).required(),
            email: Joi.string().min(3).email(),
            mobile: Joi.string().regex(/^[0-9]{10}$/),
            // cin: Joi.string().min(21).max(21).alphanum().required(),
            officialWebsite: Joi.string()
                .uri({
                    scheme: ['https'],
                    allowRelative: false,
                })
                .required()
                .allow(''),
            socialMediaLink: Joi.when('officialWebsite', {
                is: '',
                then: Joi.string()
                    .uri({
                        scheme: ['https'],
                        allowRelative: false,
                    })
                    .required(),
                otherwise: Joi.string()
                    .uri({
                        scheme: ['https'],
                        allowRelative: false,
                    })
                    .allow(''),
            }),
            orgSector: Joi.array().required(),
            industries: Joi.array().items(Joi.objectId()).allow('', null),
        }),
    }),
    c((req) => {
        const admin = req.user;
        const reqArguments = req.body;
        return { admin, reqArguments };
    }, adminController.addOrganization),
);

//*****************************************************************************

//Admin Module GET all Reports
router.post(
    '/reports/:pageNumber/:status',
    celebrate({
        params: Joi.object().keys({
            pageNumber: Joi.number().integer().min(1).required(),
            status: Joi.string()
                .required()
                .valid(...Object.values(C.JOB_BOARD_REPORT_STATES)),
        }),
        body: Joi.object().keys({
            searchBy: Joi.string().valid('against', 'by').allow(''),
            searchValue: Joi.string().allow(''),
            sortBy: Joi.string().valid('reportedDate').allow(''),
            sortByDirection: Joi.number().integer().valid(1, -1).allow(''),
            report_type: Joi.string()
                .valid(...Object.values(C.JOB_BOARD_REPORT_TYPE))
                .allow(''),
        }),
    }),
    c((req) => {
        const admin = req.user;
        const reqBody = req.body;
        const reqArguments = req.params;
        return { admin, reqArguments, reqBody };
    }, adminController.getAllReports),
);

router.put(
    '/reports/:reportId',
    celebrate({
        params: Joi.object().keys({
            reportId: Joi.objectId().required(),
        }),
        body: Joi.object().keys({
            reportActionStatus: Joi.string()
                .required()
                .valid(...Object.values(C.JOB_BOARD_REPORT_ACTION_STATES)),
            reason: Joi.string().allow('', null),
        }),
    }),
    c((req) => {
        const admin = req.user;
        const { reportId } = req.params;
        const { reportActionStatus, reason } = req.body;
        return { admin, reportId, reportActionStatus, reason };
    }, adminController.updateSpecificReport),
);

router.delete(
    '/reports/:reportId',
    celebrate({
        params: Joi.object().keys({
            reportId: Joi.objectId().required(),
        }),
    }),
    c((req) => {
        const admin = req.user;
        const { reportId } = req.params;
        return { admin, reportId };
    }, adminController.deleteSpecificReport),
);

router.get(
    '/reports/:reportId',
    celebrate({
        params: Joi.object().keys({
            reportId: Joi.objectId().required(),
        }),
    }),
    c((req) => {
        const admin = req.user;
        const { reportId } = req.params;
        return { admin, reportId };
    }, adminController.getSpecificReport),
);

/*
//Admin Module Add Report
router.post(
    '/reports',
    celebrate({
        body: Joi.object().keys({
            against: Joi.objectId().required(),
            by: Joi.objectId().required(),
            reason: Joi.string().min(1).max(500).required(),
            report_type: Joi.string()
                .required()
                .valid([...Object.values(C.JOB_BOARD_REPORT_TYPE)]),
            postId: Joi.objectId().allow(''),
        }),
    }),
    c((req) => {
        const admin = req.user;
        const reqArguments = req.body;
        return { admin, reqArguments };
    }, adminController.addReport)
);
*/
//Admin Module GET All Posts*******************************************************

router.put(
    '/posts/ban/:jobId',
    celebrate({
        params: Joi.object().keys({
            jobId: Joi.objectId().required(),
        }),
        body: Joi.object().keys({
            reason: Joi.string().min(1).required(),
        }),
    }),
    c((req) => {
        const admin = req.user;
        const { jobId } = req.params;
        const { reason } = req.body;
        return { admin, jobId, reason };
    }, adminController.banPost),
);

router.put(
    '/posts/unban/:jobId',
    celebrate({
        params: Joi.object().keys({
            jobId: Joi.objectId().required(),
        }),
    }),
    c((req) => {
        const admin = req.user;
        const { jobId } = req.params;
        return { admin, jobId };
    }, adminController.unbanPost),
);

router.put(
    '/people/unban/:userId/:userType',
    celebrate({
        params: Joi.object().keys({
            userId: Joi.objectId().required(),
            userType: Joi.string()
                .valid('Other', 'Client', 'Writer')
                .required(),
        }),
    }),
    c((req) => {
        const admin = req.user;
        const reqArguments = req.params;
        return { admin, reqArguments };
    }, adminController.unBanPeople),
);

router.put(
    '/people/ban/:userId/:userType',
    celebrate({
        params: Joi.object().keys({
            userId: Joi.objectId().required(),
            userType: Joi.string()
                .valid('Other', 'Client', 'Writer')
                .required(),
        }),
        body: Joi.object().keys({
            reason: Joi.string().min(1).required(),
        }),
    }),
    c((req) => {
        const admin = req.user;
        const reqArguments = req.params;
        const { reason } = req.body;
        return { admin, reqArguments, reason };
    }, adminController.banPeople),
);

router.put(
    '/people/caution/:peopleId',
    celebrate({
        params: Joi.object().keys({
            peopleId: Joi.objectId().required(),
        }),
        body: Joi.object().keys({
            reason: Joi.string().min(1).required(),
        }),
    }),
    c((req) => {
        const admin = req.user;
        const { peopleId } = req.params;
        const { reason } = req.body;
        return { admin, peopleId, reason };
    }, adminController.cautionSpecificPeople),
);

//********************************************************************************* */

//Admin Module GET All Clients*******************************************************
router.post(
    '/clients/:pageNumber/:status',
    celebrate({
        params: Joi.object().keys({
            pageNumber: Joi.number().integer().min(1).required(),
            status: Joi.string()
                .required()
                .valid(...Object.values(C.ACCOUNT_STATUS))
                .allow('all'),
        }),
        body: Joi.object().keys({
            searchBy: Joi.string().valid('email', 'name').allow(''),
            searchValue: Joi.string().allow(''),
            sortBy: Joi.string()
                .valid('noOfPosts', 'noOfApplications')
                .allow(''),
            sortByDirection: Joi.number().integer().valid(1, -1).allow(''),
        }),
    }),
    c((req) => {
        const admin = req.user;
        const reqArguments = req.params;
        const reqBody = req.body;
        return { admin, reqArguments, reqBody };
    }, adminController.getAllClients),
);

// > Get Client Name And Id

router.post(
    '/client-list',
    celebrate({
        body: Joi.object().keys({
            searchValue: Joi.string().allow(''),
        }),
    }),
    c((req) => {
        const searchValue = req.body.searchValue;
        return { searchValue };
    }, adminController.getClientsNameAndId),
);

//Admin Module GET All People
router.post(
    '/people/:pageNumber/:status',
    celebrate({
        params: Joi.object().keys({
            pageNumber: Joi.number().integer().min(1).required(),
            status: Joi.string()
                .required()
                .valid(...Object.values(C.ACCOUNT_STATUS))
                .allow('all', 'Onboarded', 'Not Onboarded'),
        }),
        body: Joi.object().keys({
            role: Joi.string()
                .valid(...Object.values(C.ROLES))
                .allow(null),
            searchBy: Joi.string().valid('email', 'name').allow(''),
            searchValue: Joi.string().allow(''),
            sortBy: Joi.string()
                .valid('noOfApplications', 'lastActive', 'loginCount')
                .allow(''),
            sortByDirection: Joi.number().integer().valid(1, -1).default(-1),
            pfSubmitted: Joi.boolean().allow(null),
            creatorLevel: Joi.number().min(1).max(3).allow(null),
        }),
    }),
    c((req) => {
        const admin = req.user;
        const reqArguments = req.params;
        const reqBody = req.body;
        return { admin, reqArguments, reqBody };
    }, adminController.getAllPeople),
);

router.post(
    '/people/search',
    celebrate({
        body: Joi.object().keys({
            role: Joi.string()
                .valid(C.ROLES.WRITER_C, C.ROLES.CLIENT_C)
                .required(),
            searchString: Joi.string().required(),
            classified: Joi.boolean().allow(null),
        }),
    }),
    c((req) => {
        const admin = req.user;
        const { role, searchString, classified } = req.body;
        return { role, searchString, classified };
    }, adminController.searchPeople),
);

router.put(
    '/people/level',
    celebrate({
        body: Joi.object().keys({
            writerId: Joi.objectId().required(),
            level: Joi.number().valid(...Object.values(C.CREATOR_LEVEL)),
        }),
    }),
    c((req) => {
        const { writerId, level } = req.body;
        return { writerId, level };
    }, adminController.setLevelOfWriter),
);

router.get(
    '/people/:peopleId',
    celebrate({
        params: Joi.object().keys({
            peopleId: Joi.objectId().required(),
        }),
    }),
    c((req) => {
        const admin = req.user;
        const { peopleId } = req.params;
        return { admin, peopleId };
    }, adminController.getSpecificPeople),
);

router.delete(
    '/people/:peopleId',
    celebrate({
        params: Joi.object().keys({
            peopleId: Joi.objectId().required(),
        }),
    }),
    c((req) => {
        const admin = req.user;
        const { peopleId } = req.params;
        return { admin, peopleId };
    }, adminController.deleteSpecificPeople),
);

// ************* Chat routes **************

router.post(
    '/chat/messages',
    celebrate({
        body: Joi.object().keys({
            clientId: Joi.objectId().required(),
            creatorId: Joi.objectId().required(),
            cursor: Joi.string()
                .min(24)
                .regex(/[a-z0-9]/)
                .default(''),
            limit: Joi.number().min(1).default(20),
            direction: Joi.string()
                .valid('forward', 'backward')
                .default('forward'),
        }),
    }),
    c((req) => {
        const { clientId, creatorId, cursor, limit, direction } = req.body;
        return { clientId, creatorId, cursor, limit, direction };
    }, adminController.getMessages),
);

router.post(
    '/user/transactions',
    celebrate({
        body: Joi.object().keys({
            status: Joi.string()
                .valid(...Object.values(C.INVOICE_STATES))
                .default(''),
            mode: Joi.string()
                .valid(...Object.values(C.INVOICE_MODE))
                .default(''),
        }),
    }),
    c((req) => {
        const { status, mode } = req.body;
        return {
            status,
            mode,
        };
    }, adminController.getAllTransactions),
);

router.get(
    '/test',
    c(() => {}, adminController.testAPI),
);

router.post(
    '/industry',
    celebrate({
        body: Joi.object().keys({
            name: Joi.string().required(),
            value: Joi.string().required(),
        }),
    }),
    c((req) => {
        const { name, value } = req.body;
        return { name, value };
    }, adminController.addNewIndustry),
);

router.put(
    '/industry/:id/:status',
    celebrate({
        params: Joi.object().keys({
            id: Joi.objectId().required(),
            status: Joi.string().valid(...Object.values(C.INDUSTRY_STATUS)),
        }),
    }),
    c((req) => {
        const { id, status } = req.params;
        return { id, status };
    }, adminController.setIndustryStatus),
);

module.exports = router;

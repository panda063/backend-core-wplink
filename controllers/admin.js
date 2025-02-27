/*
 * Module dependencies
 */
const mongoose = require('mongoose');
const _ = require('lodash');
const moment = require('moment');
const Joi = require('@hapi/joi');
const jwt = require('../lib/jwt');
const C = require('../lib/constants');
const fetch = require('node-fetch');
const { WEB_NOTIF } = require('../messaging/constants');
const ROLES_VALUES = Object.values(C.ROLES);
// const CLIENT_CATEGORY_ENUMS = Object.values(C.CLIENT_CATEGORIES);
const MODEL_ENUMS = Object.values(C.MODELS);

const User = mongoose.model(C.MODELS.USER_C);
const Writer = mongoose.model(C.MODELS.WRITER_C);
const Industry = mongoose.model(C.MODELS.INDUSTRY_C);
const Client = mongoose.model(C.MODELS.CLIENT_C);
const Organization = mongoose.model(C.MODELS.ORGANISATION_C);
const Report = mongoose.model(C.MODELS.JOB_BOARD_REPORTING_C);
const Block = mongoose.model(C.MODELS.BLOCK);

//Job-Board Models
const JobBoard = mongoose.model(C.MODELS.JOB_BOARD_C);
const JobBoardApplications = mongoose.model(C.MODELS.JOB_BOARD_APPLICATION_C);
//

const UserWaitlist = require('../models/users/userWaitlist');
const ClientGamification = mongoose.model(C.MODELS.C_GAMIFICATION_C);

const ConversationClient = mongoose.model(C.MODELS.CONVERSATION_CLIENT);
const Invoice = mongoose.model(C.MODELS.INVOICE);
const Transaction = mongoose.model(C.MODELS.TRANSACTION);

// const { convertToCSVAndUploadToS3 } = require('../config/aws-sdk');
// const { notification } = require('../messaging/index');

const { BadRequest, NotFound, InternalServerError } = require('../lib/errors');
const linkGen = require('../lib/link-generator');
const agenda = require('../services/agenda');
const {
    caution_email,
    ban_email,
    job_on_hold_email,
} = require('../utils/emailTemplates');
const env = require('../config/env');
const { ROLES } = require('../lib/constants');
const { createEmailFindRegex } = require('../services/db/user');
const commonControllers = require('./common');

const { notification } = require('../messaging/index');

exports.getUserRoles = async () => {
    const roles = [
        // C.ROLES.ME_C,
        C.ROLES.SA_C,
        // C.ROLES.CSM_C,
        C.ROLES.CLIENT_C,
        C.ROLES.WRITER_C,
        // C.ROLES.VE_C,
    ];
    return roles;
};

exports.checkWorking = async () => {
    return 'Working';
};
/**
 * @version 2.1
 * Creator/Client invite only approval APIs
 */

exports.approveUserSignup = async ({ email, role }) => {
    let tokenData = {};
    let findUserOnWaitlist;
    if (role == ROLES.WRITER_C) {
        findUserOnWaitlist = await UserWaitlist.findOne({
            email: createEmailFindRegex({ email }),
        }).exec();
        if (!findUserOnWaitlist)
            throw new BadRequest('creator not on waitlist');
        tokenData = {
            email,
            refId: findUserOnWaitlist.refId,
            social: findUserOnWaitlist.social,
            userRole: role,
        };
    } else if (role == ROLES.CLIENT_C) {
        findUserOnWaitlist = await ClientGamification.findOne({
            e: createEmailFindRegex({ email }),
        }).exec();
        if (!findUserOnWaitlist) throw new BadRequest('client not on waitlist');
        tokenData = {
            email,
            refId: findUserOnWaitlist.rfr.refId,
            social: findUserOnWaitlist.rfr.social,
            userRole: role,
        };
    } else {
        throw new BadRequest('Invalid role');
    }
    const token = await jwt.generateToken({
        data: tokenData,
    });
    let link;
    if (role == ROLES.WRITER_C) {
        link = `${env.FRONTEND_URL}/signup-creator/${token}`;
        notificationSA('joining_approved_creator', role, {
            email: findUserOnWaitlist.email,
            link,
        });
    } else if (role == ROLES.CLIENT_C) {
        link = `${env.FRONTEND_URL}/signup-client/${token}`;
        notificationSA('joining_approved_client', role, {
            email: findUserOnWaitlist.email,
            link,
            name:
                findUserOnWaitlist.n.f + ' ' + findUserOnWaitlist.n.l
                    ? findUserOnWaitlist.n.l
                    : '',
        });
    }
    return {
        msg: `${email} approved`,
        link,
    };
};

/**
 * Approve Jobs under review
 */

async function createSuggestedApplications(jobId, clientId, creatorIds) {
    const alreadyApplied = await JobBoardApplications.find({
        writer: { $in: creatorIds },
        job: jobId,
    }).exec();
    if (alreadyApplied.length > 0)
        throw new BadRequest('One or more creators already suggested/applied');
    const applications = [];
    _.forEach(creatorIds, (creatorId) => {
        applications.push({
            appliedOn: new Date(),
            writer: creatorId,
            job: jobId,
            client: clientId,
            sugg: true,
            status: C.JOB_BOARD_APPLICATION_STATES.SUGGESTED,
        });
    });
    const newApplications = await JobBoardApplications.insertMany(applications);
    const newApplicationIds = _.map(newApplications, (appl) => {
        return appl.id;
    });
    return newApplicationIds;
}

exports.approveJob = async ({ jobId, creatorIds }) => {
    const job = await JobBoard.findById(jobId).populate('client').exec();
    if (!job) throw new BadRequest('Job not found');
    if (
        !(
            job.status == C.JOB_BOARD_OPPORTUNITY_STATES.UNDER_REVIEW ||
            job.status == C.JOB_BOARD_OPPORTUNITY_STATES.ACTIVE
        )
    ) {
        throw new BadRequest('Job is not active or under_review');
    }
    const currentStatus = job.status;
    job.status = C.JOB_BOARD_OPPORTUNITY_STATES.ACTIVE;
    if (Array.isArray(creatorIds) && creatorIds.length > 0) {
        const classifiedCreators = await Writer.find({
            _id: { $in: creatorIds },
            lv: C.CREATOR_LEVEL.CLASSIFIED,
        }).exec();
        if (classifiedCreators.length != creatorIds.length) {
            throw new BadRequest(
                'Only classified creators are allowed to be suggested',
            );
        }
        const newApplicationIds = await createSuggestedApplications(
            job.id,
            job.client.id,
            creatorIds,
        );
        job.applications.push(...newApplicationIds);
    }
    await job.save();
    if (currentStatus == C.JOB_BOARD_OPPORTUNITY_STATES.UNDER_REVIEW) {
        // If job is now active and was under_review before, schedule agendas
        agenda.every(
            '2 days',
            'client_2_day',
            {
                job: {
                    id: job._id,
                    title: job.title,
                },
                client: {
                    id: job.client._id,
                    e: job.client.e,
                    n: job.client.n,
                },
            },
            { skipImmediate: true },
        );
        // Every 15days remind client of pending applications for this job
        agenda.every(
            '15 days',
            'client_15_day',
            {
                job: {
                    id: job._id,
                    title: job.title,
                },
                client: {
                    id: job.client._id,
                    e: job.client.e,
                    n: job.client.n,
                },
            },
            { skipImmediate: true },
        );
    }
    // Send notification to client/PM of picks
    let link = '';
    if (job.client.__t == C.MODELS.PM_C) {
        link = `${env.PM_PORTFOLIO}/application/${job.id}`;
    } else if (job.client.__t == C.MODELS.CLIENT_C) {
        link = `${env.CLIENT_PROFILE}/application/${job.id}`;
    }
    await notification.send({
        usecase: 'job-approved',
        role: C.ROLES.CLIENT_C,
        email: {
            email: job.client.e,
            name: job.client.n.f,
            jobName: job.title,
            link,
        },
        web: {
            for: { id: job.client.id, role: C.ROLES.CLIENT_C },
            actions: {
                n: WEB_NOTIF[C.ROLES.CLIENT_C].VIEW_JOB,
                d: { jobId: job._id },
            },
            createdAt: Date.now(),
            jobName: job.title,
        },
    });
    if (creatorIds.length > 0) {
        await notification.send({
            usecase: 'job-editors-pick',
            role: C.ROLES.CLIENT_C,
            email: {
                email: job.client.e,
                name: job.client.n.f,
                editorName: 'Pavan Kumar',
                link,
            },
        });
    }
    return {
        msg: 'Job approved',
    };
};

exports.suggestCreatorsToJob = async ({ jobId, creatorIds }) => {
    const job = await JobBoard.findById(jobId).populate('client').exec();
    if (!job) throw new BadRequest('Job not found');
    if (job.status != C.JOB_BOARD_OPPORTUNITY_STATES.ACTIVE) {
        throw new BadRequest('Creators can be suggested to active jobs only');
    }
    if (Array.isArray(creatorIds) && creatorIds.length > 0) {
        const classifiedCreators = await Writer.find({
            _id: { $in: creatorIds },
            lv: C.CREATOR_LEVEL.CLASSIFIED,
        }).exec();
        if (classifiedCreators.length != creatorIds.length) {
            throw new BadRequest(
                'Only classified creators are allowed to be suggested',
            );
        }
        const newApplicationIds = await createSuggestedApplications(
            job.id,
            job.client.id,
            creatorIds,
        );
        job.applications.push(...newApplicationIds);
    }
    await job.save();
    // Send notification to client/PM of picks
    let link = '';
    if (job.client.__t == C.MODELS.PM_C) {
        link = `${env.PM_PORTFOLIO}/application/${job.id}`;
    } else if (job.client.__t == C.MODELS.CLIENT_C) {
        link = `${env.CLIENT_PROFILE}/application/${job.id}`;
    }
    await notification.send({
        usecase: 'job-editors-pick',
        role: C.ROLES.CLIENT_C,
        email: {
            email: job.client.e,
            name: job.client.n.f,
            editorName: 'Pavan Kumar',
            link,
        },
    });
    return { msg: 'Creators suggested to job' };
};

exports.setCreatorReport = async ({ id, data }) => {
    const creator = await Writer.findById(id).select('e othd n');
    if (!creator) throw new BadRequest('No creator found by this id');
    creator.othd.rpc = { ctd: true, rs: false, ...data };
    await creator.save();
    const link = `${env.CREATOR_PORTFOLIO}/analytics/profile#report`;
    await notification.send({
        usecase: 'report-is-ready',
        role: C.ROLES.WRITER_C,
        email: {
            email: creator.e,
            name: creator.fullname,
            link,
        },
    });
    agenda.schedule('after 2 days', 'send_report_reminder', {
        name: creator.fullname,
        email: creator.e,
        ...data,
    });
    return {
        ...data,
    };
};

exports.createUserByRole = async ({
    firstName,
    lastName,
    role,
    email,
    password,
    company,
    mobile,
    category,
}) => {
    // tow JOI schemas
    let schema = {};
    if (role === C.ROLES.CLIENT_C) {
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
        // TODO: try to remove this validation step from here to keep things consistent
    }

    if (!ROLES_VALUES.includes(role)) {
        throw new InternalServerError(`invalid role: ${role}`);
    }
    const query = { e: email };
    const eUser = await User.exists(query);
    if (eUser) {
        throw new BadRequest(`user with email: ${email} already exists`);
    }
    if (mobile) {
        const query = { mo: mobile };
        const mUser = await User.exists(query);
        if (mUser) {
            throw new BadRequest(
                `user with mobile num: ${mobile} already exists`,
            );
        }
    }
    const UserModel = mongoose.model(role);
    const user = new UserModel();
    user.__t = role;
    if (role === C.ROLES.CLIENT_C) {
        user.company = company;
    }
    user.email = email;
    user.password = password;
    user.mobile = mobile;
    /**
     * @NOTE :
     * verification email is only sent for roles present in
     * allowedRolesForNotif via SA as of now
     */
    // const allowedRolesForNotif = [C.ROLES.VE_C, C.ROLES.CLIENT_C];
    const allowedRolesForNotif = [C.ROLES.CLIENT_C];
    let link;
    if (allowedRolesForNotif.includes(role)) {
        // generate jwt
        const token = await jwt.generateToken({
            data: { id: user.id, email: user.email },
            expiresIn: C.DEFAULT_TOKEN_EXPIRESIN,
        });
        link = linkGen.verifyEmail({ role, token });
        user.emailVerificationToken = token;
    }

    const upUser = await user.save();
    if (!upUser) {
        throw new InternalServerError(`${role} could not be created`);
    }

    if (allowedRolesForNotif.includes(role)) {
        // email verification notifs
        // ? Remove notification
        // await notification.send({
        // 	usecase: C.NOTIF_USECASES[role].VERIFY_EMAIL,
        // 	role,
        // 	email: {
        // 		email,
        // 		link,
        // 		name: user.notifName,
        // 	},
        // });
        console.log('Send Email');
    }

    return { msg: `${role} created successfully!` };
};

exports.getUsers = async ({ role }) => {
    let users = [];
    const query = {};
    if (role === 'all') {
        // const query = { acst: C.ACCOUNT_STATUS.ACTIVE };
        users = await User.find(query).exec();
        users = _.map(users, (user) => {
            const { name, accountStatus } = user;
            return { name, accountStatus };
        });
    } else if (role === C.ROLES.CLIENT_C.toLowerCase()) {
        // const query = { acst: C.ACCOUNT_STATUS.ACTIVE };
        users = await Client.find(query).exec();
        users = await Promise.all(
            _.map(users, async (user) => {
                const {
                    name,
                    id,
                    email,
                    accountStatus: status,
                    createdAt,
                    updatedAt,
                    mobile,
                    company,
                    // csm: csmId,
                } = user;
                return {
                    name,
                    id,
                    email,
                    accountStatus: status,
                    createdAt,
                    updatedAt,
                    mobile,
                    company,
                    // hasCsm,
                    // csm,
                };
            }),
        );
    } else if (role === C.ROLES.WRITER_C.toLowerCase()) {
        // const query = { acst: C.ACCOUNT_STATUS.ACTIVE };
        users = await Writer.find(query).exec();
        users = _.map(users, (user) => {
            const {
                name,
                id,
                email,
                accountStatus: status,
                createdAt,
                updatedAt,
                mobile,
            } = user;
            return {
                name,
                id,
                email,
                accountStatus: status,
                createdAt,
                updatedAt,
                mobile,
            };
        });
    } else {
        throw new NotFound(`no such user role: ${role}`);
    }
    // const users = await userService.getAllUsers({ role });
    return { users };
};

exports.getWriterAccountStats = async () => {
    const stats = await Writer.aggregate([
        {
            $group: { _id: '$acst', writers: { $addToSet: '$e' } },
        },
        {
            $project: {
                _id: 0,
                accountStatus: '$_id',
                writersCount: { $size: '$writers' },
            },
        },
    ]);
    return { stats };
};

exports.getWriterLevelStats = async () => {
    const stats = await Writer.aggregate([
        // {
        //   $match: {acst:"active"} // to match only active writers
        // },
        {
            $group: { _id: '$lvl.n', writers: { $addToSet: '$_id' } },
        },
        {
            $project: {
                _id: 0,
                level: '$_id',
                writersCount: { $size: '$writers' },
            },
        },
    ]);
    return { stats };
};

exports.getWriterDateStats = async ({ date }) => {
    const lastActiveAtStats = await Writer.aggregate([
        {
            $match: {
                lac: {
                    $gte: new Date(date),
                },
            },
        },
        {
            $group: {
                _id: {
                    $dateToString: {
                        format: '%Y-%m-%d',
                        date: '$lac',
                    },
                },
                count: {
                    $sum: 1,
                },
            },
        },
        {
            $sort: {
                _id: 1,
            },
        },
    ]);
    const signUpStats = await Writer.aggregate([
        {
            $match: {
                createdAt: {
                    $gte: new Date(date),
                },
            },
        },
        {
            $group: {
                _id: {
                    $dateToString: {
                        format: '%Y-%m-%d',
                        date: '$createdAt',
                    },
                },
                count: {
                    $sum: 1,
                },
            },
        },
        {
            $sort: {
                _id: 1,
            },
        },
    ]);
    const approvedAtStats = await Writer.aggregate([
        {
            $match: {
                aat: {
                    $gte: new Date(date),
                },
            },
        },
        {
            $group: {
                _id: {
                    $dateToString: {
                        format: '%Y-%m-%d',
                        date: '$aat',
                    },
                },
                count: {
                    $sum: 1,
                },
            },
        },
        {
            $sort: {
                _id: 1,
            },
        },
    ]);
    return { lastActiveAtStats, signUpStats, approvedAtStats };
};

exports.bypassVerification = async ({ email }) => {
    const user = await User.findOne({ e: email }).exec();
    if (!user) {
        throw new BadRequest('no such user exists');
    }
    user.accountStatus = C.ACCOUNT_STATUS.ACTIVE;
    // BAD if it user is a Writer
    if (user.__t === C.ROLES.WRITER_C) {
        user.accountStatus = C.WRITER_ACCOUNT_STATUS.PORTFOLIO_PENDING;
    }
    await user.save();
    return { msg: 'account activated successfully' };
};

// after upload file return filename and ext
exports.uploadBadgeImage = async ({ file }) => {
    const { originalname, location } = file;
    return { originalname, location };
};

//Job-Board End Points
//Admin Module

const paginationSize = 10; //For Admin Module Pages

//Admin Testing API general purpose

// exports.testAPI = async () => {
// 	const query = { $in: ['profile', 'message', 'post'] };
// 	const apps = await Report.find({ report_type: query }).exec();
// 	console.log(apps);
// };

function notificationSA(usecase, role, reqArguments) {
    var query = {};
    query['usecase'] = usecase;
    query['role'] = role;
    query['email'] = reqArguments;
    const requestOptions = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(query),
    };
    fetch('http://localhost:4862/notif', requestOptions)
        .then(
            (response) => {
                console.log('Sent notification successfully');
            },
            (err) => next(err),
        )
        .catch((err) => {
            console.log('Error connecting to notification service');
        });
}

//Admin Module, Opportunity Post Page

exports.getClientsData = async () => {
    var getClientsDataResponses = [];
    const clients = await Client.find(
        {},
        { _id: 1, createdAt: 1, cn: 1, e: 1, mo: 1, cpis: 1, ppis: 1 },
    ).exec();
    clients.map((client) => {
        var replyData = {};
        replyData['company'] = client['company'];
        replyData['_id'] = client['id'];
        replyData['createdAt'] = client['createdAt'];
        replyData['posts'] =
            client['currentProjects'].length +
            client['previousProjects'].length;
        replyData['email'] = client['email'];
        replyData['mobile'] = client['mobile'];
        getClientsDataResponses.push(replyData);
    });
    return { clients: getClientsDataResponses };
};

exports.updateSpecificJob = async ({ admin, jobId, reqBody }) => {
    var update = {};
    if (reqBody['employmentType'] != '' && reqBody['employmentType']) {
        update['employmentType'] = reqBody['employmentType'];
    }

    if (reqBody['title'] != '' && reqBody['title']) {
        update['title'] = reqBody['title'];
    }

    if (reqBody['location'] != '' && reqBody['location']) {
        update['location'] = reqBody['location'];
    }
    if (reqBody['creatorType'] != '' && reqBody['creatorType']) {
        update['ct'] = reqBody['creatorType'];
    }

    if (reqBody['remoteFriendly'] != '' && reqBody['remoteFriendly']) {
        update['remoteFriendly'] = reqBody['remoteFriendly'];
    }

    if (
        reqBody['preferredQualifications'] != '' &&
        reqBody['preferredQualifications']
    ) {
        update['preferredQualifications'] = reqBody['preferredQualifications'];
    }

    if (reqBody['openings'] != '' && reqBody['openings']) {
        update['openings'] = reqBody['openings'];
    }

    if (reqBody['renumeration'] != '' && reqBody['renumeration']) {
        update['renumeration'] = reqBody['renumeration'];
    }

    if (reqBody['renumerationUnit'] != '' && reqBody['renumerationUnit']) {
        update['renumerationUnit'] = reqBody['renumerationUnit'];
    }

    if (reqBody['contentPiecesQty']) {
        update['cpq'] = reqBody['contentPiecesQty'];
    }

    if (reqBody['deadline'] != '' && reqBody['deadline']) {
        update['deadline'] = reqBody['deadline'];
    }
    if (reqBody['ques1'] != '' && reqBody['ques1']) {
        update['ques1'] = reqBody['ques1'];
    }
    if (reqBody['category'] != '' && reqBody['category']) {
        update['cg'] = reqBody['category'];
    }

    if (reqBody['ques2'] != '' && reqBody['ques2']) {
        update['ques2'] = reqBody['ques2'];
    }

    if (reqBody['responsibility'] != '' && reqBody['responsibility']) {
        update['responsibility'] = reqBody['responsibility'];
    }

    if (reqBody['seniority'] != '' && reqBody['seniority']) {
        update['seniority'] = reqBody['seniority'];
    }

    if (reqBody['status'] != '' && reqBody['status']) {
        update['status'] = reqBody['status'];
    }

    if (reqBody['jobTags']) {
        update['jt'] = reqBody['jobTags'];
    }

    //Currency unit update to be added

    const updatedJob = await JobBoard.findOneAndUpdate(
        { _id: jobId },
        { $set: update },
    ).exec();
    if (updatedJob) {
        const client = await Client.findOne(
            { _id: updatedJob['client'] },
            { e: 1, n: 1, cn: 1 },
        );
        if (client) {
            notificationSA('post-updated', 'client', {
                email: client['e'],
                organizationName: client['cn'],
                name: client['n']['f'] + ' ' + client['n']['l'],
            });
        }
        // What if status is made 'active' after 'closed' ?
        if (reqBody['status'] == 'closed') {
            // Expire job after 14 days
            agenda.schedule('after 14 days', 'expire_opportunity', {
                job: { id: updatedJob._id },
                client: { id: updatedJob.client },
            });
            // Cancel 2day and 15day reminder emails
            await agenda.cancel({
                name: {
                    $in: ['client_2_day', 'client_15_day'],
                },
                'data.job.id': updatedJob._id,
                'data.client.id': updatedJob.client,
            });
        }
        return updatedJob['_id'];
    } else {
        throw new InternalServerError('Job could not be updated.');
    }
};

exports.specificJob = async ({ admin, jobId }) => {
    const job = await JobBoard.findOne({ _id: jobId })
        .select('-applications')
        .populate({
            path: 'client',
            select: 'organisation n',
            populate: { path: 'organisation' },
        })
        .exec();
    if (!job) {
        throw new BadRequest("Job doesn't exist");
    }
    const suggested = await JobBoardApplications.find({
        job: jobId,
        sugg: true,
    })
        .select('status writer')
        .populate({ path: 'writer', select: 'n e img' })
        .exec();
    return { jobDetails: job, suggested };
};
exports.addOpportunity = async ({ admin, reqArguments }) => {
    const job = {};

    if (reqArguments['deadline'] <= new Date().toISOString()) {
        throw new BadRequest('Date sent is of the past.');
    }

    if (reqArguments['employmentType'] != undefined) {
        job['employmentType'] = reqArguments['employmentType'];
    }
    job['title'] = reqArguments['title'];
    job['location'] = reqArguments['location'];

    if (reqArguments['remoteFriendly'] != undefined) {
        job['remoteFriendly'] = reqArguments['remoteFriendly'];
    }

    if (reqArguments['preferredQualifications'] != undefined) {
        job['preferredQualifications'] =
            reqArguments['preferredQualifications'];
    }

    if (reqArguments['openings'] != undefined) {
        job['openings'] = reqArguments['openings'];
    }

    if (reqArguments['renumeration'] != undefined) {
        job['renumeration'] = reqArguments['renumeration'];
    }

    if (reqArguments['renumerationUnit'] != undefined) {
        job['renumerationUnit'] = reqArguments['renumerationUnit'];
    }

    if (reqArguments['creatorType'] != undefined)
        job['ct'] = reqArguments['creatorType'];
    else job['ct'] = 'DESIGNER';

    if (reqArguments['contentPiecesQty'] != undefined) {
        job['cpq'] = reqArguments['contentPiecesQty'];
    }
    if (reqArguments['jobTags']) {
        job['jt'] = reqArguments['jobTags'];
    }
    if (reqArguments['category']) {
        job['cg'] = reqArguments['category'];
    }
    job['deadline'] = new Date(reqArguments['deadline']);

    if (reqArguments['ques1'] != undefined) {
        job['ques1'] = reqArguments['ques1'];
    }

    if (reqArguments['ques2'] != undefined) {
        job['ques2'] = reqArguments['ques2'];
    }

    job['client'] = reqArguments['client'];

    job['responsibility'] =
        reqArguments['responsibility'] == undefined
            ? null
            : reqArguments['responsibility'];

    job['projectDescription'] =
        reqArguments['responsibility'] == undefined
            ? null
            : reqArguments['responsibility'];
    job['seniority'] =
        reqArguments['seniority'] == undefined
            ? null
            : reqArguments['seniority'];

    const createdJob = await JobBoard.create(job);

    if (!createdJob) {
        throw InternalServerError('Cannot add job. DB error');
    }

    const add = await Client.findOneAndUpdate(
        { _id: reqArguments['client'] },
        { $push: { opportunities: createdJob._id } },
        { new: true, upsert: true },
    ).exec();

    if (add == undefined) {
        const deletedJob = await JobBoard.deleteOne({
            _id: createdJob['_id'],
        }).exec();
        if (deletedJob) {
            throw new InternalServerError(
                "Issue in creating job or adding job to client's project",
            );
        } else {
            //Handle Else
        }
    } else {
        if (add['e'] != undefined && add['e'] != '' && add['n'] != undefined) {
            notificationSA('opportunity-floated', 'client', {
                email: add['e'],
                name: add['n']['f'] + ' ' + add['n']['l'],
                organizationName: add['cn'],
                opportunityName: reqArguments['title'],
            });
            // Every 2days remind client of new applications for this job
            agenda.every(
                '2 days',
                'client_2_day',
                {
                    job: {
                        id: createdJob._id,
                        title: createdJob.title,
                    },
                    client: {
                        id: add._id,
                        e: add.e,
                        n: add.n,
                    },
                },
                { skipImmediate: true },
            );
            // Every 15days remind client of pending applications for this job
            agenda.every(
                '15 days',
                'client_15_day',
                {
                    job: {
                        id: createdJob._id,
                        title: createdJob.title,
                    },
                    client: {
                        id: add._id,
                        e: add.e,
                        n: add.n,
                    },
                },
                { skipImmediate: true },
            );
        }
        return createdJob['_id'];
    }
};

exports.setJobTrending = async ({ jobIds, status }) => {
    return Promise.all(
        _.map(jobIds, async (jobId) => {
            let Job = await JobBoard.findByIdAndUpdate(jobId, {
                $set: { it: status },
            });
            return Job;
        }),
    )
        .then((value) => {
            return { msg: 'Job status changed' };
        })
        .catch((err) => {
            return { msg: 'Some Error Occured' };
        });
};

//Admin Module, Organizations Page

exports.updateSpecificOrg = async ({ admin, orgId, reqBody }) => {
    // Client update info
    var update = {};
    if (reqBody['companyLogo'] && reqBody['companyLogo'] != '') {
        update['img'] = reqBody['companyLogo'];
    }
    if (reqBody['companyLogo'] && reqBody['companyLogo'] != '') {
        update['avatar'] = reqBody['companyLogo'];
    }
    update['n.f'] = reqBody['firstName'];
    update['n.l'] = reqBody['lastName'];
    if (reqBody['orgName'] && reqBody['orgName'] != '') {
        update['cn'] = reqBody['orgName'];
    }
    //*** Should be unique
    if (reqBody['email'] && reqBody['email']) {
        update['e'] = reqBody['email'];
    }

    if (reqBody['mobile'] && reqBody['mobile'] != '') {
        update['mo'] = reqBody['mobile'];
    }
    //***
    // Organization update info
    let updateOrg = {};
    if (reqBody['orgSector'] && reqBody['orgSector'] != []) {
        updateOrg['sectors'] = reqBody['orgSector'];
    }
    if (reqBody['orgName'] && reqBody['orgName'] != '') {
        updateOrg['name'] = reqBody['orgName'];
    }
    if (reqBody['orgDesc'] && reqBody['orgDesc'] != '') {
        updateOrg['desc'] = reqBody['orgDesc'];
    }

    if (reqBody['officialWebsite'] && reqBody['officialWebsite']) {
        updateOrg['website'] = reqBody['officialWebsite'];
    }

    if (reqBody['socialMediaLink'] && reqBody['socialMediaLink'] != '') {
        updateOrg['socialMedia'] = reqBody['socialMediaLink'];
    }
    // First Update client info
    const updatedClient = await Client.findOneAndUpdate(
        { _id: orgId },
        { $set: update },
    ).exec();
    if (updatedClient) {
        // then update Organization info
        let clientOrg = await Organization.findOneAndUpdate(
            { _id: updatedClient.organisation },
            { $set: updateOrg },
        ).exec();
        if (!clientOrg) {
            clientOrg = new Organization(updateOrg);
            await clientOrg.save();
            updatedClient.organisation = clientOrg.id;
            await updatedClient.save();
        }
        if (updatedClient['n']) {
            first = updatedClient['n']['f'];
            last = updatedClient['n']['l'];
        } else {
            first = '';
            last = '';
        }
        notificationSA('profile-updated', 'client', {
            email: updatedClient['e'],
            organizationName: updatedClient['cn'],
            name: first + ' ' + last,
        });
        return 'Updated Organization';
    } else {
        throw new InternalServerError(
            'Client/Organization could not be updated',
        );
    }
};

// We need org name from organisation collectinon
exports.specificOrg = async ({ admin, orgId }) => {
    const org = await Client.findOne({ _id: orgId })
        .populate({
            path: 'organisation',
            select: ['website', 'socialMedia', 'desc', 'sectors', 'name'],
        })
        .select(
            'cn mo e industryPreferences img organizationDescription socialMediaHandle officialWebsite acst n organisation',
        );
    console.log(org);
    if (!org) {
        throw new BadRequest("Organization with Id doesn't exist");
    } else {
        var responseDetails = {};
        responseDetails['companyLogo'] =
            org['img'] == undefined ? null : org['img'];
        responseDetails['name'] = org['n'] == undefined ? null : org['n'];
        responseDetails['email'] = org['e'] == undefined ? null : org['e'];
        responseDetails['mobile'] = org['mo'] == undefined ? null : org['mo'];
        // responseDetails['cin'] = org['cin'] == undefined ? null : org['cin'];
        responseDetails['status'] =
            org['acst'] == undefined ? null : org['acst'];
        responseDetails['industryPreferences'] = org['industryPreferences'];

        if (org.organisation) {
            responseDetails['orgName'] = org.organisation.name;
            responseDetails['socialMediaLink'] = org.organisation.socialMedia;
            responseDetails['orgSector'] = org.organisation.sectors;
            responseDetails['orgDesc'] = org.organisation.desc;
            responseDetails['officialWebsite'] = org.organisation.website;
        }

        return { orgDetails: responseDetails };
    }
};

exports.addOrganization = async ({ admin, reqArguments }) => {
    const exists = await Client.find(
        {
            $or: [{ e: reqArguments['email'] }, { mo: reqArguments['mobile'] }],
        },
        { id: 1 },
    )
        .limit(1)
        .exec();

    if (
        reqArguments['email'] == undefined &&
        reqArguments['mobile'] == undefined
    ) {
        throw new BadRequest('Email and mobile both were not provided');
    }
    console.log(exists);
    if (exists.length == 1) {
        throw new BadRequest('Email, Mobile already exists');
    }

    var inputArguments = {};
    inputArguments['img'] =
        reqArguments['companyLogo'] == undefined
            ? ''
            : reqArguments['companyLogo'];
    inputArguments['avatar'] =
        reqArguments['companyLogo'] == undefined
            ? ''
            : reqArguments['companyLogo'];
    inputArguments['cn'] = reqArguments['orgName'];
    let industryAsObj = [];
    if (Array.isArray(reqArguments['industries'])) {
        // Check if industries contains valid Industry id's
        await Promise.all(
            reqArguments['industries'].map(async (industryId) => {
                const result = await Industry.getActiveById({ id: industryId });
                industryAsObj.push({
                    id: result._id,
                    name: result.n,
                    value: result.v,
                });
            }),
        );
    }
    inputArguments['industryPreferences'] = industryAsObj;
    inputArguments['e'] =
        reqArguments['email'] == undefined ? '' : reqArguments['email'];
    inputArguments['mo'] =
        reqArguments['mobile'] == undefined ? '' : reqArguments['mobile'];
    inputArguments['p'] = '1234';
    inputArguments['cn'] = reqArguments['orgName'];
    inputArguments['n.f'] = reqArguments['firstName'];
    inputArguments['n.l'] = reqArguments['lastName'];
    // inputArguments['cin'] = reqArguments['cin']; //CIN number not supported right now

    // Create new Organization
    const organizationDetails = {
        name: reqArguments['orgName'],
        desc: reqArguments['orgDesc'],
        sectors: reqArguments['orgSector'],
        website: reqArguments['officialWebsite'],
        socialMedia: reqArguments['socialMediaLink'],
    };
    const organisation = await Organization.create(organizationDetails);

    if (!organisation) {
        throw new InternalServerError("Organization couldn't be created");
    }

    // Add newly created organization to client data
    inputArguments['organisation'] = organisation._id;

    const client = await Client.create(inputArguments);

    if (client['id'] == undefined) {
        await Organization.deleteOne({ _id: organisation._id });
        throw new InternalServerError("Organization couldn't be created");
    } else {
        client.accountStatus = C.ACCOUNT_STATUS.ACTIVE;
        client.isEmailVerified = true;
        client.verifiedAt = Date.now();
        client.isPostingFirstTime = false;
        await client.save();
        if (reqArguments['email'] && reqArguments['email'] != '') {
            notificationSA('organization-added', 'writer', {
                email: reqArguments['email'],
                name: '',
                organizationName: reqArguments['orgName'],
            });
        }
        return client['id'];
    }
};

//Admin Module, Clients Page

class clientDetails {
    constructor(
        clientId,
        orgName,
        firstName,
        lastName,
        email,
        mobile,
        totalPosts,
        totalApplications,
        accountStatus,
        totalSuggestedApplications,
        totalSuggestedHired,
        totalClassifiedConvos,
        totalPaidINR,
        totalPaidUSD,
        totalWPEarningsINR,
        totalWPEarningsUSD,
    ) {
        this.clientId = clientId;
        this.orgName = orgName;
        this.firstName = firstName;
        this.lastName = lastName;
        this.email = email;
        this.mobile = mobile;
        this.totalPosts = totalPosts;
        this.totalApplications = totalApplications;
        this.accountStatus = accountStatus;
        this.totalSuggestedApplications = totalSuggestedApplications;
        this.totalSuggestedHired = totalSuggestedHired;
        this.totalClassifiedConvos = totalClassifiedConvos;
        this.totalPaidINR = totalPaidINR;
        this.totalPaidUSD = totalPaidUSD;
        this.totalWPEarningsINR = totalWPEarningsINR;
        this.totalWPEarningsUSD = totalWPEarningsUSD;
    }
}

function comapreClientApplications(aClient, bClient) {
    if (aClient.totalApplications < bClient.totalApplications) {
        return -1;
    } else if (aClient.totalApplications > bClient.totalApplications) {
        return 1;
    } else {
        return 0;
    }
}

function compareClientPosts(aClient, bClient) {
    if (aClient.totalPosts < bClient.totalPosts) {
        return -1;
    } else if (aClient.totalPosts > bClient.totalPosts) {
        return 1;
    } else {
        return 0;
    }
}

exports.getAllClients = async ({ admin, reqArguments, reqBody }) => {
    var projectedFields = {
        cn: 1,
        e: 1,
        mo: 1,
        n: 1,
        acst: 1,
    };
    var searchBy =
        reqBody['searchBy'] == undefined ? null : reqBody['searchBy'];
    var searchValue =
        reqBody['searchValue'] == undefined ? null : reqBody['searchValue'];
    var sortBy = reqBody['sortBy'] == undefined ? null : reqBody['sortBy'];
    var sortByDirection =
        reqBody['sortByDirection'] == undefined
            ? null
            : reqBody['sortByDirection'];
    var clients;

    if (reqArguments['status'] == 'all') {
        reqArguments['status'] = {
            $in: [...Object.values(C.ACCOUNT_STATUS)],
        };
    }

    if (searchBy && searchBy != '' && searchValue && searchValue != '') {
        if (searchBy == 'email') {
            clients = await Client.find(
                {
                    acst: reqArguments['status'],
                    e: { $regex: searchValue, $options: '-i' },
                },
                projectedFields,
            ).exec();
        }
        if (searchBy == 'name') {
            clients = await Client.find(
                {
                    $or: [
                        { 'n.f': { $regex: searchValue, $options: '-i' } },
                        { 'n.l': { $regex: searchValue, $options: '-i' } },
                    ],
                    acst: reqArguments['status'],
                },
                projectedFields,
            ).exec();
        }
    } else {
        clients = await Client.find(
            { acst: reqArguments['status'] },
            projectedFields,
        ).exec();
        console.log(clients.length);
    }

    var clientArray = [];

    await Promise.all(
        clients.map(async (client) => {
            const totalApplications = await JobBoardApplications.find({
                client: client['id'],
            }).count();
            const totalPosts = await JobBoard.countDocuments({
                client: client['id'],
            }).exec();
            const clientId = client['id'] == undefined ? null : client['id'];
            const orgName =
                client['company'] == undefined ? null : client['company'];
            var firstName, lastName;
            if (client['name'] == undefined) {
                firstName = null;
                lastName = null;
            } else {
                firstName = client['name']['first'];
                lastName = client['name']['last'];
            }
            const email = client['email'] == undefined ? null : client['email'];
            const mobile =
                client['mobile'] == undefined ? null : client['mobile'];
            const status = client['acst'] == undefined ? null : client['acst'];
            // Stats for classified creators suggested to client
            // Total suggestions, total suggestions hired
            const totalSuggestedApplications =
                await JobBoardApplications.countDocuments({
                    client: client._id,
                    sugg: true,
                }).exec();
            const totalSuggestedHired =
                await JobBoardApplications.countDocuments({
                    client: client._id,
                    sugg: true,
                    status: C.JOB_BOARD_APPLICATION_STATES.HIRED,
                }).exec();
            // These conversations are part of the suggested applications client hired
            const classifiedConversations = await ConversationClient.find({
                u1: client._id,
                'cli.clss': {
                    $ne: C.CONVERSATION_CLASSIFIED_STATES.NOT_CLASSIFIED,
                },
            }).exec();
            const totalClassifiedConvos = classifiedConversations.length;
            const classifiedIds = _.map(classifiedConversations, (convo) => {
                return convo._id;
            });
            console.log(classifiedIds);
            const totalEarnings = await Invoice.find({
                convoId: { $in: classifiedIds },
                inm: C.INVOICE_MODE.RECEIVE,
                st: C.INVOICE_STATES.PAID,
            }).exec();
            let totalPaidINR = 0,
                totalPaidUSD = 0;
            _.map(totalEarnings, (invoice) => {
                if (invoice.cur == C.CURRENCY.INR) totalPaidINR += invoice.tot;
                else totalPaidUSD += invoice.tot;
            });
            let totalWPEarningsINR = totalPaidINR * 0.2;
            let totalWPEarningsUSD = totalPaidUSD * 0.2;
            clientArray.push(
                new clientDetails(
                    clientId,
                    orgName,
                    firstName,
                    lastName,
                    email,
                    mobile,
                    totalPosts,
                    totalApplications,
                    status,
                    totalSuggestedApplications,
                    totalSuggestedHired,
                    totalClassifiedConvos,
                    totalPaidINR,
                    totalPaidUSD,
                    totalWPEarningsINR,
                    totalWPEarningsUSD,
                ),
            );
        }),
    );

    if (sortBy == 'noOfPosts') {
        if (sortByDirection == -1) {
            clientArray.sort(compareClientPosts).reverse();
        } else {
            clientArray.sort(compareClientPosts);
        }
    }

    if (sortBy == 'noOfApplications') {
        if (sortByDirection == -1) {
            clientArray.sort(comapreClientApplications).reverse();
        } else {
            clientArray.sort(comapreClientApplications);
        }
    }

    const totalPages = Math.ceil(clientArray.length / paginationSize);
    const totalRecords = clientArray.length;
    var currentPageClients = [];
    const pageNumber = reqArguments['pageNumber'];
    const startIndex = (pageNumber - 1) * paginationSize;
    const endIndex = pageNumber * paginationSize - 1;
    var pageDetails = {};
    pageDetails['total'] = totalPages;
    pageDetails['currentPage'] = pageNumber;
    pageDetails['totalRecords'] = totalRecords;
    if (pageNumber > totalPages) {
        throw new NotFound(`Page Number: ${pageNumber} doesn't exist`);
    } else if (pageNumber == totalPages && totalRecords % paginationSize != 0) {
        const lastIndex = totalRecords % paginationSize;
        currentPageClients = clientArray.slice(
            startIndex,
            startIndex + lastIndex,
        );
    } else {
        currentPageClients = clientArray.slice(startIndex, endIndex + 1);
    }

    return { clients: currentPageClients, pageDetails: pageDetails };
};

// > Get Client's name and Id Only for fetching in post job admin

exports.getClientsNameAndId = async ({ admin, searchValue }) => {
    // var projectedFields = { cpis: 1, ppis: 1, cn: 1, e: 1, mo: 1, n: 1, acst: 1 };
    var clients;

    // if (reqArguments['status'] == 'all') {
    // 	reqArguments['status'] = {
    // 		$in: [...Object.values(C.CLIENT_ACCOUNT_STATUS)],
    // 	};
    // }

    clients = await Client.find({
        $or: [
            { 'n.f': { $regex: searchValue, $options: '-i' } },
            { 'n.l': { $regex: searchValue, $options: '-i' } },
            { e: { $regex: searchValue, $options: '-i' } },
            { cn: { $regex: searchValue, $options: '-i' } },
        ],
    })
        .select('id n img acst e mo cn')
        .exec();

    return { clients };
};

//Admin Module, Miscellaneous

class userDetails {
    constructor(
        userId,
        first,
        last,
        email,
        mobile,
        status,
        totalApplications,
        userStats,
        userType,
        accountStatus,
        rfb,
        lastActive,
        loginCount,
        link,
        role,
    ) {
        this.userId = userId;
        this.first = first;
        this.last = last;
        this.email = email;
        this.mobile = mobile;
        this.status = status;
        this.totalApplications = totalApplications;
        this.userStats = userStats;
        this.userType = userType;
        this.accountStatus = accountStatus;
        this.reasonForBan = rfb;
        this.lastActive = lastActive;
        this.loginCount = loginCount;
        this.link = link;
        this.role = role;
    }
}

function compareUser(aUser, bUser) {
    if (aUser.totalApplications < bUser.totalApplications) {
        return -1;
    } else if (aUser.totalApplications > bUser.totalApplications) {
        return 1;
    } else {
        return 0;
    }
}

//Admin Module, People Page

exports.deletePeople = async ({ admin, peopleId }) => {
    const deletedPeople = await User.delete({ _id: peopleId }).exec();
    if (deletedPeople) {
        return 'Deleted Successfully';
    } else {
        throw new InternalServerError('Could not delete the person');
    }
};
// Called by report controller
async function cautionSpecificPeople({ admin, peopleId, reason }) {
    const people = await User.findOne({ _id: peopleId }, { n: 1, e: 1 }).exec();
    if (people) {
        // rfb is used as reasonForCaution
        people.rfb = reason;
        await people.save();
        if (people['e'] && people['e'] != '') {
            notificationSA('cautioned', people.__t, {
                email: people['e'],
                reason: reason,
                name: people['n']['f'] + ' ' + people['n']['l'],
            });
            return 'Cautioned Successfully';
        }
    } else {
        throw new InternalServerError('Could not find the person');
    }
}
exports.cautionSpecificPeople = cautionSpecificPeople;

exports.unBanPeople = async ({ admin, reqArguments }) => {
    if (reqArguments['userType'] == 'Writer') {
        const updatedWriter = await Writer.findOneAndUpdate(
            { _id: reqArguments['userId'] },
            { $set: { acst: C.ACCOUNT_STATUS.ACTIVE } },
        );
        if (!updatedWriter) {
            throw new InternalServerError('No such Writer Exists');
        }
        if (
            updatedWriter['e'] &&
            updatedWriter['e'] != '' &&
            updatedWriter['n'] != undefined
        ) {
            /*
            notificationSA('un-ban-writer', 'writer', {
                email: updatedWriter['e'],
                name:
                    (updatedWriter['n']['f'] == undefined
                        ? ''
                        : updatedWriter['n']['f']) +
                    ' ' +
                    (updatedWriter['n']['l'] == undefined
                        ? ''
                        : updatedWriter['n']['l']),
            });*/
        }
        const updatedApplications = await JobBoardApplications.updateMany(
            { writer: reqArguments['userId'] },
            { $set: { jobOnHold: false } },
        ).exec();
        if (!updatedApplications) {
            throw new InternalServerError(
                'Problem Encountered updating Applications',
            );
        }
    } else if (reqArguments['userType'] == 'Client') {
        const updatedClient = await Client.findOneAndUpdate(
            { _id: reqArguments['userId'] },
            { $set: { acst: C.ACCOUNT_STATUS.ACTIVE } },
        );
        if (!updatedClient) {
            throw new InternalServerError('No such Client Exists');
        }
        if (
            updatedClient['e'] &&
            updatedClient['e'] != '' &&
            updatedClient['n'] != undefined
        ) {
            /*
            notificationSA('un-ban-client', 'client', {
                name:
                    (updatedClient['n']['f'] == undefined
                        ? ''
                        : updatedClient['n']['f']) +
                    ' ' +
                    (updatedClient['n']['l'] == undefined
                        ? ''
                        : updatedClient['n']['l']),
                organizationName: updatedClient['cn'],
                email: updatedClient['e'],
            });*/
        }
        const jobs = updatedClient['cpis'];
        if (jobs.length > 0) {
            const updatedJob = await JobBoard.updateMany(
                { _id: { $in: jobs } },
                {
                    $set: {
                        jobOnHold: false,
                        status: C.JOB_BOARD_OPPORTUNITY_STATES.ACTIVE,
                    },
                },
            ).exec();
            const updatedApplications = await JobBoardApplications.updateMany(
                { job: { $in: jobs } },
                { $set: { jobOnHold: false } },
            ).exec();
            const writers = await JobBoardApplications.find(
                { job: { $in: jobs } },
                { _id: 1, title: 1 },
            )
                .populate({ path: 'writer', select: ['n', 'e'] })
                .populate({ path: 'job', select: ['title'] })
                .exec();
            writers.map((writer) => {
                if (
                    writer['writer']['e'] &&
                    writer['writer']['e'] != '' &&
                    writer['writer']['n'] != undefined
                ) {
                    notificationSA('job-live', 'writer', {
                        email: writer['writer']['e'],
                        name:
                            (writer['writer']['n']['f'] == undefined
                                ? ''
                                : writer['writer']['n']['f']) +
                            ' ' +
                            (writer['writer']['n']['l'] == undefined
                                ? ''
                                : writer['writer']['n']['l']),
                        title: writer['job']['title'],
                    });
                }
            });
            if (!updatedJob || !updatedApplications) {
                throw new InternalServerError(
                    'Error Updating status of jobs and applications',
                );
            }
        }
    } else {
        //Nothing For now
    }

    return 'Ban Reverted back successfully';
};

// Also called by report controller
async function banPeople({ admin, reqArguments, reason }) {
    if (reqArguments['userType'] == 'Writer') {
        const updatedWriter = await Writer.findOneAndUpdate(
            { _id: reqArguments['userId'] },
            { $set: { acst: C.ACCOUNT_STATUS.BAN, rfb: reason } },
        );
        if (!updatedWriter) {
            throw new InternalServerError('No such Writer Exists');
        }
        const updatedApplications = await JobBoardApplications.updateMany(
            { writer: reqArguments['userId'] },
            { $set: { jobOnHold: true } },
        ).exec();
        if (!updatedApplications) {
            throw new InternalServerError(
                'Problem Encountered updating Applications',
            );
        }
        if (
            updatedWriter['e'] &&
            updatedWriter['e'] != '' &&
            updatedWriter['n'] != undefined
        ) {
            notificationSA('banned', 'writer', {
                email: updatedWriter['e'],
                reason: reason,
                name:
                    (updatedWriter['n']['f'] == undefined
                        ? ''
                        : updatedWriter['n']['f']) +
                    ' ' +
                    (updatedWriter['n']['l'] == undefined
                        ? ''
                        : updatedWriter['n']['l']),
            });
        }
    } else if (reqArguments['userType'] == 'Client') {
        const updatedClient = await Client.findOneAndUpdate(
            { _id: reqArguments['userId'] },
            { $set: { acst: C.ACCOUNT_STATUS.BAN, rfb: reason } },
        );
        if (!updatedClient) {
            throw new InternalServerError('No such Client Exists');
        }
        if (
            updatedClient['e'] &&
            updatedClient['e'] != '' &&
            updatedClient['n'] != undefined
        ) {
            notificationSA('banned', 'client', {
                email: updatedClient['e'],
                reason: reason,
                name:
                    (updatedClient['n']['f'] == undefined
                        ? ''
                        : updatedClient['n']['f']) +
                    ' ' +
                    (updatedClient['n']['l'] == undefined
                        ? ''
                        : updatedClient['n']['l']),
            });
        }
        const jobs = updatedClient['cpis'];
        if (jobs.length > 0) {
            const updatedJob = await JobBoard.updateMany(
                { _id: { $in: jobs } },
                {
                    $set: {
                        jobOnHold: true,
                        status: C.JOB_BOARD_OPPORTUNITY_STATES.BAN,
                        rfb: reason,
                    },
                },
            ).exec();
            const updatedApplications = await JobBoardApplications.updateMany(
                { job: { $in: jobs } },
                { $set: { jobOnHold: true } },
            ).exec();
            const writers = await JobBoardApplications.find(
                { job: { $in: jobs } },
                { _id: 1, title: 1 },
            )
                .populate({ path: 'writer', select: ['n', 'e'] })
                .populate({ path: 'job', select: ['title'] })
                .exec();
            writers.map((writer) => {
                console.log(writer);
                if (
                    writer['writer']['e'] &&
                    writer['writer']['e'] != '' &&
                    writer['writer']['n'] != undefined
                ) {
                    notificationSA('job-on-hold', 'writer', {
                        email: writer['writer']['e'],
                        name:
                            (writer['writer']['n']['f'] == undefined
                                ? ''
                                : writer['writer']['n']['f']) +
                            ' ' +
                            (writer['writer']['n']['l'] == undefined
                                ? ''
                                : writer['writer']['n']['l']),
                        title: writer['job']['title'],
                        reason: "Client's account was Banned",
                    });
                }
            });
            if (!updatedJob || !updatedApplications) {
                throw new InternalServerError(
                    'Error Updating status of jobs and applications',
                );
            }
        }
    } else {
        //Nothing For now
    }

    return 'Ban Put up successfully';
}
exports.banPeople = banPeople;

exports.setLevelOfWriter = async ({ writerId, level }) => {
    const updatedLevel = await Writer.findByIdAndUpdate(
        writerId,
        {
            lv: level,
        },
        { new: true },
    )
        .select('lv e applications')
        .exec();
    if (!updatedLevel) {
        throw new BadRequest('Failed to update level');
    }
    if (level == C.CREATOR_LEVEL.CLASSIFIED) {
        /**
         * Drop all applications of creator
         */
        const applications = await JobBoardApplications.find({
            writer: writerId,
        })
            .select('_id job')
            .exec();
        const jobToAppl = new Map();
        const jobIds = applications.map((appl) => {
            jobToAppl.set(appl.job.toString(), appl.id);
            return appl.job;
        });
        const jobs = await JobBoard.find({
            _id: { $in: jobIds },
        }).exec();
        await Promise.all(
            _.map(jobs, async (job) => {
                job.applications.pull(jobToAppl.get(job.id));
                job.ac = Math.max(job.ac - 1, 0);
                await job.save();
            }),
        );
        await JobBoardApplications.deleteMany({
            writer: writerId,
        }).exec();
        updatedLevel.applications = [];
        await updatedLevel.save();
        //
        // Drop creator from all shortlisted list of client if present
        //
        const shortlisted = await Client.updateMany(
            {
                sht: writerId,
            },
            {
                $pull: { sht: mongoose.Types.ObjectId(writerId) },
            },
        ).exec();
    }
    return { success: true };
};
exports.getSpecificPeople = async ({ admin, peopleId }) => {
    const people = await User.findOne({ _id: peopleId })
        .select(
            '-passwordVersion -password -isMobileVerified -isEmailVerified -emailVerificationToken -words -jobAnalytics -noOfRatings -averageRating -voexam -subexam -wordstats -pastTransactions -jobs -availableJobs -savedJobs -momentum -avgTAT -paymentIds ',
        )
        .exec();
    // console.log(people);
    if (people) {
        var totalApplications = 0;
        var totalReports = 0;
        var userType = '';
        let blockTypes = [];

        if (people['__t'] == 'Client') {
            userType = 'Client';
            totalApplications = await JobBoardApplications.find({
                client: peopleId,
            }).count();
            totalReports = await Report.find({
                against: { uid: peopleId },
            }).count();
        } else if (people['__t'] == 'Writer') {
            userType = 'Creator';
            totalApplications = await JobBoardApplications.find({
                writer: peopleId,
            }).count();
            totalReports = await Report.find({
                against: { uid: peopleId },
            }).count();
            const blockQuery = {
                uid: peopleId,
                __t: {
                    $in: [
                        C.MODELS.IMAGE_BLOCK,
                        C.MODELS.PDF_BLOCK,
                        C.MODELS.LINK_BLOCK,
                        C.MODELS.SERVICE_BLOCK,
                        C.MODELS.PROJECT_BLOCK,
                    ],
                },
            };
            blockTypes = await Block.find(blockQuery).select('__t').exec();
        } else {
            userType = people['__t'];
        }
        var returnArguments = {
            totalApplications: totalApplications,
            totalReports: totalReports,
            userType,
            blockTypes,
            ...people.toJSON(),
        };

        return { person: returnArguments };
    } else {
        throw new InternalServerError("Person doesn't exist");
    }
};

exports.searchPeople = async ({ role, searchString, classified }) => {
    const query = {
        __t: role,
        $or: [
            { 'n.f': { $regex: searchString, $options: '-i' } },
            { 'n.l': { $regex: searchString, $options: '-i' } },
            { e: { $regex: searchString, $options: '-i' } },
        ],
    };
    if (role == C.ROLES.WRITER_C && typeof classified == 'boolean') {
        query.lv = classified
            ? C.CREATOR_LEVEL.CLASSIFIED
            : C.CREATOR_LEVEL.NORMAL;
    }
    const users = await User.find(query).select('img n e').exec();

    return { users };
};

exports.getAllPeople = async ({ admin, reqArguments, reqBody }) => {
    var projectedFields = {
        _id: 1,
        e: 1,
        __t: 1,
        n: 1,
        mo: 1,
        acst: 1,
        rfb: 1,
        pn: 1,
        stid: 1,
        lac: 1,
        logc: 1,
        sbmt: 1,
    };
    var searchBy =
        reqBody['searchBy'] == undefined ? null : reqBody['searchBy'];
    var searchValue =
        reqBody['searchValue'] == undefined ? null : reqBody['searchValue'];
    var sortBy = reqBody['sortBy'] == undefined ? null : reqBody['sortBy'];
    var sortByDirection =
        reqBody['sortByDirection'] == undefined
            ? null
            : reqBody['sortByDirection'];
    let role = reqBody.role;

    let obs = null;
    if (reqArguments['status'] == 'Onboarded') {
        obs = {
            $nin: [
                C.V3_CREATOR_ONBOARDING_STATES.STEP_NEW,
                C.V3_CREATOR_ONBOARDING_STATES.STEP_SETUP,
            ],
        };
    }
    if (reqArguments['status'] == 'Not Onboarded') {
        obs = {
            $in: [
                C.V3_CREATOR_ONBOARDING_STATES.STEP_NEW,
                C.V3_CREATOR_ONBOARDING_STATES.STEP_SETUP,
            ],
        };
    }

    if (
        reqArguments['status'] == 'all' ||
        reqArguments['status'] == 'Onboarded' ||
        reqArguments['status'] == 'Not Onboarded'
    ) {
        reqArguments['status'] = {
            $in: [...Object.values(C.ACCOUNT_STATUS)],
        };
    }

    let sortQuery = { createdAt: -1 };
    if (reqBody.sortBy === 'lastActive') {
        sortQuery = { lac: reqBody.sortByDirection };
    } else if (reqBody.sortBy === 'loginCount') {
        sortQuery = { logc: reqBody.sortByDirection };
    }
    let findQuery = {};
    if (obs) {
        findQuery = {
            ...findQuery,
            obs,
        };
    }
    if (role) {
        findQuery = { ...findQuery, __t: role };
    }
    if (
        typeof reqBody.pfSubmitted == 'boolean' &&
        (role == C.ROLES.PM_C || role == C.ROLES.WRITER_C)
    ) {
        findQuery = { ...findQuery, sbmt: reqBody.pfSubmitted };
    }
    if (typeof reqBody.creatorLevel == 'number' && role == C.ROLES.WRITER_C) {
        findQuery = { ...findQuery, lv: reqBody.creatorLevel };
    }

    if (searchBy && searchBy != '' && searchValue && searchValue != '') {
        if (searchBy == 'email') {
            findQuery = {
                ...findQuery,
                acst: reqArguments['status'],
                e: { $regex: searchValue, $options: '-i' },
            };
        }
        if (searchBy == 'name') {
            findQuery = {
                ...findQuery,
                $or: [
                    { 'n.f': { $regex: searchValue, $options: '-i' } },
                    { 'n.l': { $regex: searchValue, $options: '-i' } },
                ],
                acst: reqArguments['status'],
            };
        }
    } else {
        findQuery = { ...findQuery, acst: reqArguments['status'] };
    }
    let users = await User.find(findQuery, projectedFields)
        .sort(sortQuery)
        .exec();

    let userArray = [];

    for (let i = 0; i < users.length; i++) {
        let user = users[i];
        var totalApplications = 0;
        var userStats = null;
        var userType = user.__t;
        if (user['__t'] == 'Writer') {
            const writerStat = await JobBoardApplications.aggregate([
                { $match: { writer: user['_id'] } },
                {
                    $group: {
                        _id: { status: '$status' },
                        count: { $sum: 1 },
                    },
                },
            ]).exec();
            writerStatDict = {};
            var statCounter = 0;
            var appsCount = 0;
            for (; statCounter < writerStat.length; ++statCounter) {
                writerStatDict[writerStat[statCounter]['_id']['status']] =
                    parseInt(writerStat[statCounter]['count']);
                appsCount += parseInt(writerStat[statCounter]['count']);
            }
            if (appsCount > 0) {
                writerStatDict['total'] = appsCount;
                if (!Object.keys(writerStatDict).includes('shortlisted')) {
                    writerStatDict['shortlisted'] = 0;
                }
                if (!Object.keys(writerStatDict).includes('pending')) {
                    writerStatDict['pending'] = 0;
                }
                if (!Object.keys(writerStatDict).includes('hired')) {
                    writerStatDict['hired'] = 0;
                }
                if (!Object.keys(writerStatDict).includes('not selected')) {
                    writerStatDict['not selected'] = 0;
                }
                //End
                userStats = writerStatDict;
            }
            totalApplications = appsCount;
            userType = 'Creator';
        }
        if (user['__t'] == 'Client') {
            const appsCount = await JobBoardApplications.countDocuments({
                client: user['_id'],
            }).exec();
            totalApplications = appsCount;
            userType = 'Client';
        }

        const userId = user['_id'] == undefined ? null : user['_id'];
        const role = user.__t;
        var first, last;
        if (user['name'] == undefined) {
            first = null;
            last = null;
        } else {
            first = user['name']['first'];
            last = user['name']['last'];
        }

        const email = user['email'] == undefined ? null : user['email'];
        const mobile = user['mobile'] == undefined ? null : user['mobile'];
        const status =
            user['accountStatus'] == undefined ? null : user['accountStatus'];
        const lastActive = user['lac'];
        const loginCount = user['logc'];
        const rfb = user['rfb'] == undefined ? null : user['rfb'];
        let link = '';
        if (user.__t == C.MODELS.WRITER_C) {
            link = `${env.FRONTEND_URL}/${user.pn}`;
        }
        if (user.__t == C.MODELS.PM_C) {
            link = `${env.PM_PORTFOLIO}/${user.stid}`;
        }
        userArray.push({
            userId,
            first,
            last,
            email,
            mobile,
            status,
            totalApplications,
            userStats,
            userType,
            status,
            rfb,
            lastActive,
            loginCount,
            link,
            role,
        });
    }

    if (sortBy == 'noOfApplications') {
        if (sortByDirection == -1) {
            userArray.sort(compareUser).reverse();
        } else {
            userArray.sort(compareUser);
        }
    }

    var pageNumber = reqArguments['pageNumber'];
    const totalPages = Math.ceil(userArray.length / paginationSize);
    const totalRecords = userArray.length;
    var currentPageUsers = [];
    const startIndex = (pageNumber - 1) * paginationSize;
    const endIndex = pageNumber * paginationSize - 1;

    var pageDetails = {};
    pageDetails['total'] = totalPages;
    pageDetails['currentPage'] = pageNumber;
    pageDetails['totalRecords'] = totalRecords;

    if (pageNumber > totalPages) {
        throw new NotFound(`Page Number: ${pageNumber} doesn't exist`);
    } else if (pageNumber == totalPages && totalRecords % paginationSize != 0) {
        const lastIndex = totalRecords % paginationSize;
        currentPageUsers = userArray.slice(startIndex, startIndex + lastIndex);
    } else {
        currentPageUsers = userArray.slice(startIndex, endIndex + 1);
    }
    return { users: currentPageUsers, pageDetails: pageDetails };
};

//Admin Module, Posts Page

// Also called by report controller
async function banPost({ admin, jobId, reason }) {
    const job = await JobBoard.findOneAndUpdate(
        { _id: jobId },
        {
            $set: {
                jobOnHold: true,
                status: C.JOB_BOARD_OPPORTUNITY_STATES.BAN,
                rfb: reason,
            },
        },
    ).exec();
    if (!job) {
        throw new BadRequest('No such job exists');
    }
    const client = await Client.findOne(
        { _id: job['client'] },
        { n: 1, cn: 1, e: 1 },
    );
    if (job['applications'].length > 0) {
        const apps = await JobBoardApplications.updateMany(
            { job: jobId },
            { $set: { jobOnHold: true } },
        ).exec();
        if (!apps) {
            throw new InternalServerError('Error Updating Applications');
        }
        const writers = await JobBoardApplications.find(
            { job: jobId },
            { _id: 1 },
        )
            .populate({ path: 'writer', select: ['n', 'e'] })
            .exec();
        writers.map((writer) => {
            console.log(writer);
            if (
                writer['writer']['e'] &&
                writer['writer']['e'] != '' &&
                writer['writer']['n'] != undefined
            ) {
                notificationSA('job-on-hold', 'writer', {
                    email: writer['writer']['e'],
                    name:
                        (writer['writer']['n']['f'] == undefined
                            ? ''
                            : writer['writer']['n']['f']) +
                        ' ' +
                        (writer['writer']['n']['l'] == undefined
                            ? ''
                            : writer['writer']['n']['l']),
                    title: job['title'],
                    reason: 'The Job Post was Banned',
                });
            }
        });
    }
    if (client['e'] && client['e'] != undefined && client['n'] != undefined) {
        notificationSA('post-banned', 'client', {
            email: client['e'],
            name:
                (client['n']['f'] == undefined ? '' : client['n']['f']) +
                ' ' +
                (client['n']['l'] == undefined ? '' : client['n']['l']),
            organizationName: client['cn'],
            reason: reason,
        });
    }
    // Cancel Agendas
    // Cancel 2day and 15day reminder emails
    await agenda.cancel({
        name: {
            $in: ['client_2_day', 'client_15_day'],
        },
        'data.job.id': job._id,
        'data.client.id': client._id,
    });
    return 'Ban put up successfully';
}
exports.banPost = banPost;

exports.unbanPost = async ({ admin, jobId }) => {
    const job = await JobBoard.findOneAndUpdate(
        { _id: jobId },
        {
            $set: {
                jobOnHold: false,
                status: C.JOB_BOARD_OPPORTUNITY_STATES.ACTIVE,
            },
        },
    ).exec();
    if (!job) {
        throw new BadRequest('No such job exists');
    }
    const client = await Client.findOne(
        { _id: job['client'] },
        { n: 1, cn: 1, e: 1 },
    );

    if (job['applications'].length > 0) {
        const apps = await JobBoardApplications.updateMany(
            { job: jobId },
            { $set: { jobOnHold: false } },
        ).exec();
        if (!apps) {
            throw new InternalServerError('Error Updating Applications');
        }
        const writers = await JobBoardApplications.find(
            { job: jobId },
            { _id: 1 },
        )
            .populate({ path: 'writer', select: ['n', 'e'] })
            .exec();
        writers.map((writer) => {
            console.log(writer);
            if (
                writer['writer']['e'] &&
                writer['writer']['e'] != '' &&
                writer['writer']['n'] != undefined
            ) {
                notificationSA('job-live', 'writer', {
                    email: writer['writer']['e'],
                    name:
                        writer['writer']['n']['f'] +
                        ' ' +
                        writer['writer']['n']['l'],
                    title: job['title'],
                });
            }
        });
    }
    if (client['e'] && client['e'] != '' && client['n'] != undefined) {
        notificationSA('post-unbanned', 'client', {
            email: client['e'],
            name:
                (client['n']['f'] == undefined ? '' : client['n']['f']) +
                ' ' +
                (client['n']['l'] == undefined ? '' : client['n']['l']),
            organizationName: client['cn'],
        });
    }
    return 'Ban reverted successfully';
};

exports.deleteSpecificPost = async ({ admin, jobId }) => {
    const job = await JobBoard.findOneAndDelete({ _id: jobId }).exec();
    if (!job) {
        throw new InternalServerError('No such job exists');
    }
    if (job['applications'].length > 0) {
        const apps = await JobBoardApplications.deleteMany({
            _id: { $in: job['applications'] },
        }).exec();
        if (!apps) {
            throw InternalServerError(
                'Problem Encountered in Deleting Applications',
            );
        }
    }
    return 'Deletion Successful';
};

exports.getAllPosts = async ({ admin, reqArguments, reqBody }) => {
    var postsAPIResponses = [];

    // Sort by
    sortBy = reqBody['sortBy'] ? reqBody['sortBy'] : null;

    var searchField = '';
    var searchBy = '';
    var jobs = [];

    var findArguments = {};
    var projectedFields = {
        title: 1,
        client: 1,
        status: 1,
        deadline: 1,
        _id: 1,
        applications: 1,
        jobOnHold: 1,
        rfb: 1,
        clr: 1,
        pmrq: 1,
    };
    var sortByDirection = reqBody['sortByDirection'];

    if (reqArguments['status']) {
        if (reqArguments['status'] == 'all') {
            // Logic for all jobs
            findArguments['status'] = {
                $in: [...Object.values(C.JOB_BOARD_OPPORTUNITY_STATES)],
            };
        } else {
            findArguments['status'] = reqArguments['status'];
        }
    }

    if (typeof reqBody['remoteFriendly'] === 'boolean') {
        findArguments['remoteFriendly'] = reqBody['remoteFriendly'];
    }

    if (reqBody['searchBy'] != '') {
        searchBy = reqBody['searchBy'];
        if (reqBody['searchValue']) {
            searchField = reqBody['searchValue'];
        }
    }

    if (searchField != '' && searchBy == 'clients') {
        jobs = await JobBoard.find(findArguments, projectedFields)
            .sort({ [sortBy]: sortByDirection })
            .populate({
                path: 'client',
                match: { cn: { $regex: searchField, $options: 'i' } },
                select: ['stid', 'cn', 'e', 'mo', 'n'],
            })
            .exec();
    } else if (searchField != '' && reqBody['searchBy'] != 'clients') {
        findArguments[searchBy] = new RegExp([searchField], 'i'); //{[$regex]: searchField};
        jobs = await JobBoard.find(findArguments, projectedFields)
            .sort({ [sortBy]: sortByDirection })
            .populate({
                path: 'client',
                select: ['stid', 'cn', 'e', 'mo', 'n'],
            })
            .exec();
    } else {
        jobs = await JobBoard.find(findArguments, projectedFields)
            .sort({ [sortBy]: sortByDirection })
            .populate({
                path: 'client',
                select: ['stid', 'cn', 'e', 'mo', 'n'],
            })
            .exec();
    }
    console.log(findArguments, projectedFields);
    // const jobs = await JobBoard.find({},{"title":1,"client":1,"status":1,"deadline":1,"_id":1,"applications":1}).exec();

    // console.log(jobs);
    var pageNumber = reqArguments['pageNumber'];
    const totalPages = Math.ceil(jobs.length / paginationSize);
    const totalRecords = jobs.length;
    var currentPageJobs = [];
    const startIndex = (pageNumber - 1) * paginationSize;
    const endIndex = pageNumber * paginationSize - 1;
    var pageDetails = {};
    pageDetails['total'] = totalPages;
    pageDetails['currentPage'] = pageNumber;
    pageDetails['totalRecords'] = totalRecords;

    if (pageNumber > totalPages) {
        throw new NotFound(`Page Number: ${pageNumber} doesn't exist`);
    } else if (pageNumber == totalPages && totalRecords % paginationSize != 0) {
        const lastIndex = totalRecords % paginationSize;
        currentPageJobs = jobs.slice(startIndex, startIndex + lastIndex);
    } else {
        currentPageJobs = jobs.slice(startIndex, endIndex + 1);
    }

    await Promise.all(
        currentPageJobs.map(async (job) => {
            const jobStat = await JobBoardApplications.aggregate([
                { $match: { job: job['_id'] } },
                {
                    $group: {
                        _id: { status: '$status' },
                        count: { $sum: 1 },
                    },
                },
            ]).exec();
            const allDetails = {};
            allDetails['jobId'] = job['_id'] == undefined ? null : job['_id'];
            allDetails['postTitle'] =
                job['title'] == undefined ? null : job['title'];
            allDetails['email'] =
                job['client']['mobile'] == undefined
                    ? null
                    : job['client']['email'];
            allDetails['mobile'] =
                job['client']['mobile'] == undefined
                    ? null
                    : job['client']['mobile'];
            allDetails['status'] =
                job['status'] == undefined ? null : job['status'];
            allDetails['expiry'] =
                job['deadline'] == undefined ? null : job['deadline'];
            allDetails['orgName'] =
                job['client']['company'] == undefined
                    ? null
                    : job['client']['company'];
            allDetails['jobOnHold'] =
                job['jobOnHold'] == undefined ? null : job['jobOnHold'];
            if (job['client']['name'] == undefined) {
                allDetails['firstName'] = null;
                allDetails['lastName'] = null;
            } else {
                allDetails['firstName'] = job['client']['name']['first'];
                allDetails['lastName'] = job['client']['name']['last'];
            }
            allDetails['clientId'] =
                job['client']['id'] == undefined ? null : job['client']['id'];
            allDetails.clientRole = job.clientRole;
            allDetails.pmRequired = job.pmRequired;
            jobStatDict = {};
            var statCounter = 0;
            var totalApps = 0;
            for (; statCounter < jobStat.length; ++statCounter) {
                const count = parseInt(jobStat[statCounter]['count']);
                jobStatDict[jobStat[statCounter]['_id']['status']] = count;
                totalApps += count;
            }
            if (jobStat.length > 0) {
                //Set 0 to ones not present
                jobStatDict['total'] = totalApps;
                if (!Object.keys(jobStatDict).includes('shortlisted')) {
                    jobStatDict['shortlisted'] = 0;
                }
                if (!Object.keys(jobStatDict).includes('pending')) {
                    jobStatDict['pending'] = 0;
                }
                if (!Object.keys(jobStatDict).includes('hired')) {
                    jobStatDict['hired'] = 0;
                }
                if (!Object.keys(jobStatDict).includes('rejected')) {
                    jobStatDict['rejected'] = 0;
                }
                if (!Object.keys(jobStatDict).includes('suggested')) {
                    jobStatDict['suggested'] = 0;
                }
                //End
            } else {
                jobStatDict = null;
            }

            allDetails['postDetails'] = jobStatDict;
            postsAPIResponses.push(allDetails);
        }),
    ).catch((err) => {
        throw new InternalServerError('DB Error');
    });
    /* else {
        await Promise.all(
            currentPageJobs.map(async (job) => {
                const jobStat = await JobBoardApplications.aggregate([
                    { $match: { job: job['_id'] } },
                    {
                        $group: {
                            _id: { status: '$status' },
                            count: { $sum: 1 },
                        },
                    },
                ]).exec();
                const client = await Client.find(
                    { _id: job['client'] },
                    { _id: 1, e: 1, mo: 1, cn: 1, n: 1 },
                ).exec();
                if (client.length != 0) {
                    const allDetails = {};
                    allDetails['jobId'] =
                        job['_id'] == undefined ? null : job['_id'];
                    allDetails['postTitle'] =
                        job['title'] == undefined ? null : job['title'];
                    allDetails['email'] =
                        client[0]['email'] == undefined
                            ? null
                            : client[0]['email'];
                    allDetails['mobile'] =
                        client[0]['mobile'] == undefined
                            ? null
                            : client[0]['mobile'];
                    allDetails['status'] =
                        job['status'] == undefined ? null : job['status'];
                    allDetails['expiry'] =
                        job['deadline'] == undefined ? null : job['deadline'];
                    allDetails['orgName'] =
                        client[0]['company'] == undefined
                            ? null
                            : client[0]['company'];
                    allDetails['jobOnHold'] =
                        job['jobOnHold'] == undefined ? null : job['jobOnHold'];
                    if (client[0]['name'] == undefined) {
                        allDetails['firstName'] = null;
                        allDetails['lastName'] = null;
                    } else {
                        allDetails['firstName'] = client[0]['name']['first'];
                        allDetails['lastName'] = client[0]['name']['last'];
                    }
                    allDetails['clientId'] =
                        client[0]['id'] == undefined ? null : client[0]['id'];
                    allDetails.clientRole = job.clientRole;
                    allDetails.pmRequired = job.pmRequired;
                    jobStatDict = {};
                    var statCounter = 0;
                    var totalApps = 0;
                    for (; statCounter < jobStat.length; ++statCounter) {
                        const count = parseInt(jobStat[statCounter]['count']);
                        jobStatDict[
                            jobStat[statCounter]['_id']['status']
                        ] = count;
                        totalApps += count;
                    }
                    if (jobStat.length > 0) {
                        //Set 0 to ones not present
                        jobStatDict['total'] = totalApps;
                        if (!Object.keys(jobStatDict).includes('shortlisted')) {
                            jobStatDict['shortlisted'] = 0;
                        }
                        if (!Object.keys(jobStatDict).includes('pending')) {
                            jobStatDict['pending'] = 0;
                        }
                        if (!Object.keys(jobStatDict).includes('hired')) {
                            jobStatDict['hired'] = 0;
                        }
                        if (!Object.keys(jobStatDict).includes('rejected')) {
                            jobStatDict['rejected'] = 0;
                        }
                        if (!Object.keys(jobStatDict).includes('suggested')) {
                            jobStatDict['suggested'] = 0;
                        }
                        //End
                    } else {
                        jobStatDict = null;
                    }
                    allDetails['postDetails'] = jobStatDict;
                    postsAPIResponses.push(allDetails);
                }
            }),
        ).catch((err) => {
            throw new InternalServerError('DB Error');
        });
    } */

    return { posts: postsAPIResponses, pageDetails: pageDetails };
};

/**
 *
 * Admin Module - Report
 */

// ? Add Post Details if type is post
exports.getSpecificReport = async ({ admin, reportId }) => {
    const report = await Report.findOne({ _id: reportId })
        .populate({
            path: 'postId',
            select: 'title id status updatedAt postedOn projectDescription rfb',
        })
        .exec();
    if (!report) {
        throw new InternalServerError("Report doesn't exist");
    }
    return report;
};

exports.deleteSpecificReport = async ({ admin, reportId }) => {
    const deletedReport = await Report.deleteOne({ _id: reportId }).exec();
    if (deletedReport) {
        return 'Successfully Deleted Report';
    } else {
        throw new InternalServerError('Report could not be deleted');
    }
};

exports.updateSpecificReport = async ({
    admin,
    reportId,
    reportActionStatus,
    reason,
}) => {
    var report_status;
    if (reportActionStatus == 'review_pending') {
        report_status = 'pending';
    } else {
        report_status = 'acted';
    }

    const updatedReport = await Report.findById(reportId).exec();
    if (!updatedReport) {
        throw new BadRequest('No such Report');
    }
    try {
        const reportType = updatedReport.report_type;
        if (
            reportType === C.JOB_BOARD_REPORT_TYPE.POST &&
            reportActionStatus === C.JOB_BOARD_REPORT_ACTION_STATES.REPORTEE_BAN
        ) {
            // post action
            await banPost({ jobId: updatedReport.postId, reason });
        }
        if (reportType === C.JOB_BOARD_REPORT_TYPE.PROFILE) {
            const reportedUser = await User.findById(
                updatedReport.against.uid,
            ).exec();
            // profile action
            if (
                reportActionStatus ===
                C.JOB_BOARD_REPORT_ACTION_STATES.REPORTEE_BAN
            ) {
                const reqArguments = {
                    userId: reportedUser.id,
                    userType: reportedUser.__t,
                };
                await banPeople({ reqArguments, reason });
            }
            if (
                reportActionStatus ===
                C.JOB_BOARD_REPORT_ACTION_STATES.REPORTEE_CAUTIONED
            ) {
                await cautionSpecificPeople({
                    peopleId: reportedUser.id,
                    reason,
                });
            }
        }
        updatedReport.report_status = report_status;
        updatedReport.action_status = reportActionStatus;
        await updatedReport.save();
        return 'Updated Successfully';
    } catch (err) {
        console.log(err);
        throw new InternalServerError('Error in performing report action');
    }
};

exports.getAllReports = async ({ admin, reqArguments, reqBody }) => {
    var searchBy =
        reqBody['searchBy'] == undefined ? null : reqBody['searchBy'];
    var searchValue =
        reqBody['searchValue'] == undefined ? null : reqBody['searchValue'];
    var sortBy = reqBody['sortBy'] == undefined ? null : reqBody['sortBy'];
    var sortByDirection =
        reqBody['sortByDirection'] == undefined
            ? null
            : reqBody['sortByDirection'];
    var reports;

    var report_type = null;

    if (reqBody['report_type'] && reqBody['report_type'] != '') {
        report_type = reqBody['report_type'];
    }
    console.log(reqBody);

    if (searchBy && searchBy != '' && searchValue && searchValue != '') {
        if (searchBy == 'against') {
            if (
                sortBy &&
                sortBy == 'reportedDate' &&
                sortByDirection &&
                sortByDirection == -1
            ) {
                reports = await Report.find({
                    $or: [
                        {
                            'against.first': {
                                $regex: searchValue,
                                $options: '-i',
                            },
                        },
                        {
                            'against.last': {
                                $regex: searchValue,
                                $options: '-i',
                            },
                        },
                    ],
                    report_status: reqArguments['status'],
                    report_type:
                        report_type == null
                            ? { $in: ['profile', 'message', 'post'] }
                            : report_type,
                })
                    .sort({ reported_on: -1 })
                    .exec();
            } else {
                reports = await Report.find({
                    $or: [
                        {
                            'against.first': {
                                $regex: searchValue,
                                $options: '-i',
                            },
                        },
                        {
                            'against.last': {
                                $regex: searchValue,
                                $options: '-i',
                            },
                        },
                    ],
                    report_status: reqArguments['status'],
                    report_type:
                        report_type == null
                            ? { $in: ['profile', 'message', 'post'] }
                            : report_type,
                })
                    .sort({ reported_on: 1 })
                    .exec();
            }
        }
        if (searchBy == 'by') {
            if (
                sortBy &&
                sortBy == 'reportedDate' &&
                sortByDirection &&
                sortByDirection == -1
            ) {
                reports = await Report.find({
                    $or: [
                        { 'by.first': { $regex: searchValue, $options: '-i' } },
                        { 'by.last': { $regex: searchValue, $options: '-i' } },
                    ],
                    report_status: reqArguments['status'],
                    report_type:
                        report_type == null
                            ? { $in: ['profile', 'message', 'post'] }
                            : report_type,
                })
                    .sort({ reported_on: -1 })
                    .exec();
            } else {
                reports = await Report.find({
                    $or: [
                        { 'by.first': { $regex: searchValue, $options: '-i' } },
                        { 'by.last': { $regex: searchValue, $options: '-i' } },
                    ],
                    report_status: reqArguments['status'],
                    report_type:
                        report_type == null
                            ? { $in: ['profile', 'message', 'post'] }
                            : report_type,
                })
                    .sort({ reported_on: 1 })
                    .exec();
            }
        }
    } else {
        if (
            sortBy &&
            sortBy == 'reportedDate' &&
            sortByDirection &&
            sortByDirection == -1
        ) {
            reports = await Report.find({
                report_status: reqArguments['status'],
                report_type:
                    report_type == null
                        ? { $in: ['profile', 'message', 'post'] }
                        : report_type,
            })
                .sort({ reported_on: -1 })
                .exec();
        } else {
            console.log(report_type);
            reports = await Report.find({
                report_status: reqArguments['status'],
                report_type:
                    report_type == null
                        ? { $in: ['profile', 'message', 'post'] }
                        : report_type,
            })
                .sort({ reported_on: 1 })
                .exec();
        }
    }

    var pageNumber = reqArguments['pageNumber'];
    const totalPages = Math.ceil(reports.length / paginationSize);
    const totalRecords = reports.length;
    var currentPageReports = [];
    const startIndex = (pageNumber - 1) * paginationSize;
    const endIndex = pageNumber * paginationSize - 1;

    var pageDetails = {};
    pageDetails['total'] = totalPages;
    pageDetails['currentPage'] = pageNumber;
    pageDetails['totalRecords'] = totalRecords;

    if (pageNumber > totalPages) {
        throw new NotFound(`Page Number: ${pageNumber} doesn't exist`);
    } else if (pageNumber == totalPages && totalRecords % paginationSize != 0) {
        const lastIndex = totalRecords % paginationSize;
        currentPageReports = reports.slice(startIndex, startIndex + lastIndex);
    } else {
        currentPageReports = reports.slice(startIndex, endIndex + 1);
    }

    return { reports: currentPageReports, pageDetails: pageDetails };
};

exports.getMessages = async ({
    clientId,
    creatorId,
    cursor,
    limit,
    direction,
}) => {
    const conversation = await ConversationClient.findOne({
        u1: clientId,
        u2: creatorId,
    }).exec();
    if (!conversation) throw new BadRequest('Conversation not found');
    return commonControllers.fetchMessagesOfConversation({
        convoId: conversation.id,
        user: {
            id: clientId,
        },
        paginate: {
            cursor,
            limit,
            direction,
        },
    });
};
exports.getAllTransactions = async ({ status, mode }) => {
    const query = {};
    if (status) query.st = status;
    if (mode) query.inm = mode;
    const transactions = await Transaction.find(query)
        .sort({ updatedAt: -1 })
        .populate({
            path: 'sd',
            select: 'n e',
        })
        .populate({
            path: 'rcv',
            select: 'n e strp.acid',
        })
        .exec();
    return { transactions };
};

// ********** Industry Routes ***************

exports.addNewIndustry = async ({ name, value }) => {
    const newIndustry = new Industry();
    try {
        newIndustry.n = name;
        newIndustry.v = value;
        newIndustry.st = C.INDUSTRY_STATUS.ACTIVE;
        await newIndustry.save();
    } catch (err) {
        console.log(err);
        return {
            msg: 'industry already exists',
        };
    }
    return {
        msg: 'industry added',
        newIndustry,
    };
};

exports.setIndustryStatus = async ({ id, status }) => {
    const industry = await Industry.findById(id).exec();
    if (!industry) {
        return {
            msg: 'no such industry',
        };
    }
    industry.st = status;
    await industry.save();
    return {
        msg: status,
    };
};

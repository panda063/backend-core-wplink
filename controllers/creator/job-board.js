/*
 * Module Dependencies
 */
const mongoose = require('mongoose');
const _ = require('lodash');
const C = require('../../lib/constants');
const debug = require('debug')('creator');
debug.enabled = true;
// const NOTIF_C = require('../config/notification');

// const Level = mongoose.model(C.MODELS.LEVEL_C);
const Page = mongoose.model(C.MODELS.PAGE);
const Writer = mongoose.model(C.MODELS.WRITER_C);
const JobBoard = mongoose.model(C.MODELS.JOB_BOARD_C);
const Application = mongoose.model(C.MODELS.JOB_BOARD_APPLICATION_C);
const Report = mongoose.model(C.MODELS.JOB_BOARD_REPORTING_C);

const { BadRequest } = require('../../lib/errors');

/*
 * Helpers
 */
const {
    get_reported_jobs,
    has_writer_reported,
    has_client_reported_writer,
    client_notification_new,
    checkIfValidSampleIds,
} = require('../helpers/writerHelper');

// ---------- JOB BOARD RELATED CONTROLLERS ------------

/*
 *      Job Board Results Endpoints
 */

async function getAllOppurtinities({
    writer,
    fieldToSort,
    limit,
    employmentType,
    remoteFriendly,
    location,
    sortOrder = -1,
    page = 1,
    searchQuery,
    studioJobs,
}) {
    // Sort Query. In increasing order of priority
    let sortQ = {
        updatedAt: -1,
    };
    /*
    if (typeof searchQuery === 'string') {
        sortQ = { score: { $meta: 'textScore' } };
    }
    */
    if (fieldToSort && typeof sortOrder === 'number') {
        sortQ = {
            [fieldToSort]: sortOrder,
        };
    }
    // Filter Query
    const writerApplications = writer.applications;
    const reportedJobs = await get_reported_jobs(writer);
    const invalidStates = [
        C.JOB_BOARD_OPPORTUNITY_STATES.INACTIVE,
        C.JOB_BOARD_OPPORTUNITY_STATES.BAN,
        C.JOB_BOARD_OPPORTUNITY_STATES.CLOSED,
        C.JOB_BOARD_OPPORTUNITY_STATES.UNDER_REVIEW,
    ];
    let query = {
        status: { $nin: invalidStates },
        applications: { $nin: writerApplications },
        _id: { $nin: reportedJobs },
        // Jobs posted by PM and acting as a client
        clr: studioJobs ? C.ROLES.PM_C : C.ROLES.CLIENT_C,
    };
    // If user is writer then filter out PM required jobs from client
    // ? PMs can view and apply to both pmRequired = true or false jobs
    if (writer.__t == C.ROLES.WRITER_C)
        query = {
            ...query,
            $or: [{ pmrq: { $exists: false } }, { pmrq: false }],
        };
    // Apply other filters
    if (typeof searchQuery === 'string') {
        query = {
            ...query,
            $text: { $search: searchQuery },
        };
    }
    if (Array.isArray(employmentType)) {
        query = { ...query, employmentType: { $in: employmentType } };
    }
    if (typeof remoteFriendly === 'boolean') {
        query = { ...query, remoteFriendly: remoteFriendly };
    }
    if (typeof location === 'string') {
        query = { ...query, country: location };
    } else {
        // * By default show job posts for creators country. While posting, clients can select in which country this job post will be shown.
        query = { ...query, country: writer.adr.co };
    }
    // console.log(sortQ, page, limit, query, sortOrder);
    // Pagination Options
    let options = {
        sort: sortQ,
        select: 'it ct applications employmentType ac wc sp deadline title city country remoteFriendly deadline jt cur pmrq clr cg',
        populate: [
            {
                path: 'client',
                select: 'organisation opportunities stdd lac',
                populate: {
                    path: 'organisation opportunities',
                    select: ['name', 'openings applications'],
                    populate: { path: 'applications', select: ['status'] },
                },
            },
            {
                path: 'applications',
                select: 'status',
            },
        ],
        page: page,
        limit: limit,
    };
    const jobsPage = await JobBoard.paginate(query, options);
    const jobs = [];
    jobsPage.docs.map((job) => {
        // console.log(job.toJSON());
        let totalShortlisted = 0;
        let totalHires = 0;
        for (let sc of job.applications) {
            totalShortlisted +=
                sc.status === C.JOB_BOARD_APPLICATION_STATES.SHORTLISTED
                    ? 1
                    : 0;
        }
        for (let cop of job.client.opportunities) {
            for (cap of cop.applications) {
                // console.log(cap.toJSON());
                if (cap.status === C.JOB_BOARD_APPLICATION_STATES.HIRED) {
                    totalHires += 1;
                }
            }
        }
        job = job.toJSON();
        // console.log(job);
        if (job.clientRole == C.ROLES.CLIENT_C) {
            job.organisationName = job.client.organisation.name;
            job.organisationId = job.client.organisation.id;
        }
        if (job.clientRole == C.ROLES.PM_C) {
            job.organisationName = job.client.studioDetails.name;
        }
        job.clientId = job.client.id;
        job.clientStats = {
            totalJobPosts: job.client.opportunities.length,
            totalHires: totalHires,
            clientLastActive: job.client.lastActive,
        };
        job['shortlisted'] = totalShortlisted;
        delete job.client.opportunities;
        delete job.applications;
        delete job.client;
        jobs.push(job);
    });
    const pageDetails = jobsPage;
    delete pageDetails.docs;
    return { jobs, pageDetails };
}

const getSpecialOpportunities = async ({ writer, page, specialType }) => {
    const writerApplications = writer.applications;
    const reportedJobs = await get_reported_jobs(writer);
    const invalidStates = [
        C.JOB_BOARD_OPPORTUNITY_STATES.INACTIVE,
        C.JOB_BOARD_OPPORTUNITY_STATES.BAN,
        C.JOB_BOARD_OPPORTUNITY_STATES.CLOSED,
        C.JOB_BOARD_OPPORTUNITY_STATES.UNDER_REVIEW,
    ];
    let query = {
        status: { $nin: invalidStates },
        applications: { $nin: writerApplications },
        _id: { $nin: reportedJobs },
        country: writer.adr.co,
        clr: C.ROLES.CLIENT_C,
    };
    // If user is writer then filter out PM jobs
    if (writer.__t == C.ROLES.WRITER_C)
        query = {
            ...query,
            $or: [{ pmrq: { $exists: false } }, { pmrq: false }],
        };
    // Apply other filters
    if (specialType == C.JOB_BOARD_SPECIAL_JOBS.SUGGESTED) {
        query = { ...query, ac: { $gte: 5 } };
    }
    if (specialType == C.JOB_BOARD_SPECIAL_JOBS.TRENDING) {
        query = { ...query, it: true };
    }
    const options = {
        select: 'it ct applications employmentType ac wc sp deadline title city country remoteFriendly deadline jt cur pmrq clr cg',
        populate: {
            path: 'applications client',
            select: 'status stdd lac',
            populate: {
                path: 'organisation opportunities',
                select: ['name', 'openings applications'],
                populate: { path: 'applications', select: ['status'] },
            },
        },
        page: page,
        limit: 15,
    };
    let special = await JobBoard.paginate(query, options);
    const jobs = [];
    special.docs.map((job) => {
        let totalShortlisted = 0;
        let totalHires = 0;
        for (let sc of job.applications) {
            totalShortlisted +=
                sc.status === C.JOB_BOARD_APPLICATION_STATES.SHORTLISTED
                    ? 1
                    : 0;
        }
        for (let cop of job.client.opportunities) {
            for (cap of cop.applications) {
                // console.log(cap.toJSON());
                if (cap.status === C.JOB_BOARD_APPLICATION_STATES.HIRED) {
                    totalHires += 1;
                }
            }
        }
        job = job.toJSON();
        if (job.clientRole == C.ROLES.CLIENT_C) {
            job.organisationName = job.client.organisation.name;
            job.organisationId = job.client.organisation.id;
        }
        if (job.clientRole == C.ROLES.PM_C) {
            job.organisationName = job.client.studioDetails.name;
        }
        job.clientId = job.client.id;
        job.clientStats = {
            totalJobPosts: job.client.opportunities.length,
            totalHires: totalHires,
            clientLastActive: job.client.lastActive,
        };
        job['shortlisted'] = totalShortlisted;
        delete job.client.opportunities;
        delete job.applications;
        delete job.client;
        jobs.push(job);
    });
    const pageDetails = special;
    delete pageDetails.docs;
    return { special: jobs, pageDetails };
};

// Jobs with more than 5 applications
exports.getSuggested = async ({ writer, page }) => {
    const { special, pageDetails } = await getSpecialOpportunities({
        writer,
        page,
        specialType: C.JOB_BOARD_SPECIAL_JOBS.SUGGESTED,
    });
    return { suggested: special, pageDetails };
};

// TODO : Trending can be stored in cache to reduce database hits
// Returns Trending jobs (it = true)
exports.getTrending = async ({ writer, page }) => {
    const { special, pageDetails } = await getSpecialOpportunities({
        writer,
        page,
        specialType: C.JOB_BOARD_SPECIAL_JOBS.TRENDING,
    });
    return { trendingJobs: special, pageDetails };
};

// Returns all available oppurtinities in which users has not applied in descending order of "updatedAt"

exports.getAvailableOpportunities = async ({
    writer,
    employmentType,
    remoteFriendly,
    location,
    sortOrder,
    sortBy,
    page,
    searchQuery,
    studioJobs,
}) => {
    return getAllOppurtinities({
        writer,
        fieldToSort: sortBy,
        limit: 15,
        employmentType,
        remoteFriendly,
        location,
        sortOrder,
        page,
        searchQuery,
        studioJobs,
    });
};

/*
 *  Opportunity Endpoints (Details, Apply ...)
 */

exports.getOpportunityDetails = async ({ writer, jobId }) => {
    let details = await JobBoard.findOne({ _id: jobId })
        .populate({
            path: 'client',
            select: 'organisation stdd.nm',
            populate: { path: 'organisation' },
        })
        .exec();
    let reportByUser = await Report.findOne({
        'by.uid': writer._id,
        postId: jobId,
    });
    if (!details) {
        throw new BadRequest('No such job found', 'CRJB100');
    }

    //TODO: check if writer already applied, then return key applied: true
    let applied = null;
    writer.applications.some((item) => {
        if (details.applications.includes(item)) {
            applied = item;
            return;
        }
    });

    // remove applications array and replace with #applications
    const ApplicationsCount = details.applications.length;
    details = (({ applications, ...o }) => o)(details._doc);
    details.applications = ApplicationsCount;
    if (applied) {
        const writerApplication = await Application.findOne({
            writer: writer._id,
            job: details._id,
        })
            .populate({
                path: 'pageIds',
                select: 'n uid un',
            })
            .exec();
        details.answer1 = writerApplication.ans1;
        details.answer2 = writerApplication.ans2;
        details.pageIds = writerApplication.pageIds;
    }

    return { details, applied, report: reportByUser };
};

async function createApplication({ application, writer, jobId }) {
    const writerId = writer.id;
    // contentSamples collected from PMs only
    const { status, answer1, answer2, contentSamples, pageIds } = application;

    const result = await JobBoard.findById(jobId)
        .select('client status pmrq clr')
        .exec();
    if (result === null) {
        throw new BadRequest('No such job found', 'CRJB100');
    }
    if (result.status !== C.JOB_BOARD_OPPORTUNITY_STATES.ACTIVE) {
        throw new BadRequest('Opportunity not acitve', 'CRJB104');
    }
    if (result.pmrq && writer.__t !== C.ROLES.PM_C)
        throw new BadRequest('This job is for PMs');
    if (result.clr == C.ROLES.PM_C && writer.__t !== C.ROLES.WRITER_C)
        throw new BadRequest("Can't Apply. This job is for creators from PMs");

    let newApplication = new Application();
    newApplication.ans1 = answer1;
    newApplication.ans2 = answer2;
    newApplication.appliedOn = new Date();
    newApplication.writer = writerId;
    newApplication.job = jobId;
    newApplication.client = result.client;
    // Applicant role: PM or Writer
    newApplication.aplr = writer.__t;
    if (writer.__t == C.ROLES.PM_C && Array.isArray(contentSamples)) {
        // Verify content samples
        const samplesValid = await checkIfValidSampleIds({
            writer,
            contentSamples,
        });
        if (samplesValid) newApplication.csam = contentSamples;
        else
            throw new BadRequest(
                'Invalid samples added. Project is either not yours, not imported from members or is a private LongForm',
            );
    }
    if (result.clr == C.ROLES.CLIENT_C && writer.__t == C.ROLES.WRITER_C) {
        // When creators are applying job
        if (!(Array.isArray(pageIds) && pageIds.length >= 1))
            throw new BadRequest(
                'Select at least one page from your portfolio for applying',
            );
        const pages = await Page.find({
            uid: writer.id,
            _id: {
                $in: pageIds,
            },
        }).exec();
        if (pages.length !== pageIds.length)
            throw new BadRequest(
                'One or more pageIds are invalid or do not belong to this creator',
            );
        newApplication.pageIds = pageIds;
    }
    return await newApplication
        .save()
        .then((result) => {
            return { result };
        })
        .catch((err) => {
            return { error: err };
        });
}

exports.applyForOpportunity = async ({ writer, jobId, application }) => {
    // Check if creator has reported this job
    const has_reported = await has_writer_reported(writer, jobId);
    if (has_reported) throw new BadRequest('CANT_APPLY_REPORTED', 'CRJB101');
    // Check if client reported creator
    const has_client_reported = await has_client_reported_writer({
        writer,
        jobId,
    });
    if (has_client_reported)
        throw new BadRequest('CLIENT_REPORTED_CREATOR', 'CRJB102');

    const { result, error } = await createApplication({
        application,
        writer,
        jobId,
    });
    if (!error) {
        //initialize applications attr if blank
        if (!writer.applications) {
            writer.applications = [];
        }
        writer.applications.push(result._id);
        await writer.save();
        const updated = await JobBoard.findByIdAndUpdate(
            jobId,
            {
                $inc: { ac: 1, nac: 1 },
                $push: { applications: result._id },
            },
            { new: true },
        );
        // Send Notification to Client when more than 1 unseen notifications
        if (updated.nac >= 1) {
            await client_notification_new({ updated });
        }
        return {
            msg: 'Applied successfully',
            application: result,
        };
    } else {
        let msg = 'Unable to apply for this job';
        if (error.code === 11000) msg = 'Already Applied';
        throw new BadRequest(msg, 'CRJB103');
    }
};

exports.getWriterApplications = async function getWriterApplications({
    writer,
    status,
    sortBy,
    page,
}) {
    // Only return application of writer
    let query = {
        _id: { $in: writer.applications },
    };
    // Apply status filter
    if (typeof status == 'string' && status.length > 0)
        query = { ...query, status: status };
    let options = {
        select: 'appliedOn status job client',
        populate: [
            {
                path: 'job',
                select: 'title employmentType ac pmrq clr',
            },
            {
                path: 'client',
                select: 'organisation',
                populate: {
                    path: 'organisation',
                    select: 'name',
                },
            },
        ],
        limit: 10,
        page: page,
    };
    // Apply sort order
    if (typeof sortBy == 'string' && sortBy.length > 0)
        options = {
            ...options,
            sort: {
                appliedOn: -1,
            },
        };
    const applications = [];
    const details = await Application.paginate(query, options);
    details.docs.map((appl) => {
        appl = appl.toJSON();
        if (appl.job.clientRole == C.ROLES.CLIENT_C)
            appl.company = appl.client.organisation.name;
        appl.title = appl.job.title;
        appl.employmentType = appl.job.employmentType;
        appl.applicationCount = appl.job.applicationCount;
        appl.jobId = appl.job.id;
        delete appl.job;
        delete appl.client;
        applications.push(appl);
    });
    const pageDetails = details;
    delete pageDetails.docs;
    return { applications, pageDetails };
};

exports.getApplicationDetails = async ({ writerId, applId }) => {
    let details = await Application.findOne({ _id: applId })
        .populate([
            {
                path: 'job',
                select: '-applications',
                populate: {
                    path: 'client',
                    select: 'n stid organisation',
                    populate: { path: 'organisation' },
                },
            },
            {
                path: 'pageIds',
                select: 'n uid un',
            },
        ])
        .exec();

    if (!details) throw new BadRequest('No such application found', 'CRJB105');
    else if (!details.writer.equals(writerId.toString()))
        throw new BadRequest("Application doen't belong to you", 'CRJB105');

    return { details };
};

exports.getSavedJobs = async ({ writerId, page }) => {
    let options = {
        path: 'sj',
        select: 'it ct employmentType ac deadline title city country remoteFriendly deadline jt',
    };
    const result = await Writer.findById(writerId)
        .select('sj')
        .populate(options)
        .exec();
    if (!result) throw new BadRequest('NO_SUCH_USER');
    return { sj: result.sj };
};

exports.saveJob = async ({ writer, jobId }) => {
    if (writer.sj.includes(jobId)) {
        throw new BadRequest('ALREADY_SAVED');
    }
    writer.sj.push(jobId);
    await writer.save();
    return {
        msg: 'saved',
        jobs: writer.sj,
    };
};
exports.deleteSavedJob = async ({ writer, jobId }) => {
    const index = writer.sj.indexOf(jobId);
    if (index > -1) {
        writer.sj.splice(index, 1);
        await writer.save();
        return {
            msg: 'success',
        };
    } else {
        throw new BadRequest('NO_SUCH_JOB');
    }
};

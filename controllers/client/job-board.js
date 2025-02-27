/*
 * Module Dependencies
 */
const mongoose = require('mongoose');
const debug = require('debug')('client');
debug.enabled = true;
const moment = require('moment');
const _ = require('lodash');
const { notification } = require('../../messaging/index');
const env = require('../../config/env');
const C = require('../../lib/constants');
const { WEB_NOTIF } = require('../../messaging/constants');
const agenda = require('../../services/agenda');
const { CONVERSATION_STATUS } = C;

// Models
const User = mongoose.model(C.MODELS.USER_C);
const Creator = mongoose.model(C.MODELS.WRITER_C);
const JobBoard = mongoose.model(C.MODELS.JOB_BOARD_C);
const Application = mongoose.model(C.MODELS.JOB_BOARD_APPLICATION_C);
const Report = mongoose.model(C.MODELS.JOB_BOARD_REPORTING_C);
const ConversationClient = mongoose.model(C.MODELS.CONVERSATION_CLIENT);
const { BadRequest, InternalServerError } = require('../../lib/errors');

// Controllers
const commonControllers = require('../common');

// ***************For admin (roshan)********************
const emailService = require('../../services/sendgrid/index');
const domainMail = 'service@passionbits.io';
const { job_post_to_admin } = require('../../utils/emails');
// **************************************

const {
    createConversation,
    createConversationPm,
} = require('../helpers/clientHelpers');

// Services
const { updateConverstionInCache } = require('../../services/redis/operations');
const rtService = require('../../services/rt');

// ---------- JOB BOARD RELATED CONTROLLERS ----------

async function createOrUpdateOpportunity({ job, existingJob, client }) {
    const clientId = client._id;
    // is it an update operation
    const updateOperation = !!existingJob;

    const {
        employmentType,
        title,
        remoteFriendly,
        contentType,
        description,
        remuneration,
        preferredQualifications,
        remunerationUnit,
        currency,
        duration,
        durationUnit,
        openings,
        wordCount,
        samplesProvided,
        deadline,
        question1,
        question2,
        category,
        tags,
        // city,
        country,
        seniority,
        contentPieces,
        pmRequired,
    } = job;
    // console.log(job);
    let jobTmp;
    if (updateOperation) {
        jobTmp = existingJob;
        if (jobTmp.status === C.JOB_BOARD_OPPORTUNITY_STATES.BAN) {
            throw new BadRequest('OPPORTUNITY_BANNED');
        }
    } else {
        jobTmp = new JobBoard({ pmrq: pmRequired, clr: client.__t });
    }

    jobTmp.employmentType = employmentType;
    jobTmp.title = title;
    // jobTmp.city = city;
    jobTmp.country = country;
    /** !TBD Set job currency based on client's country
    if (client.adr.co == C.CURRENCY_COUNTRY.INDIA) {
        jobTmp.cur = C.CURRENCY.INR;
    } else {
        jobTmp.cur = C.CURRENCY.USD;
    }
    */
    jobTmp.cur = currency;
    jobTmp.remoteFriendly = remoteFriendly;
    jobTmp.ct = contentType;
    jobTmp.description = description;
    jobTmp.remuneration = remuneration;
    jobTmp.remunerationUnit = remunerationUnit;
    jobTmp.duration = duration;
    jobTmp.durationUnit = durationUnit;
    jobTmp.openings = openings;
    const deadlineWrapper = moment(deadline);
    jobTmp.deadline = deadlineWrapper;
    jobTmp.ques1 = question1;
    jobTmp.ques2 = question2;
    jobTmp.seniority = seniority;
    jobTmp.cpq = contentPieces;
    jobTmp.preferredQualifications = preferredQualifications;

    jobTmp.category = category;
    jobTmp.tags = tags;
    jobTmp.wc = wordCount;
    jobTmp.sp = samplesProvided;
    if (!updateOperation) {
        jobTmp.client = clientId;
    }

    return await jobTmp
        .save()
        .then((newJob) => {
            return { returnJob: newJob };
        })
        .catch((err) => {
            return { error: err };
        });
}

exports.addNewOpportunity = async function addNewOpportunity({ job, client }) {
    if (client.__t == C.ROLES.CLIENT_C && client.isPostingFirstTime)
        return {
            msg: 'Update your profile before floating opportunities',
            success: false,
        };
    let existingJob;
    if (job.existingJobId) {
        existingJob = await JobBoard.findOne({
            _id: job.existingJobId,
            client: client.id,
        }).exec();
        if (!existingJob) return new BadRequest('NO_SUCH_JOB');
    }
    // * Default state of new job is 'UNDER_REVIEW'
    const { returnJob, error } = await createOrUpdateOpportunity({
        job,
        existingJob,
        client,
    });
    if (error) {
        debug(error);
        throw new InternalServerError('Error saving opportunity');
    }
    //initialize opportunities attr if blank
    if (!client.opportunities) {
        client.opportunities = [];
    }
    if (returnJob._id != null && !existingJob) {
        client.opportunities.push(returnJob._id);
        // * Schedule agenda only after job is approved
        // * Send email to roshan@passionbits.io
        let msgAdmin = {
            subject: `New Opportunity posted`,
            html: job_post_to_admin(returnJob, client),
        };
        if (env.NODE_ENV === 'prod') {
            emailService.sendEmail(
                'roshan@passionbits.io',
                msgAdmin,
                domainMail,
            );
        }
        if (env.NODE_ENV === 'dev') {
            emailService.sendEmail(
                'arpitpathak97@gmail.com',
                msgAdmin,
                domainMail,
            );
        }
    }
    await client.save();
    if (!existingJob && client.opportunities.length == 1) {
        await notification.send({
            usecase: C.NOTIF_USECASES[C.MODELS.CLIENT_C].CLIENT_FIRST_POST,
            role: C.MODELS.CLIENT_C,
            email: {
                email: client.e,
                name: client.n.f,
            },
        });
    }
    if (!existingJob) {
        await notification.send({
            usecase: 'new-job-posted',
            role: C.ROLES.CLIENT_C,
            email: {
                email: client.e,
                name: client.n.f,
                jobName: returnJob.title,
            },
        });
    }
    return {
        msg: 'Opportunity is saved/updated.',
        job: returnJob,
    };
};

exports.closeOpportunity = async function closeOpportunity({
    client,
    jobId,
    reason,
}) {
    const isUpdated = await JobBoard.findOneAndUpdate(
        {
            _id: jobId,
            client: client.id,
            status: {
                $in: [
                    C.JOB_BOARD_OPPORTUNITY_STATES.ACTIVE,
                    C.JOB_BOARD_OPPORTUNITY_STATES.UNDER_REVIEW,
                ],
            },
        },
        {
            status: C.JOB_BOARD_OPPORTUNITY_STATES.CLOSED,
            rfc: reason,
        },
    ).populate('client');
    if (!isUpdated) throw new BadRequest("Can't close opportunity.");
    // Send notification(email) to client
    let options = { year: 'numeric', month: 'long', day: 'numeric' };
    await notification.send({
        usecase: C.NOTIF_USECASES[C.ROLES.CLIENT_C].OPPORTUNITY_CLOSED,
        role: C.ROLES.CLIENT_C,
        email: {
            email: isUpdated.client.e,
            name: isUpdated.client.n.f,
            opportunityName: isUpdated.title,
            numberOfApplication: isUpdated.ac,
            startingDate: isUpdated.createdAt.toLocaleString('en-US', options),
            endingDate: isUpdated.deadline.toLocaleString('en-US', options),
        },
    });
    // Give client reminder email of expiry of job after 11 days
    const noa = await Application.countDocuments({
        client: client.id,
        job: jobId,
        status: C.JOB_BOARD_APPLICATION_STATES.PENDING,
    }).exec();
    agenda.schedule('after 11 days', 'close_opportunity', {
        email: isUpdated.client.e,
        name: client.n.f,
        opportunityName: isUpdated.title,
        startDate: isUpdated.createdAt.toLocaleString('en-US', options),
        endDate: isUpdated.deadline.toLocaleString('en-US', options),
        numberOfApplications: noa,
    });
    // Expire job after 14 days
    agenda.schedule('after 14 days', 'expire_opportunity', {
        job: { id: isUpdated._id },
        client: { id: client._id },
    });
    // Cancel 2day and 15day reminder emails
    await agenda.cancel({
        name: {
            $in: ['client_2_day', 'client_15_day'],
        },
        'data.job.id': isUpdated._id,
        'data.client.id': client._id,
    });
    return {
        msg: 'Opportunity is closed.',
    };
};

exports.getClientOpportunities = async function getClientOpportunities({
    client,
    status,
    page,
}) {
    const { opportunities } = client;
    const query = {
        _id: { $in: opportunities },
    };
    if (status) {
        query['status'] = status;
    }
    /*
    const options = {
        sort: { createdAt: -1 },
        select: 'id title city cg remoteFriendly ac status deadline createdAt ',
        customLabels: { docs: 'opportunities' },
        page,
        limit: 4,
    };
    */
    const allJobs = await JobBoard.find(query)
        .select(
            'id title country cg remoteFriendly ac pmrq status deadline createdAt cur',
        )
        .sort({ createdAt: -1 })
        .exec();
    /*
    const result = allJobs.opportunities;
    const pageDetails = allJobs;
    delete pageDetails.opportunities;
    */
    return { opportunities: allJobs };
};

exports.getJobApplications = async function getJobApplications({
    client,
    jobId,
}) {
    let job = await JobBoard.findOneAndUpdate(
        { _id: jobId, client: client.id },
        { $set: { nac: 0 } },
    )
        .select(
            '_id createdAt title ct cg remoteFriendly city country status pmrq isOpportunityClose employmentType deadline remuneration remunerationUnit cur ques1 ques2 clr',
        )
        .exec();
    if (!job) throw new BadRequest('Job not found');
    job = job.toJSON();
    if (job.clientRole == C.ROLES.CLIENT_C) job.company = client.company;
    if (job.clientRole == C.ROLES.PM_C) {
        job.company = client.stdd.nm;
    }
    let applications = await Application.find({
        job: jobId,
    })
        .populate([
            {
                path: 'writer',
                select: '_id n pfi pdg pn stid adr.ci tstm',
            },
            {
                path: 'convoId',
                select: 'sta',
            },
        ])
        .exec();
    const creators = [];
    applications = applications.map((app) => {
        app = app.toJSON();
        /**
         * If application has an active linked conversation send conversation details
         * Conversation is linked if client wants to message creator from application or when application is hired
         */
        if (app.convoId) {
            app.inboxDetails = {
                fullname: app.writer.fullname,
                state: app.convoId.state,
                conversationId: app.convoId.id,
                type:
                    app.convoId.state == C.CONVERSATION_STATE.ACTIVE
                        ? C.CONVERSATION_TYPE.PROJECT
                        : C.CONVERSATION_TYPE.INBOX,
            };
            app.convoId = app.convoId.id;
        }
        app.writer.testimonials = [];
        if (app.applicantRole == C.ROLES.WRITER_C) {
            app.writer.experience = '';
        }

        /*   // ! Get public and bookmarked testimonials
        app.writer.testimonials = app.writer.testimonials.filter(
            (testimonial) => testimonial.isPublic && testimonial.isBookmarked,
        );
        // ! Applicant is creator add experience
        if (app.applicantRole == C.ROLES.WRITER_C) {
            // Get recent experience of creator
            app.writer.experience = '';
            if (app.writer.professionalInfo.length > 0) {
                app.writer.experience = app.writer.professionalInfo[0];
            }
            delete app.writer.professionalInfo;
        } */
        // If applicant is PM, add content samples
        if (app.applicantRole == C.ROLES.PM_C) {
        }
        creators.push(app.writer.id);
        return app;
    });
    const reports = await Report.find({
        'by.uid': client._id,
        'against.uid': { $in: creators },
    }).select('against');
    return { job, applications, reports: reports.map((rp) => rp.against.uid) };
};

exports.updateApplicationStatus = async function updateApplicationStatus({
    client,
    applId,
    status,
}) {
    let appl = await Application.findOne({
        _id: applId,
        client: client.id,
    })
        .populate({ path: 'client', select: 'id cn' })
        .populate({ path: 'writer', select: 'n e id' })
        .exec();
    if (!appl) throw new BadRequest('Application not found');
    let jobId = appl.job;
    let jobToUpdate = await JobBoard.findOne({
        _id: jobId,
        client: client.id,
        // 14 day period is not over
        isOpportunityClose: false,
    })
        .select('status clr title')
        .exec();
    if (!jobToUpdate) throw new BadRequest('NO_SUCH_JOB/JOB_EXPIRED');
    if (
        jobToUpdate.status == C.JOB_BOARD_OPPORTUNITY_STATES.INACTIVE ||
        jobToUpdate.status == C.JOB_BOARD_OPPORTUNITY_STATES.BAN
    ) {
        throw new BadRequest('BANNED_OR_INACTIVE_OPPORTUNITY');
    }
    if (
        (appl.suggested == true &&
            status == C.JOB_BOARD_APPLICATION_STATES.PENDING) ||
        (appl.suggested == false &&
            status == C.JOB_BOARD_APPLICATION_STATES.SUGGESTED)
    ) {
        throw new BadRequest(
            `${status} status not allowed for this application`,
        );
    }
    // Update status
    appl.status = status;
    /**
     * Create an active conversation between client/PM and creator/PM if not already exists in hired state
     */
    let createConvo;
    if (status == C.JOB_BOARD_APPLICATION_STATES.HIRED) {
        // When client is of role - client and creater can be of role - creator or PM
        // Create ConversationClient
        // u1 = client u2 = creator/PM
        if (
            jobToUpdate.clr == C.ROLES.CLIENT_C &&
            (appl.aplr == C.ROLES.WRITER_C || appl.aplr == C.ROLES.PM_C)
        )
            createConvo = await createConversation(client._id, appl.writer._id);
        else if (
            jobToUpdate.clr == C.ROLES.PM_C &&
            appl.aplr == C.ROLES.WRITER_C
        ) {
            // Otherwise create ConveratioPM
            // u1 = PM and u2 = Creator
            createConvo = await createConversationPm(
                client._id,
                appl.writer._id,
                client,
            );
        } else throw new BadRequest('Failed to create conversation');
        appl.convoId = createConvo._id;
    }
    await appl.save();
    /**
     * Send notification to creators with level=normal
     * ? Since suggested applications have classified creators, don't send them notification
     * States: shortlisted, hired, rejected
     */
    if (
        status != C.JOB_BOARD_APPLICATION_STATES.PENDING &&
        appl.suggested == false
    ) {
        const forUser = {
            id: appl.writer.id,
            role: appl.aplr,
        };
        const by = {
            id: appl.client.id,
            role: jobToUpdate.clr,
        };
        /**
         * n = name, d = data
         */
        const actions = {
            n: WEB_NOTIF[C.ROLES.WRITER_C].VIEW_APPLICATION,
            d: { applicationId: appl._id, jobId },
        };
        // Email/Web notification added to queue
        await notification.send({
            usecase: status,
            role: C.ROLES.WRITER_C,
            email: {
                email: appl.writer.e,
                name: appl.writer.n.f,
                clientName: appl.client.cn,
                opportunityName: jobToUpdate.title,
            },
            web: {
                for: forUser,
                by,
                actions,
                createdAt: Date.now(),
                company: appl.client.cn,
                title: jobToUpdate.title,
                image: client.image,
            },
        });
    }
    // Send event to new users for the new conversation
    // If users are online, conversation can be added to the chat in real time
    if (createConvo && createConvo.isNew) {
        await rtService.sendNewConversation({
            receivers: [appl.writer._id],
            conversationId: createConvo.id,
            pendingCount: 0,
            conversationType: C.CONVERSATION_TYPE.INBOX,
        });
    }
    const response = { msg: 'Status updated successfully' };
    /**
     * Return inbox details when creator is hired
     */
    if (
        status == C.JOB_BOARD_APPLICATION_STATES.HIRED &&
        jobToUpdate.clr == C.ROLES.CLIENT_C &&
        (appl.aplr == C.ROLES.WRITER_C || appl.aplr == C.ROLES.PM_C)
    ) {
        response['inboxDetails'] = {
            fullname: appl.writer.fullname,
            state: createConvo.state,
            conversationId: createConvo.id,
            type: C.CONVERSATION_TYPE.INBOX,
            __t: createConvo.__t,
        };
    }
    return response;
};

exports.getApplicationDetails = async ({ applId, client }) => {
    let appl = await Application.findOne({
        _id: applId,
        client: client.id,
    })
        .populate({
            path: 'csam',
            select: '-ful -clb -ftype -lst -pat -sty -tn',
        })
        .exec();
    if (!appl) throw new BadRequest('Application not found');
    let response = { status: appl.status };
    appl = appl.toJSON();
    // If applicant is PM, add content samples
    if (appl.applicantRole == C.ROLES.PM_C) {
        for (let post of appl.contentSamples) {
            // Only Send Cover Image for long form
            // Cover Image is first image
            if (post.__t == C.MODELS.LONG_FORM) {
                let coverImage = '';
                if (post.images.length > 0) {
                    coverImage = post.images[0].thumbnail;
                }
                post.image = coverImage;
                delete post.images;
            }
        }
        let contentSamples = appl.contentSamples;
        let studioDetails =
            await commonControllers.exportedStudioGeneralInfoStripped({
                userId: appl.writer,
            });
        response = { ...response, contentSamples, studioDetails };
    }

    return response;
};

exports.getApplicationPages = async ({ applId, client }) => {
    let appl = await Application.findOne({
        _id: applId,
        client: client.id,
    })
        .select('pageIds')
        .exec();
    if (!appl) throw new BadRequest('Application not found');
    return {
        pageIds: appl.pageIds,
    };
};

/**
 * @version 2.1
 * When client wants to message from application
 * Create conversation with invite state if no conversation between client/creator exists otherwise
 * Return existing conversation with original state
 */
exports.getCreateConversation = async ({ client, applId }) => {
    const application = await Application.findOne({
        _id: applId,
        client: client._id,
    }).exec();
    if (!application) throw new BadRequest('Application not found');
    let conversation = await ConversationClient.findOne({
        u1: client._id,
        u2: application.writer,
    }).exec();
    const creator = await User.findById(application.writer)
        .select('lv sstats')
        .exec();
    const creatorRole = creator.__t;
    if (!conversation) {
        // Created conversation to be in invite state
        conversation = new ConversationClient({
            u1: client._id,
            u2: application.writer,
            p2: 1,
            st: CONVERSATION_STATUS.CREATED,
            ctw:
                creatorRole == C.ROLES.PM_C
                    ? C.CONVERSATION_CLIENT_U2.PM
                    : C.CONVERSATION_CLIENT_U2.CREATOR,
        });
        // * Classified status currently supported for writers only
        if (creatorRole == C.ROLES.WRITER_C) {
            // Creating conversation for classified creators
            conversation.cc =
                creator.level == C.CREATOR_LEVEL.CLASSIFIED ? true : false;
        } else if (creatorRole == C.ROLES.PM_C) {
            // PM stats update
            creator.sstats.stp += 1;
        }
    } else {
        // if state was init, mark it as created now and update other info
        if (conversation.st == CONVERSATION_STATUS.INIT) {
            conversation.st = CONVERSATION_STATUS.CREATED;
            conversation.lmd = new Date(moment());
            conversation.ctw =
                creatorRole == C.ROLES.PM_C
                    ? C.CONVERSATION_CLIENT_U2.PM
                    : C.CONVERSATION_CLIENT_U2.CREATOR;
            conversation.p2 = 1;

            // * Classified status currently supported for writers only
            if (creatorRole == C.ROLES.WRITER_C) {
                // Creating conversation for classified creators
                conversation.cc =
                    creator.level == C.CREATOR_LEVEL.CLASSIFIED ? true : false;
                conversation.cli.stcac = new Date(moment());
            } else if (creatorRole == C.ROLES.PM_C) {
                // PM stats update
                creator.sstats.stp += 1;
            }
        }
    }
    // * Two applications of different jobs can have same convoId value
    // ? Is it really necessary
    application.convoId = conversation._id;
    await application.save();
    await conversation.save();
    await creator.save();
    // Update redis with new value of conversation
    await updateConverstionInCache({
        conversation,
    });
    // For response
    const populatedConvo = await conversation
        .populate({ path: 'u2', select: 'n' })
        .execPopulate();

    const inboxDetails = {
        fullname: populatedConvo.u2.fullname,
        state: populatedConvo.state,
        conversationId: populatedConvo.id,
        type: C.CONVERSATION_TYPE.INBOX,
        __t: populatedConvo.__t,
    };
    // Send event to new users for the new conversation
    // If users are online, conversation can be added to the chat in real time
    if (conversation && conversation.isNew) {
        await rtService.sendNewConversation({
            receivers: [application.writer],
            conversationId: conversation.id,
            pendingCount: 0,
            conversationType: C.CONVERSATION_TYPE.INBOX,
        });
    }
    return {
        inboxDetails,
    };
};

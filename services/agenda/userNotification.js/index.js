const mongoose = require('mongoose');
const debug = require('debug')('agenda:personal');
debug.enabled = true;
const moment = require('moment');
const C = require('../../../lib/constants');

const Creator = mongoose.model(C.MODELS.WRITER_C);
const Application = mongoose.model(C.MODELS.JOB_BOARD_APPLICATION_C);

const { notification } = require('../../../messaging');
const analyticsV1Controllers = require('../../../controllers/creator/analytics-v1');

exports.client_reminder_2_day = async ({ client, job }) => {
    // debug(job);
    const appls = await Application.find({
        client: client.id,
        job: job.id,
        createdAt: {
            $gt: new Date(moment().subtract(2, 'days')),
        },
    }).exec();
    const newApplications = appls.length;
    // debug(appls, newApplications);
    if (newApplications > 0) {
        await notification.send({
            usecase: 'applications-received',
            role: 'Client',
            email: {
                email: client.e,
                name: client.n.f,
                numberOfApplication: newApplications,
                opportunityName: job.title,
            },
        });
    }
};

exports.client_reminder_15_day = async ({ client, job }) => {
    // debug(job);
    const appls = await Application.find({
        client: client.id,
        job: job.id,
        status: C.JOB_BOARD_APPLICATION_STATES.PENDING,
        createdAt: {
            $gt: new Date(moment().subtract(15, 'days')),
        },
    }).exec();
    const newApplications = appls.length;
    // debug(appls, newApplications);
    if (newApplications > 0) {
        await notification.send({
            usecase: 'no-action-taken',
            role: 'Client',
            email: {
                email: client.e,
                name: client.n.f,
                numberOfApplication: newApplications,
                opportunityName: job.title,
            },
        });
    }
};

exports.creator_onboarding_1 = async ({ name, email, id }) => {
    const user = await Creator.findById(id).select('obs').exec();
    if (user && user.obs !== C.V3_CREATOR_ONBOARDING_STATES.STEP_DONE) {
        await notification.send({
            usecase: 'creator-onboarding-1',
            role: C.ROLES.WRITER_C,
            email: {
                email,
                name,
            },
        });
    }
};

exports.creator_onboarding_2 = async ({ name, email, id }) => {
    const user = await Creator.findById(id).select('obs').exec();
    if (user && user.obs !== C.V3_CREATOR_ONBOARDING_STATES.STEP_DONE) {
        await notification.send({
            usecase: 'creator-onboarding-2',
            role: C.ROLES.WRITER_C,
            email: {
                email,
                name,
            },
        });
    }
};

exports.creator_follow_up_1 = async ({ name, email }) => {
    await notification.send({
        usecase: 'creator-follow-up-1',
        role: C.ROLES.WRITER_C,
        email: {
            email,
            name,
        },
    });
};

exports.creator_follow_up_2 = async ({ name, email }) => {
    await notification.send({
        usecase: 'creator-follow-up-2',
        role: C.ROLES.WRITER_C,
        email: {
            email,
            name,
        },
    });
};

exports.creator_follow_up_3 = async ({ name, email }) => {
    await notification.send({
        usecase: 'creator-follow-up-3',
        role: C.ROLES.WRITER_C,
        email: {
            email,
            name,
        },
    });
};

exports.creator_follow_up_4 = async ({ name, email }) => {
    await notification.send({
        usecase: 'creator-follow-up-4',
        role: C.ROLES.WRITER_C,
        email: {
            email,
            name,
        },
    });
};

exports.creator_follow_up_5 = async ({ id, name, email }) => {
    const user = await Creator.findById(id).select('obs').exec();
    if (user && user.obs !== C.V3_CREATOR_ONBOARDING_STATES.STEP_DONE) {
        await notification.send({
            usecase: 'creator-follow-up-5',
            role: C.ROLES.WRITER_C,
            email: {
                email,
                name,
            },
        });
    }
};

exports.send_report_reminder = async ({
    name,
    email,
    earning,
    charges,
    note,
}) => {
    await notification.send({
        usecase: 'report-modal-reminder',
        role: C.ROLES.WRITER_C,
        email: {
            email,
            name,
            earning,
            charges,
            note,
        },
    });
};

exports.send_analytics_email = async ({ userId, email }) => {
    // Get email data
    const {
        totalVisit,
        totalServiceVisit,
        totalPostVisit,
        posts,
        leads,
        dontSend,
    } = await analyticsV1Controllers.getDailyAnalytics({
        user: {
            id: userId,
        },
    });
    /* // Schedule next run
    const jobs = await agenda.jobs({
        name: 'send_analytics_email',
        'data.userId': userId,
        'data.email': email,
    });
    if (jobs.length > 0) {
        agenda.schedule('after 1 day', 'send_analytics_email', {
            email,
            userId,
        });
    } else {
        const job = jobs[0];
        job.schedule('after 1 day');
    } */

    // send email
    if (dontSend) return;
    await notification.send({
        usecase: 'send_analytics_email',
        role: C.ROLES.WRITER_C,
        email: {
            email,
            date: moment().utc().format('DD-MM-YYYY'),
            totalVisit,
            totalServiceVisit,
            totalPostVisit,
            posts,
            leads,
        },
    });
};

exports.referral_loop_three = async ({ email, name = '' }) => {
    await notification.send({
        usecase: 'referral_loop_three',
        role: C.ROLES.WRITER_C,
        email: {
            email,
            name,
        },
    });
};

exports.referral_loop_four = async ({ email, name = '' }) => {
    await notification.send({
        usecase: 'referral_loop_four',
        role: C.ROLES.WRITER_C,
        email: {
            email,
            name,
        },
    });
};

exports.referral_loop_five = async ({ email, name = '' }) => {
    await notification.send({
        usecase: 'referral_loop_five',
        role: C.ROLES.WRITER_C,
        email: {
            email,
            name,
        },
    });
};

exports.referral_loop_six = async ({ email, name = '' }) => {
    await notification.send({
        usecase: 'referral_loop_six',
        role: C.ROLES.WRITER_C,
        email: {
            email,
            name,
        },
    });
};

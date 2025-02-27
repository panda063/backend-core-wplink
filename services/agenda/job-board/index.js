const mongoose = require('mongoose');
const debug = require('debug')('agenda:personal');
debug.enabled = true;
const moment = require('moment');
const C = require('../../../lib/constants');
const JobBoard = mongoose.model(C.MODELS.JOB_BOARD_C);
const Application = mongoose.model(C.MODELS.JOB_BOARD_APPLICATION_C);
const { notification } = require('../../../messaging');

exports.expire_job_as_inactive = async ({ agenda }) => {
    // now inactive is closed
    debug('Setting deadline expired jobs to closed state');
    const query = {
        deadline: { $lt: new Date(moment()) },
        status: {
            $in: [
                C.JOB_BOARD_OPPORTUNITY_STATES.ACTIVE,
                // inactive -> set by admin to hold job
                C.JOB_BOARD_OPPORTUNITY_STATES.INACTIVE,
                C.JOB_BOARD_OPPORTUNITY_STATES.UNDER_REVIEW,
            ],
        },
    };
    const expiredJobs = await JobBoard.find(query).populate('client').exec();
    debug(`${expiredJobs.length} expired jobs`);
    await Promise.all(
        expiredJobs.map(async (job) => {
            job.status = C.JOB_BOARD_OPPORTUNITY_STATES.CLOSED;
            await job.save();
            let options = { year: 'numeric', month: 'long', day: 'numeric' };
            await notification.send({
                usecase:
                    C.NOTIF_USECASES[C.ROLES.CLIENT_C].OPPORTUNITY_CLOSURE_DATE,
                role: C.ROLES.CLIENT_C,
                email: {
                    email: job.client.e,
                    name: job.client.n.f,
                    opportunityName: job.title,
                    numberOfApplication: job.ac,
                    startingDate: job.createdAt.toLocaleString(
                        'en-US',
                        options,
                    ),
                    endingDate: job.deadline.toLocaleString('en-US', options),
                },
            });
            const noa = await Application.countDocuments({
                client: job.client.id,
                job: job.id,
                status: C.JOB_BOARD_APPLICATION_STATES.PENDING,
            }).exec();
            // Send reminder of expiry after 11 days
            agenda.schedule('after 11 days', 'close_opportunity', {
                email: job.client.e,
                name: job.client.n.f,
                opportunityName: job.title,
                startDate: job.createdAt.toLocaleString('en-US', options),
                endDate: job.deadline.toLocaleString('en-US', options),
                numberOfApplications: noa,
            });
            // Expire job after 14 days
            agenda.schedule('after 14 days', 'expire_opportunity', {
                job: { id: job.id },
                client: { id: job.client.id },
            });
            // Cancel 2day and 15day reminder emails
            await agenda.cancel({
                name: {
                    $in: ['client_2_day', 'client_15_day'],
                },
                'data.job.id': job.id,
                'data.client.id': job.client.id,
            });
        }),
    );
};

exports.close_opportunity = async ({
    name,
    startDate,
    endDate,
    opportunityName,
    numberOfApplications,
    email,
}) => {
    debug('For client Reminder, 11 days after opportunity closed');
    await notification.send({
        usecase: 'three-days-left',
        role: 'client',
        email: {
            email,
            name,
            startDate,
            endDate,
            opportunityName,
            numberOfApplications,
        },
    });
};

exports.expire_opportunity = async ({ job, client }) => {
    const updatedJob = await JobBoard.findOneAndUpdate(
        {
            _id: job.id,
            client: client.id,
        },
        { isOpportunityClose: true },
    ).exec();
    const appls = await Application.update(
        {
            job: job.id,
            client: client.id,
            status: C.JOB_BOARD_APPLICATION_STATES.PENDING,
        },
        {
            $set: {
                status: C.JOB_BOARD_APPLICATION_STATES.REJECTED,
            },
        },
    );
};

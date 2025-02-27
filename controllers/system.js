/*
 * Module Dependencies
 */
const mongoose = require('mongoose');
const _ = require('lodash');
const dateFns = require('date-fns');
const rt = require('debug')('rt');

const C = require('../lib/constants');
const { BadRequest } = require('../lib/errors');

const Writer = mongoose.model(C.MODELS.WRITER_C);
const JobBoard = mongoose.model(C.MODELS.JOB_BOARD_C);

// Agenda
const agenda = require('../services/agenda');
const { CHRONS } = require('../services/agenda/constants');
const { ObjectId } = require('mongodb');
const { JOB_BOARD_OPPORTUNITY_STATES } = require('../lib/constants');

// ---------- JOB BOARD RELATED ENDPOINTS ----------

exports.getActiveOpportunities = async () => {
    let jobs = await JobBoard.find({
        status: { $nin: C.JOB_BOARD_OPPORTUNITY_STATES.INACTIVE },
    })
        .select('-applications')
        .populate({
            path: 'client',
            select: 'organisation n',
            populate: { path: 'organisation' },
        })
        .exec();

    return { jobs };
};

exports.getOpportunityDetails = async ({ jobId }) => {
    let details = await JobBoard.findOne({ _id: jobId })
        .select('-applications')
        .populate({
            path: 'client',
            select: 'organisation n',
            populate: { path: 'organisation' },
        })
        .exec();
    if (!details) {
        throw new BadRequest('No such job found');
    }

    return details;
};

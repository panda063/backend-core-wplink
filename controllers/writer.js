/*
 * Module Dependencies
 */
const mongoose = require('mongoose');
const _ = require('lodash');
const moment = require('moment');
const C = require('../lib/constants');
const env = require('../config/env');
const debug = require('debug')('creator');
debug.enabled = true;
// const NOTIF_C = require('../config/notification');

// const Level = mongoose.model(C.MODELS.LEVEL_C);
const Writer = mongoose.model(C.MODELS.WRITER_C);
const User = mongoose.model(C.MODELS.USER_C);
const Client = mongoose.model(C.MODELS.CLIENT_C);
const Application = mongoose.model(C.MODELS.JOB_BOARD_APPLICATION_C);
const ConversationClient = mongoose.model(C.MODELS.CONVERSATION_CLIENT);
/**
 * External service dependencies
 */
const { notification } = require('../messaging/index');

const { BadRequest } = require('../lib/errors');

/**
 * Helpers
 */
const { hasInvalidEmails } = require('./helpers/writerHelper');

/**
 * Creator Onboarding state update
 */

exports.updateOnboardState = async ({ creator, state }) => {
    creator.onbs = state;
    await creator.save();
    return {
        state,
    };
};

/**
 * @version3
 * Submit details for portfolio Complete
 */
exports.updateSubmit = async ({ creator }) => {
    creator.sbmt = true;
    await creator.save();
    return {
        msg: 'Portfolio submitted',
    };
};

/**
 *
 * Email Inviation controller
 * @VERSION2
 */

// TODO: Make these role independent
exports.inviteViaEmail = async ({ user, emails }) => {
    // Check if user has invites remaining
    let invitesLeft = C.ACCOUNT_C.INVITE_MAX - user.rd.rc;
    if (emails.length > invitesLeft) {
        throw new BadRequest(
            `${invitesLeft} / ${C.ACCOUNT_C.INVITE_MAX} invites left`,
            'CRPL101',
        );
    }
    let invalidEmails = await hasInvalidEmails(user, emails);
    if (invalidEmails) {
        throw new BadRequest(
            'one or more email already invited/registered',
            'CRPL100',
        );
    }
    // Convert email string to valid object as defined in schema
    emails = emails.map((e) => {
        return {
            email: e,
            joined: false,
        };
    });
    const updated = await User.findByIdAndUpdate(
        user.id,
        {
            $push: { 'rd.ij': { $each: emails } },
            $inc: {
                'rd.rc': emails.length,
            },
        },
        { new: true },
    ).exec();
    if (!updated) {
        throw new BadRequest('invalid user', 'CRGN100');
    }
    let shareLink = '';
    let role = user.__t;
    // ? Generate sign up link based on role
    // ? Temporarily remove refId. Add to link
    if (role == C.ROLES.WRITER_C) shareLink = `${env.FRONTEND_URL}`;
    else if (role == C.ROLES.PM_C) shareLink = `${env.FRONTEND_URL}`;
    await Promise.all(
        _.map(emails, async (e) => {
            await notification.send({
                usecase: C.NOTIF_USECASES[role].INVITE,
                role,
                email: {
                    email: e.email,
                    name: user.fullname,
                    link: shareLink,
                },
            });
        }),
    );
    return { emails, invitesLeft: C.ACCOUNT_C.INVITE_MAX - updated.rd.rc };
};

exports.setSocial = async ({ user, social, status }) => {
    let fieldToUpdate = 'tw';
    if (social === 'facebook') fieldToUpdate = 'fb';
    if (social === 'linkedin') fieldToUpdate = 'li';
    if (social === 'instagram') fieldToUpdate = 'ig';
    const updatedResult = await User.findByIdAndUpdate(user.id, {
        $set: { [`ssd.${fieldToUpdate}`]: status },
    });
    const shareLink = `${env.FRONTEND_URL}/user-creator/${social}/${user.refId}`;
    if (updatedResult) return { social, status, shareLink };
    else {
        throw new BadRequest('user not found', 'CRGN100');
    }
};

// Find Client
exports.findClient = async ({ creator, searchValue, workedWith }) => {
    if (!searchValue) searchValue = '';
    let findQuery = {
        cn: { $regex: searchValue, $options: '-i' },
        acst: { $nin: [C.ACCOUNT_STATUS.BAN, C.ACCOUNT_STATUS.INACTIVE] },
    };
    if (workedWith) {
        /*  let appls = await Application.find({
            writer: creator._id,
            status: C.JOB_BOARD_APPLICATION_STATES.HIRED,
            updatedAt: { $gte: new Date(moment().subtract(30, 'd')) }, // Hired in last 30 days
        })
            .select('client')
            .exec();
        appls = _.map(appls, (app) => {
            return app.client;
        }); */
        // Clients creator has worked with
        let findConversations = await ConversationClient.find({
            u2: creator.id,
            st: C.CONVERSATION_STATUS.CREATED,
        })
            .select('u1')
            .exec();
        const clientIds = findConversations.map((convo) => {
            return convo.u1;
        });
        findQuery = { ...findQuery, _id: { $in: clientIds } };
    }
    const clients = await Client.find(findQuery, { cn: 1, img: 1, e: 1 });
    return {
        clients,
    };
};

exports.findCreator = async ({ creator, searchValue }) => {
    if (!searchValue) searchValue = '';
    let findQuery = {
        $or: [
            { 'n.f': { $regex: searchValue, $options: '-i' } },
            { 'n.l': { $regex: searchValue, $options: '-i' } },
            { cn: { $regex: searchValue, $options: '-i' } },
            { pn: { $regex: searchValue, $options: '-i' } },
        ],
        acst: { $nin: [C.ACCOUNT_STATUS.BAN, C.ACCOUNT_STATUS.INACTIVE] },
        _id: { $ne: creator._id },
    };
    const foundCreators = await Writer.find(findQuery, {
        n: 1,
        cn: 1,
        img: 1,
        pn: 1,
    });
    const creators = [];
    for (let cr of foundCreators) {
        toSend = cr.toJSON();
        toSend.name =
            (toSend.name.first ? toSend.name.first : '') +
            ' ' +
            (toSend.name.last ? toSend.name.last : '');
        creators.push(toSend);
    }
    return {
        creators,
    };
};

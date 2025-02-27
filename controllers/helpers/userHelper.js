/**
 * Dependencies
 */

const mongoose = require('mongoose');
const C = require('../../lib/constants');
const _ = require('lodash');
const env = require('../../config/env');

const phoneUtil = require('google-libphonenumber');
const CountryCodes = require('../../assets/mobileCodes');

/**
 * Models
 */

const Application = mongoose.model(C.MODELS.JOB_BOARD_APPLICATION_C);
const JobBoard = mongoose.model(C.MODELS.JOB_BOARD_C);
const User = mongoose.model(C.MODELS.USER_C);
const Conversation = mongoose.model(C.MODELS.CONVERSATION);
const ConversationClient = mongoose.model(C.MODELS.CONVERSATION_CLIENT);
const GroupConversation = mongoose.model(C.MODELS.GROUP_CONVERSATION);
const InfoTexts = mongoose.model(C.MODELS.GROUP_INFO_TEXT);
const Page = mongoose.model(C.MODELS.PAGE);

/**
 * Custom errors
 */
const { BadRequest, InternalServerError } = require('../../lib/errors');

/**
 * Helpers
 */
const { generatePageName } = require('./writerHelper');

/**
 * Services
 */

const { createEmailFindRegex } = require('../../services/db/user');
const agenda = require('../../services/agenda');
const { notification } = require('../../messaging/index');

// ***************For admin (roshan)********************
const emailService = require('../../services/sendgrid/index');
const domainMail = 'service@passionbits.io';
const {
    for_admin_creator_registration_complete_mail,
    for_admin_client_after_registration_mail,
} = require('../../utils/emails');
// **************************************

/**
 * Operations to perform when a creator signs up
 */

const writerSignupEmails = async ({ user }) => {
    await notification.send({
        usecase: 'welcome_signup',
        role: user.__t,
        email: {
            email: user.email,
            name: user.n && user.n.f ? user.n.f : user.penname,
        },
    });
    if (user.obs !== C.V3_CREATOR_ONBOARDING_STATES.STEP_DONE) {
        agenda.schedule('after 2 hours', 'creator-onboarding-1', {
            email: user.email,
            name: user.penname,
            id: user.id,
        });
        agenda.schedule('after 3 days', 'creator-onboarding-2', {
            email: user.email,
            name: user.penname,
            id: user.id,
        });
    }
};

exports.writerSignupEmails = writerSignupEmails;

exports.onWriterSignupOperations = async ({ user }) => {
    // For creators set up a new page which would be the homepage
    const newPage = new Page({
        uid: user.id,
        name: 'Homepage',
        un: generatePageName('Homepage'),
        pbl: true,
        pos: 'n',
        udet: {
            n: 'Homepage',
        },
    });
    await newPage.save();

    await writerSignupEmails({ user });
};

/**
 * Operations to perform when a creator completes onboarding
 */

exports.onWriterOnboardOperations = async ({ user }) => {
    await notification.send({
        usecase: 'welcome_onboarded',
        role: user.__t,
        email: {
            email: user.email,
            name: user.fullname,
            link: `${env.FRONTEND_URL}/${user.penname}`,
        },
    });
    agenda.schedule('after 1 days', 'creator-follow-up-1', {
        email: user.email,
        name: user.fullname,
    });
    agenda.schedule('after 2 days', 'creator-follow-up-2', {
        email: user.email,
        name: user.fullname,
    });
    /*  agenda.schedule('after 6 days', 'creator-follow-up-3', {
        email: user.email,
        name: user.fullname,
    }); */
    agenda.schedule('after 3 days', 'creator-follow-up-4', {
        email: user.email,
        name: user.fullname,
    });
    /*   agenda.schedule('after 3 days', 'creator-follow-up-5', {
        id: user.id,
        email: user.email,
        name: user.fullname,
    }); */
    // daily analytics report email
    const analyticsJob = agenda.create('send_analytics_email', {
        email: user.email,
        userId: user.id,
    });
    analyticsJob.repeatEvery('24 hours');
    await analyticsJob.save();
};

// Remove all applications which have status other than 'hired'
exports.client_reported_creator = async ({ client, writer }) => {
    const applications = await Application.find({
        writer: writer._id,
        client: client._id,
        status: { $ne: C.JOB_BOARD_APPLICATION_STATES.HIRED },
    }).exec();
    await Promise.all(
        applications.map(async (app) => {
            let index = writer.applications.indexOf(app._id);
            if (index > -1) {
                writer.applications.splice(index, 1);
            }
            let job = await JobBoard.findById(app.job).exec();
            job.ac -= 1;
            index = job.applications.indexOf(app._id);
            if (index > -1) {
                job.applications.splice(index, 1);
            }
            await job.save();
            await Application.deleteOne({ _id: app._id });
        }),
    );
    await writer.save();
};

exports.creator_reported_post = async ({ writer, postId }) => {
    const application = await Application.findOne({
        writer: writer._id,
        job: postId,
    }).exec();
    if (application) {
        let idx = writer.applications.indexOf(application._id);
        if (idx > -1) {
            writer.applications.splice(idx, 1);
            writer.save();
        }
        let job = await JobBoard.findById(postId).exec();
        if (job) {
            job.ac -= 1;
            idx = job.applications.indexOf(application._id);
            if (idx > -1) {
                job.applications.splice(idx, 1);
            }
            await job.save();
        }
        await Application.deleteOne({ _id: application._id });
    }
};

/**
 * Version 2 Helpers
 */

exports.addReference = async (refId, e) => {
    // the positional $ operator acts as a placeholder for the first element that matches the query document
    const result = await User.findOneAndUpdate(
        {
            refId: refId,
            'rd.ij.email': { $regex: createEmailFindRegex({ email: e }) },
        },
        { $set: { 'rd.ij.$.joined': true }, $inc: { 'rd.jc': 1 } },
    ).exec();
};

exports.addSocialReference = async (refId, social) => {
    if (Object.values(C.SOCIAL_SHARE_OPTIONS).includes(social)) {
        let soc = 'tw';
        if (social === 'facebook') soc = 'fb';
        if (social === 'linkedin') soc = 'li';
        if (social === 'instagram') soc = 'ig';
        await User.findOneAndUpdate(
            { refId: refId, [`ssd.${soc}`]: 'clicked' },
            { $inc: { 'ssd.sjc': 1 } },
        ).exec();
    }
};

/**
 * Common chat Helpers
 */

exports.fetchInbox = async ({ user }) => {
    // console.log(user.__t, mode);
    let removeFieldsForRole = '';
    let populateSelect = '';
    let populateField = '';
    if (user.__t == C.MODELS.WRITER_C) {
        removeFieldsForRole = '-st -cc -cli -crdt';
        populateSelect = 'n img cn tmz pdg dsg';
        populateField = 'u1 u2';
    } else if (user.__t == C.MODELS.CLIENT_C) {
        removeFieldsForRole = '-u1 -p2 -fu2 -st -ctw -cc -cli';
        populateSelect = 'n img pdg dsg tmz';
        populateField = 'u2';
    } else if (user.__t == C.MODELS.PM_C) {
        removeFieldsForRole = '-st -cc -cli -crdt';
        populateSelect = 'n img pdg cn tmz';
        populateField = 'u1 u2';
        /*  if (mode == 'client') {
            removeFieldsForRole = '-u2 -p1 -st -fu1 -cc -cli -crdt';
            populateSelect = 'n img cn tmz';
            populateField = 'u1';
        } else {
            removeFieldsForRole = '-u1 -p2 -st -fu2 -ctw -cc -cli -crdt';
            populateSelect = 'n img pdg tmz';
            populateField = 'u2';
        } */
    } else if (user.__t == C.MODELS.EXT_CLIENT) {
        removeFieldsForRole = '-u1 -p2 -st ';
        populateSelect = 'n img pdg dsg tmz';
        populateField = 'u2';
    } else throw new BadRequest('Unhandled role');

    let findQuery = {
        $or: [{ u1: user._id }, { u2: user._id }],
        st: C.CONVERSATION_STATUS.CREATED,
    };
    // PMs have chat mode
    // Client mode -> When the other user is a client
    // Creator mode -> When the other user is a creator
    if (user.__t == C.MODELS.PM_C) {
        /*  if (mode == 'client') {
            findQuery = {
                ...findQuery,
                __t: C.MODELS.CONVERSATION_CLIENT,
            };
        } else {
            findQuery = {
                ...findQuery,
                __t: C.MODELS.CONVERSATION_PM,
            };
        } */
    }
    let allConversations = await Conversation.find(findQuery)
        .sort({ lmd: -1 })
        .populate([
            { path: populateField, select: populateSelect },
            { path: 'lmsg', select: 'txt createdAt' },
        ])
        .select(removeFieldsForRole)
        .exec();
    const conversations = _.map(allConversations, (convo) => {
        let editConversation = convo.toJSON();
        if (user.__t == C.MODELS.WRITER_C) {
            if (convo.__t == C.MODELS.CONVERSATION_CREATOR) {
                if (convo.user1 == user.id) {
                    editConversation.user = editConversation.user2;
                    editConversation.pendingCount =
                        editConversation.pendingCountUser1;
                    editConversation.userState = editConversation.forU1State;
                } else {
                    editConversation.user = editConversation.user1;
                    editConversation.pendingCount =
                        editConversation.pendingCountUser2;
                    editConversation.userState = editConversation.forU2State;
                }
            } else {
                editConversation.user = editConversation.user1;
                editConversation.pendingCount =
                    editConversation.pendingCountUser2;
                editConversation.userState = editConversation.forU2State;
            }

            delete editConversation.user1;
            delete editConversation.pendingCountUser2;
            delete editConversation.forU2State;
            delete editConversation.user2;
            delete editConversation.pendingCountUser1;
            delete editConversation.forU1State;
        } else if (user.__t == C.MODELS.CLIENT_C) {
            editConversation.user = editConversation.user2;
            editConversation.pendingCount = editConversation.pendingCountUser1;
            editConversation.userState = editConversation.forU1State;
            delete editConversation.user2;
            delete editConversation.pendingCountUser1;
            delete editConversation.forU1State;
        } else if (user.__t == C.MODELS.PM_C) {
            if (convo.__t == C.MODELS.CONVERSATION_CLIENT) {
                editConversation.user = editConversation.user1;
                editConversation.pendingCount =
                    editConversation.pendingCountUser2;
                editConversation.userState = editConversation.forU2State;
            } else {
                editConversation.user = editConversation.user2;
                editConversation.pendingCount =
                    editConversation.pendingCountUser1;
                editConversation.userState = editConversation.forU1State;
            }
            delete editConversation.user1;
            delete editConversation.pendingCountUser2;
            delete editConversation.forU2State;
            delete editConversation.user2;
            delete editConversation.pendingCountUser1;
            delete editConversation.forU1State;
        } else if (user.__t == C.MODELS.EXT_CLIENT) {
            editConversation.user = editConversation.user2;
            editConversation.pendingCount = editConversation.pendingCountUser1;
            delete editConversation.user2;
            delete editConversation.pendingCountUser1;
        }
        return { ...editConversation };
    });
    return conversations;
};

exports.fetchProjects = async ({ user }) => {
    let findQuery = {
        'part.usr': user.id,
    };
    if (user.__t == C.MODELS.PM_C) {
        findQuery = {
            ...findQuery,
            // hc: mode == 'creator' ? false : true,
        };
    }
    let allConversations = await GroupConversation.find(findQuery)
        .sort({ lmd: -1 })
        .populate([{ path: 'lmsg', select: 'txt createdAt' }])
        .select('-own -desc')
        .exec();
    const conversations = [];
    for (let convo of allConversations) {
        convo = convo.toJSON();
        let pendingCount = 0,
            userState;
        for (let participant of convo.participants) {
            if (participant.user == user.id) {
                pendingCount = participant.pendingCount;
                userState = participant.localState;
            }
        }
        delete convo.participants;
        convo.pendingCount = pendingCount;
        convo.userState = userState;
        conversations.push(convo);
    }
    return conversations;
};

/**
 * This function returns users(client/creators) with whom pm has a conversation with
 *
 */
exports.connectedUsers = async ({ pm, selectEmail }) => {
    // Clients Pm has worked with
    let findConversations = await ConversationClient.find({
        u2: pm.id,
        st: C.CONVERSATION_STATUS.CREATED,
    }).exec();
    const clientIds = findConversations.map((convo) => {
        return convo.u1;
    });
    let clientSelect = 'n cn img';
    if (selectEmail) clientSelect += ' e';
    let clients = await Client.find({
        _id: { $in: clientIds },
    })
        .select(clientSelect)
        .exec();
    // Creators Pm has worked with
    let creatorSelect = 'n img pdg';
    if (selectEmail) creatorSelect += ' e';
    findConversations = await ConversationPM.find({
        u1: pm.id,
        sta: { $ne: C.CONVERSATION_PM_STATE.INVITE },
    })
        .populate({
            path: 'u2',
            select: creatorSelect,
        })
        .exec();
    const creators = findConversations.map((convo) => {
        return {
            id: convo.u2.id,
            email: convo.u2.e,
            fullname: convo.u2.fullname,
            image: convo.u2.img,
            designation: convo.u2.pdg,
            badge: convo.minf.bdg,
            __t: C.MODELS.WRITER_C,
        };
    });
    return { clients, creators };
};

exports.conversationsWith = async ({ user }) => {
    let findConversations = await Conversation.find({
        $or: [
            {
                u1: user.id,
            },
            {
                u2: user.id,
            },
        ],
        st: C.CONVERSATION_STATUS.CREATED,
    })
        .select('u1 u2')
        .exec();
    const userIds = [];
    for (let convo of findConversations) {
        userIds.push(convo.u1, convo.u2);
    }
    const users = await User.find({
        _id: {
            $in: userIds,
            $ne: user.id,
        },
    })
        .select('n img pdg cn')
        .exec();
    const clients = [];
    const creators = [];
    for (let user of users) {
        if (user.__t == C.MODELS.CLIENT_C || user.__t == C.MODELS.EXT_CLIENT) {
            clients.push(user);
        } else {
            creators.push(user);
        }
    }
    return {
        clients,
        creators,
    };
};

exports.createMultipleInfoTextGroup = async ({
    convoId,
    usecase,
    senders,
    userIds,
    ownerId,
}) => {
    const infoTexts = [];
    userIds.forEach((userId) => {
        infoTexts.push({
            convoId,
            usecase,
            dtxt: `${senders.get(userId).fullname} added to group`,
            d: {},
            sd: ownerId,
        });
    });
    const createdInfoTexts = await InfoTexts.create(infoTexts);
};

exports.validatePhoneNumber = ({ mobile, mobileCountry }) => {
    try {
        const pU = phoneUtil.PhoneNumberUtil.getInstance();
        const countryCodeMatched = CountryCodes.filter(
            (c) => c.dial_code == mobileCountry,
        );
        for (let matched of countryCodeMatched) {
            const countryCode = matched?.code;
            const number = pU.parseAndKeepRawInput(mobile, countryCode);
            const res = pU.isValidNumberForRegion(number, countryCode);
            if (res) return true;
        }
        return false;
    } catch (err) {
        return false;
    }
};

exports.emailForAdminOnSignUp = (role, user) => {
    // ***********For Admin (roshan) ****************
    if (role == C.ROLES.WRITER_C || role == C.ROLES.CLIENT_C) {
        let msgAdmin;
        if (role == C.ROLES.WRITER_C) {
            msgAdmin = {
                subject: `New Creator Registered`,
                html: for_admin_creator_registration_complete_mail(user),
            };
        } else {
            msgAdmin = {
                subject: `New Client Registered`,
                html: for_admin_client_after_registration_mail(user),
            };
        }
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

    // ****************************************************
};

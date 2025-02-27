/*
 * Module Dependencies
 */

const mongoose = require('mongoose');
const _ = require('lodash');
const C = require('../lib/constants');
const jwt = require('../lib/jwt');
const env = require('../config/env');
const { v4: uuidv4 } = require('uuid');

// Custom Errors
const { BadRequest, InternalServerError } = require('../lib/errors');

/**
 * Models
 */
const User = mongoose.model(C.MODELS.USER_C);
const ExtClient = mongoose.model(C.MODELS.EXT_CLIENT);
const ConversationPM = mongoose.model(C.MODELS.CONVERSATION_PM);
const Conversation = mongoose.model(C.MODELS.CONVERSATION);
const ConversationClient = mongoose.model(C.MODELS.CONVERSATION_CLIENT);
const ConversationExt = mongoose.model(C.MODELS.CONVERSATION_EXT);
const Message = mongoose.model(C.MODELS.MESSAGE);
const InfoText = mongoose.model(C.MODELS.INFO_TEXT);
const GroupMessage = mongoose.model(C.MODELS.GROUP_MESSAGE);
const Invoice = mongoose.model(C.MODELS.INVOICE);
const GroupConversation = mongoose.model(C.MODELS.GROUP_CONVERSATION);
const FormM = mongoose.model(C.MODELS.FORM_M);
const Block = mongoose.model(C.MODELS.BLOCK);

/**
 * Utility functions
 */

const { notification } = require('../messaging/index');
const { deleteMultiple } = require('../utils/s3-operations');

// Other Controllers
const { updateStateAndPersist, deleteFilesByKey } = require('./fileStore');
const {
    exportedGetLatestProjectsOfCreator,
    exportedStudioGeneralInfoStripped,
} = require('./common');
/**
 * Services
 */

const {
    updateConverstionInCacheGroup,
} = require('../services/redis/operations');

const rtService = require('../services/rt');
const userService = require('../services/db/user');

/**
 * Helpers
 */

/* const {
    fetchInbox,
    fetchProjects,
    userHelpers.createMultipleInfoTextGroup,
    conversationsWith,
} = require('./helpers/userHelper');
 */
const userHelpers = require('./helpers/userHelper');
const { createConversationCreator } = require('./helpers/chatHelpers');

/**
 * Common Chat controllers
 */

/**
 * Fetch User info
 */

exports.updateTimeZone = async ({ user, timezone }) => {
    user.tmz = timezone;
    await user.save();
    return {
        msg: 'Timezone updated',
        timezone,
    };
};

exports.getTimeZone = async ({ user }) => {
    return { timezone: user.tmz };
};

exports.getUserInfo = async ({ user }) => {
    if (user.__t == C.MODELS.WRITER_C)
        return {
            name: user.n.f + ' ' + (user.n.l ? user.n.l : ''),
            id: user.id,
            location: user.adr.ci,
            designation: user.pdg,
            stripeOnboardingState: user.strp.cns,
            cashfreeOnboardingState: user.cfos,
            userRole: C.MODELS.WRITER_C,
            onboardState: user.obs,
            onboarding: user.onboarding,
        };
    else if (user.__t == C.MODELS.CLIENT_C) {
        return {
            name: user.n.f + ' ' + (user.n.l ? user.n.l : ''),
            id: user.id,
            location: user.adr.ci,
            company: user.cn,
            userRole: C.MODELS.CLIENT_C,
        };
    } else if (user.__t == C.MODELS.PM_C) {
        return {
            name: user.fullname,
            id: user.id,
            location: user.adr.ci,
            designation: user.dsg,
            stripeOnboardingState: user.strp.cns,
            cashfreeOnboardingState: user.cfos,
            userRole: C.MODELS.PM_C,
        };
    } else if (user.__t == C.ROLES.GU_C) {
        return {
            name: user.fullname,
            id: user.id,
            userRole: C.MODELS.GU_C,
        };
    } else if (user.__t == C.ROLES.EXT_CLIENT) {
        return {
            name: user.fullname,
            id: user.id,
            userRole: C.MODELS.EXT_CLIENT,
            // onboardState: user.obs,
            onboarding: user.onboarding,
        };
    }
};

exports.getUserInfoFront = async ({ user, convoId }) => {
    const conversation = await Conversation.findOne({
        _id: convoId,
        $or: [{ u1: user.id }, { u2: user.id }],
    })
        .populate([
            { path: 'u1', select: 'n img cn pdg dsg stid stdd.img stdd.nm' },
            { path: 'u2', select: 'n img cn pdg dsg stid stdd.img stdd.nm' },
        ])
        .exec();
    if (!conversation) throw new BadRequest('Not a member of conversation');
    let details =
        user.id == conversation.user1.id
            ? conversation.user2
            : conversation.user1;
    details = details.toJSON();
    if (conversation.__t == C.MODELS.CONVERSATION_PM) {
        details.moreInfo = conversation.moreInfo;
    }
    return { details };
};

exports.getCreateConversationCreator = async ({ user, id }) => {
    return {
        conversation: await createConversationCreator({ u1: user.id, u2: id }),
    };
};

exports.inviteEmailToStartConversation = async ({ user, email, name }) => {
    let invitee = await userService.getUserByEmail({ email });
    if (invitee && invitee.email == user.email)
        throw new BadRequest("Please don't invite yourself");
    let convo;
    if (invitee) {
        // Invitee exists on platform
        convo = await Conversation.findOne({
            $or: [
                {
                    u1: invitee.id,
                    u2: user.id,
                },
                {
                    u2: invitee.id,
                    u1: user.id,
                },
            ],
            st: C.CONVERSATION_STATUS.CREATED,
        }).exec();
        if (convo) {
            // ?? Can we remove created/init states
            if (convo.st == C.CONVERSATION_STATUS.CREATED) {
                /* if (invitee.__t == C.ROLES.EXT_CLIENT) {
                    // generate jwt
                    token = await jwt.generateToken({
                        data: { id: invitee.id },
                    });
                    await notification.send({
                        usecase: 'invite-client-1',
                        role: C.ROLES.CLIENT_C,
                        email: {
                            email: invitee.e,
                            link: `${env.FRONTEND_URL}/ext-client/access/${token}`,
                            creatorName: user.fullname,
                        },
                    });
                } else if (invitee.__t == C.ROLES.CLIENT_C) {
                    await notification.send({
                        usecase: 'invite-client-1',
                        role: C.ROLES.CLIENT_C,
                        email: {
                            email: invitee.e,
                            creatorName: user.fullname,
                            link: `${env.CLIENT_PROFILE}/chat`,
                        },
                    });
                } */
            } else {
                convo.st = C.CONVERSATION_STATUS.CREATED;
            }
        }
    } else {
        // Invitee DNE
        invitee = new ExtClient({
            sgm: C.ACCOUNT_SIGNUP_MODE.EMAIL,
            n: { f: name, l: '' },
            e: email,
            // ?? In future when ExtClient wants to become a Client below fields should be set accordingly
            // Until then ExtClient can only access chat using a special link and token
            evt: undefined,
            iev: true,
            p: '',
            acst: C.ACCOUNT_STATUS.ACTIVE,
            refId: uuidv4(),
        });
    }
    if (!convo) {
        // If no conversation exists between user and invitee
        // Create a new conversation
        if (
            !(
                invitee.__t === C.ROLES.CLIENT_C ||
                invitee.__t === C.ROLES.EXT_CLIENT
            )
        ) {
            throw new BadRequest(
                'Email belongs to a role not from [client, extclient]',
            );
        }
        if (invitee.__t == C.ROLES.CLIENT_C) {
            convo = new ConversationClient({
                u1: invitee.id,
                u2: user.id,
                st: C.CONVERSATION_STATUS.CREATED,
                ctw: C.CONVERSATION_CLIENT_U2.CREATOR,
                sta: C.CONVERSATION_STATE.ACTIVE,
            });
        } else {
            convo = new ConversationExt({
                u1: invitee.id,
                u2: user.id,
                st: C.CONVERSATION_STATUS.CREATED,
                sta: C.CONVERSATION_EXT_STATE.ACCEPTED,
            });
        }
    }
    await invitee.save();
    let createInfo = convo.isNew;
    await convo.save();
    if (createInfo) {
        const infoText = new InfoText({
            convoId: convo.id,
            usecase: 'convo-start',
            dtxt: `You invited ${name} on chat`,
            d: {},
            sd: invitee.id,
        });
        await infoText.save();
    }
    let token;
    if (invitee.__t == C.ROLES.EXT_CLIENT) {
        // Ext clients can access chat using link only
        // generate jwt
        token = await jwt.generateToken({
            data: { id: invitee.id },
        });
        await notification.send({
            usecase: 'invite-client-1',
            role: C.ROLES.CLIENT_C,
            email: {
                email: invitee.e,
                link: `${env.FRONTEND_URL}/ext-client/access/${token}`,
                creatorName: user.fullname,
            },
        });
    } else if (invitee.__t == C.ROLES.CLIENT_C) {
        await notification.send({
            usecase: 'invite-client-1',
            role: C.ROLES.CLIENT_C,
            email: {
                email: invitee.e,
                creatorName: user.fullname,
                link: `${env.CLIENT_PROFILE}/chat`,
            },
        });
    }
    // Return new conversation for FE state update
    let conversation = await Conversation.findById(convo.id)
        .populate([{ path: 'u1', select: 'n img cn tmz' }])
        .select('-u2 -p1 -st -fu1 -cc -cli -crdt')
        .exec();
    conversation = conversation.toJSON();
    conversation.user = conversation.user1;
    conversation.pendingCount = conversation.pendingCountUser2;
    conversation.userState = conversation.forU2State;
    delete conversation.user1;
    delete conversation.pendingCountUser2;
    delete conversation.forU2State;
    return {
        msg: 'Invitation sent',
        token,
        conversation,
    };
};

/**
 * Fetch conversation and message controllers
 */

exports.fetchConversationList = async ({ user, state, mode }) => {
    let conversations = [];
    if (state == 'inbox') {
        conversations = await userHelpers.fetchInbox({ user });
    } else if (state == 'projects') {
        conversations = await userHelpers.fetchProjects({ user });
    }

    return {
        conversations,
    };
};

/* exports.fetchConversationList = async ({ user, state }) => {
    let removeFieldsForRole = '';
    let populateSelect = '';
    let populateField = '';
    if (user.__t == C.MODELS.WRITER_C) {
        removeFieldsForRole = '-u2 -p1 -st -fu1';
        populateSelect = 'n cn tmz';
        populateField = 'u1';
    } else if (user.__t == C.MODELS.CLIENT_C) {
        removeFieldsForRole = '-u1 -p2 -st -fu2 -ctw';
        populateSelect = 'n pdg tmz';
        populateField = 'u2';
    }
    let findQuery = {
        $or: [{ u1: user._id }, { u2: user._id }],
        st: C.CONVERSATION_STATUS.CREATED,
    };
    if (state == 'inbox')
        findQuery = {
            ...findQuery,
            sta: { $ne: C.CONVERSATION_STATE.ACTIVE },
        };
    else if (state == 'projects') {
        findQuery = {
            ...findQuery,
            sta: C.CONVERSATION_STATE.ACTIVE,
        };
    }
    let allConversations = await Conversation.find(findQuery)
        .sort({ lmd: -1 })
        .populate(populateField, populateSelect)
        .select(removeFieldsForRole)
        .exec();
    const conversations = _.map(allConversations, (convo) => {
        let editConversation = convo.toJSON();
        if (user.__t == C.MODELS.WRITER_C) {
            editConversation.user = editConversation.user1;
            editConversation.pendingCount = editConversation.pendingCountUser2;
            editConversation.userState = editConversation.forU2State;
            delete editConversation.user1;
            delete editConversation.pendingCountUser2;
            delete editConversation.forU2State;
            delete editConversation.chatWith;
        } else if (user.__t == C.MODELS.CLIENT_C) {
            editConversation.user = editConversation.user2;
            editConversation.pendingCount = editConversation.pendingCountUser1;
            editConversation.userState = editConversation.forU1State;
            delete editConversation.user2;
            delete editConversation.pendingCountUser1;
            delete editConversation.forU1State;
        }
        return { ...editConversation };
    });
    return {
        conversations,
    };
}; */

exports.fetchGroupDetails = async ({ user, gid }) => {
    let group = await GroupConversation.findOne({
        _id: gid,
        'part.usr': user.id,
    })
        .select('-part.ls -part.pc')
        .populate([{ path: 'part.usr', select: 'n img cn pdg' }])
        .exec();

    if (!group) throw new BadRequest('Group conversation was not found');

    let service = null;

    if (
        group.type == C.GROUP_CONVERSATION_TYPES.PROJECT &&
        group.projectDetails
    ) {
        const serviceRef = group.projectDetails.serviceRef;
        const serviceBlock = await Block.findById(serviceRef)
            .select('clt t desc sref ft prc ru curr dta')
            .populate({ path: 'sref', select: 't desc ft prc ru curr' })
            .exec();
        if (serviceBlock) {
            if (
                serviceBlock.__t == C.MODELS.IMPORTED_SERVICE &&
                serviceBlock.collabType == C.COLLAB_TYPE.REFER
            ) {
                service = {
                    id: serviceBlock.serviceRef.id,
                    title: serviceBlock.serviceRef.title,
                    description: serviceBlock.serviceRef.description,
                    feesType: serviceBlock.serviceRef.feesType,
                    price: serviceBlock.serviceRef.price,
                    rateUnit: serviceBlock.serviceRef.rateUnit,
                    currency: serviceBlock.serviceRef.currency,
                };
            } else if (
                serviceBlock.__t == C.MODELS.IMPORTED_SERVICE &&
                serviceBlock.collabType == C.COLLAB_TYPE.MANAGE
            ) {
                service = {
                    id: serviceBlock.id,
                    title: serviceBlock.title,
                    description: serviceBlock.description,
                    feesType: serviceBlock.details.feesType,
                    price: serviceBlock.details.price,
                    rateUnit: serviceBlock.details.rateUnit,
                    currency: serviceBlock.details.currency,
                };
            } else {
                service = {
                    id: serviceBlock.id,
                    title: serviceBlock.title,
                    description: serviceBlock.description,
                    feesType: serviceBlock.feesType,
                    price: serviceBlock.price,
                    rateUnit: serviceBlock.rateUnit,
                    currency: serviceBlock.currency,
                };
            }
        }
    }
    group = group.toJSON();
    group.service = service;
    delete group.projectDetails;

    const creatorIds = _.map(group.participants, (member) => {
        return member.user.id;
    });
    // console.log(creatorIds);
    const convesationsForBadges = await ConversationPM.find({
        u2: { $in: creatorIds },
    })
        .select('u2 minf.bdg')
        .exec();
    const creatorBadgeMap = new Map();
    _.map(convesationsForBadges, (convo) => {
        creatorBadgeMap.set(convo.u2.toString(), convo.minf.bdg);
    });
    // console.log(convesationsForBadges, creatorBadgeMap);
    let canEdit = false;
    for (let i = 0; i < group.participants.length; i++) {
        const part = group.participants[i].user;
        if (creatorBadgeMap.has(part.id)) {
            group.participants[i].badge = creatorBadgeMap.get(part.id);
        }
        if (part.id == user.id && group.participants[i].admin === true)
            canEdit = true;
    }
    group = { ...group, canEdit };
    return { group };
};

exports.uploadFile = async ({ user, files, message }) => {
    if (!(Array.isArray(files) && files.length > 0)) {
        throw new InternalServerError('upload failed');
    }
    await message.save();
    return {
        msg: 'file uploaded',
        messageId: message.id,
    };
};

exports.fetchMessagesOfConversation = async ({ convoId, user, paginate }) => {
    const { cursor, limit, direction, group } = paginate;
    let findConversation;
    if (group) {
        findConversation = await GroupConversation.findOne({
            _id: convoId,
            'part.usr': user.id,
        }).exec();
        if (!findConversation) throw new BadRequest('Not part of conversation');
    } else {
        findConversation = await Conversation.findById(convoId).exec();
        if (
            !findConversation ||
            (user.id != findConversation.u1 && user.id != findConversation.u2)
        ) {
            throw new BadRequest('Not part of conversation');
        }
    }

    let query = {
        convoId,
        // File and Proposal have cst field which should be 'CREATED'
        $or: [{ cst: { $exists: false } }, { cst: 'CREATED' }],
    };
    /**
     * For cursor based pagination
     */
    if (cursor) {
        if (direction == 'forward') query = { ...query, puid: { $lt: cursor } };
        if (direction == 'backward')
            query = { ...query, puid: { $gt: cursor } };
    }
    let options = { limit: limit };
    if (direction == 'forward') {
        options = { ...options, sort: { puid: -1 } };
    }
    let messageModel;
    if (group) {
        messageModel = mongoose.model(C.MODELS.GROUP_MESSAGE);
    } else {
        messageModel = mongoose.model(C.MODELS.MESSAGE);
    }
    let removeFieldsJob = '-description -cg -jt';
    let removeFieldsForm = '-flds';
    let removeFieldsProposal = '-pyc -cst';
    let removeFields = `${removeFieldsJob} ${removeFieldsForm} ${removeFieldsProposal}`;
    const result = await messageModel
        .find(query, null, options)
        .select(removeFields)
        .populate([
            // Common
            {
                path: 'sd',
                select: 'n pdg cn stid stdd.nm nm t txt',
            },
            {
                path: 'rto',
                // select: 'n sd pdg cn stid stdd.nm nm t txt',
                select: 'n sd pdg cn stid stdd.nm nm t txt fuls imgs',
                populate: {
                    path: 'sd',
                    select: 'n',
                },
            },
            // invoice
            {
                path: 'invId',
                select: 'userId invn invc n ind dd ito iby cur tot st pg',
            },
            // collab request
            {
                path: 'rq',
                select: 'rqt sv clt msg st m.title',
                populate: [
                    {
                        path: 'sv',
                        select: 't',
                    },
                ],
            },
            // extPay, extRequest
            {
                path: 'imp',
                select: 'u clt',
                populate: [{ path: 'u', select: 'n img' }],
            },
        ])
        .exec();
    /**
     * Update cursors
     */
    let next_cursor = '';
    let previous_cursor = '';
    if (direction == 'forward') {
        if (result.length > 0) {
            next_cursor = result[result.length - 1].puid;
            previous_cursor = result[0].puid;
        }
    }
    if (direction == 'backward') {
        if (result.length > 0) {
            next_cursor = result[0].puid;
            previous_cursor = result[result.length - 1].puid;
        }
    }
    return {
        messages: result,
        pageDetails: { next_cursor, previous_cursor, limit },
    };
};

const urlRegex =
    /^(https?:\/\/(?:www\.|(?!www))[a-zA-Z0-9][a-zA-Z0-9-]+[a-zA-Z0-9]\.[^\s]{2,}|www\.[a-zA-Z0-9][a-zA-Z0-9-]+[a-zA-Z0-9]\.[^\s]{2,}|https?:\/\/(?:www\.|(?!www))[a-zA-Z0-9]+\.[^\s]{2,}|www\.[a-zA-Z0-9]+\.[^\s]{2,})$/;
exports.fetchMessageByType = async ({ user, type, convoId, group }) => {
    let findConversation;
    if (group) {
        findConversation = await GroupConversation.findOne({
            _id: convoId,
            'part.usr': user.id,
        }).exec();
        if (!findConversation) throw new BadRequest('Not part of conversation');
    } else {
        findConversation = await Conversation.findById(convoId).exec();
        if (
            !findConversation ||
            (user.id != findConversation.u1 && user.id != findConversation.u2)
        ) {
            throw new BadRequest('Not part of conversation');
        }
    }
    /*
    const findConversation = await Conversation.findById(convoId).exec();
    if (
        !findConversation ||
        (user.id != findConversation.u1 && user.id != findConversation.u2)
    ) {
        throw new BadRequest('Not part of conversation');
    }*/
    let query = {
        convoId: mongoose.Types.ObjectId(convoId),
        // File and ProposalM have cst field which should be 'CREATED'
        $or: [{ cst: { $exists: false } }, { cst: 'CREATED' }],
    };
    let select = {};
    let discriminatorType = '';
    let unwindField = '';
    if (type == 'Brief') {
        discriminatorType = type;
        select = {
            dueDate: '$dd',
            'client.name.first': '$clientAll.n.f',
            'client.name.last': '$clientAll.n.l',
            'client.fullname': {
                $concat: ['$clientAll.n.f', ' ', '$clientAll.n.l'],
            },
            'client.company': '$clientAll.cn',
        };
    } else if (type == 'ProposalM') {
        discriminatorType = type;
        select = {
            name: '$nm',
            dueDate: '$dd',
            price: '$prc',
            currency: '$cur',
        };
    } else if (type == 'Images') {
        discriminatorType = group ? 'GroupFile' : 'File';
        select = {
            'images.originalName': '$imgs.ogn',
            'images.url': '$imgs.ul',
            'images.id': '$imgs._id',
        };
        // select non empty array only
        query = { ...query, 'imgs.0': { $exists: true } };
        unwindField = '$imgs';
    } else if (type == 'Docs') {
        discriminatorType = 'File';
        select = {
            'files.originalName': '$fuls.ogn',
            'files.url': '$fuls.ul',
            'files.id': '$fuls._id',
        };
        // select non empty array only
        query = { ...query, 'fuls.0': { $exists: true } };
        unwindField = '$fuls';
    } else if (type == 'Invoice') {
        discriminatorType =  group ? C.MODELS.GROUP_INVOICE : C.MODELS.INVOICE;
        select = {
            invoice: '$invId',
            invoiceDate: '$ind',
            paidOn: '$pon',
            dueDate: '$dd',
            total: '$tot',
            status: '$st',
            currency: '$cur',
        };
        query = { ...query, 'invId': { $exists: true } };
        unwindField = '$invId';

    } else if (type == 'Payments') {
        // Payments includes paid invoices and ExtPay of any state
        discriminatorType = { $in: [C.MODELS.INVOICE, C.MODELS.EXT_PAY] };
        select = {
            // For invoice
            name: '$n',
            invoiceDate: '$ind',
            paidOn: '$pon',
            dueDate: '$dd',
            total: '$tot',
            status: '$st',
            currency: '$cur', // Common to both invoice and extPay
            // For extPay
            state: '$st',
            amount: '$amt',
            text: '$txt',
            currency: '$curr',
            type: '$__t',
        };
        query = {
            ...query,
            st: {
                $in: [
                    ...Object.values(C.INVOICE_STATES),
                    ...Object.values(C.EXT_PAY_STATES),
                ],
            },
        };
    } else if (type == 'FormM') {
        discriminatorType = type;
        select = {
            name: '$nm',
            description: '$desc',
            submitted: '$subm',
        };
    } else if (type == 'ExtRequest') {
        discriminatorType = type;
        select = {
            state: '$st',
            txt: 1,
            name: 2,
            sref: "$sref"
        };
    }
    if (type != 'Link') query.__t = discriminatorType;
    else {
        /**
         * Regex match for links in query on txt field
         * It can be inside any message so no disciminator match
         */
        query = { ...query, txt: new RegExp(urlRegex, 'i') };
        select = { txt: 1 };
    }
    // Required by all messages
    select.sender = '$sd';
    select.createdAt = 1;
    select.id = '$_id';
    select._id = 0;
    /**
     * Aggreagation Pipeline
     */
    const aggregatePipeline = [{ $match: query }, { $sort: { puid: -1 } }];
    /**
     * Extra pipeline elemets before final projection for specic Types
     */
    if (type == 'Images' || type == 'Docs')
        // Convert array of array to single array
        aggregatePipeline.push({ $unwind: unwindField });
    if (type == 'Brief') {
        /**
         * For briefs we perform lookup on sender field to get client details
         */
        aggregatePipeline.push({
            $lookup: {
                from: 'users',
                localField: 'sd',
                foreignField: '_id',
                as: 'clientLookup',
            },
        });
        /**
         * Lookup returns an array, so convert it to object
         */
        /*         if (type == 'Brief') { */
        aggregatePipeline.push({
            $project: {
                dd: '$dd',
                sd: '$sd',
                createdAt: 1,
                id: '$_id',
                clientAll: { $arrayElemAt: ['$clientLookup', 0] },
            },
        });
    }
    // Final Projection
    aggregatePipeline.push({ $project: select });
    let messageModel;
    if (group) {
        messageModel = mongoose.model(C.MODELS.GROUP_MESSAGE);
    } else {
        messageModel = mongoose.model(C.MODELS.MESSAGE);
    }
    let messages = await messageModel.aggregate(aggregatePipeline);

    return { messages };
};

exports.fetchSpecificMessage = async ({ user, mid }) => {
    let message = await Message.findById(mid)
        .populate([
            {
                path: 'convoId',
                // TODO: User details populate might be temporary
                populate: {
                    path: 'u1 u2',
                    select: 'n pdg stid stdd.nm cn adr strp',
                },
            },
            {
                path: 'invId',
                select: 'userId invn invc n ind dd ito iby cur tot st pg',
            },
            // collab request
            {
                path: 'rq',
                select: 'sd sv clt msg page st m',
                populate: [
                    {
                        path: 'sd',
                        select: 'n',
                    },
                    {
                        path: 'sv',
                        select: 't',
                    },
                ],
            },
        ])
        .exec();
    if (
        !message ||
        (message.convoId.u1.id != user.id && message.convoId.u2.id != user.id)
    ) {
        throw new BadRequest('Not part of conversation');
    }
    message = message.toJSON();
    message.client = message.conversationId.user1;
    message.creator = message.conversationId.user2;
    message.conversationId = message.conversationId.id;
    // Get original Name for breifs/references
    if (message.__t == C.MODELS.BRIEF) {
        message.briefName = message.brief.split('/').pop();
        message.referenceName = message.reference.split('/').pop();
    }
    if (message.__t == C.MODELS.STUDIO_INVITE) {
        message.studioDetails = await exportedStudioGeneralInfoStripped({
            userId: message.sender,
        });
        const latestProjects = await exportedGetLatestProjectsOfCreator({
            creatorId: message.sender,
        });
        message.latestProjects = latestProjects.posts;
    }
    if (message.__t == C.MODELS.FORM_M) {
        message.canReply = user.id == message.sender ? false : true;
    }
    if (message.__t == C.MODELS.JOB_INVITE) {
        message.canReply = user.id == message.sender ? false : true;
    }
    /*   if (message.__t == C.MODELS.INVOICE) {
        message.canPay = user.id == message.sender ? false : true;
        message.stripeAccountId = message.creator.stripeInfo.accountId;
    } */
    delete message.client.address.street;
    delete message.client.address.state;
    delete message.client.address.pincode;
    delete message.creator.address.street;
    delete message.creator.address.state;
    delete message.creator.address.pincode;
    if (message.client.stripeInfo) delete message.client.stripeInfo;
    if (message.creator.stripeInfo) delete message.creator.stripeInfo;
    return {
        message,
    };
};

// Get the last invoice information from each conversation
// when user is client then u1 = user.id
// When user is creator then u2 = user.id
// When user is pm then mode comes into play with u1/u2 = user.id based on mode
exports.getPaymentsList = async ({ user, mode, onlyInvoice = false }) => {
    let findQuery = { st: C.CONVERSATION_STATUS.CREATED };
    let populate = [];
    let selectField = 'u1 u2';
    if (user.__t == C.MODELS.WRITER_C) {
        findQuery = { ...findQuery, u2: user.id };
        selectField = 'u1';
        // Creators want to know to whom they sent invoices, so populate u1
        populate.push({
            path: 'u1',
            select: 'n img',
        });
    } else if (user.__t == C.MODELS.CLIENT_C) {
        findQuery = { ...findQuery, u1: user.id };
        // Client want to know from whom they received invoices, or who they paid, so populdate u2
        selectField = 'u2';
        populate.push({
            path: 'u2',
            select: 'n img',
        });
    } else if (user.__t == C.MODELS.PM_C) {
        /* if (mode == 'client') {
            findQuery = { ...findQuery, u2: user.id };
        } else {
            findQuery = { ...findQuery, u1: user.id };
        } */
        findQuery = { ...findQuery, $or: [{ u1: user.id }, { u2: user.id }] };
        // PM can be both client creator
        populate.push(
            {
                path: 'u2',
                select: 'n img',
            },
            {
                path: 'u1',
                select: 'n img',
            },
        );
    } else throw new BadRequest('Unhandled role');
    const conversations = await Conversation.find(findQuery)
        .populate(populate)
        .exec();
    // A map to store info info the user (name, image). For which users info we want see above where we select which user (u1, u2) to populate
    const userInfo = new Map();
    const conversationIds = conversations.map((convo) => {
        let setValue = {};
        if (convo.u1 && convo.u2) {
            if (user.id == convo.u1.id) {
                // PM acting as client
                setValue = {
                    name: convo.u2.n,
                    fullname: convo.u2.fullname,
                    image: convo.u2.image,
                    sender: convo.u2.__t,
                };
            } else {
                // PM acting as creator
                setValue = {
                    name: convo.u1.n,
                    fullname: convo.u1.fullname,
                    image: convo.u1.image,
                    sender: convo.u1.__t,
                };
            }
        } else {
            if (convo.u1) {
                setValue = {
                    name: convo.u1.n,
                    fullname: convo.u1.fullname,
                    image: convo.u1.image,
                    sender: convo.u1.__t,
                };
            } else {
                setValue = {
                    name: convo.u2.n,
                    fullname: convo.u2.fullname,
                    image: convo.u2.image,
                    sender: convo.u2.__t,
                };
            }
        }
        userInfo.set(convo.id.toString(), setValue);
        return convo._id;
    });
    let types = [C.MODELS.EXT_PAY, C.MODELS.INVOICE];
    if (onlyInvoice) {
        types = [C.MODELS.INVOICE];
    }
    const query = {
        convoId: { $in: conversationIds },
        __t: { $in: types },
    };
    // https://stackoverflow.com/questions/58065037/mongodb-safely-sort-inner-array-after-group
    const aggregatePipeline = [
        { $match: query },
        { $sort: { puid: -1 } },
        /* {
            $lookup: {
                from: 'users',
                localField: 'sd',
                foreignField: '_id',
                as: 'user',
            },
        }, */
        {
            $group: {
                _id: '$convoId',
                // push current document being processed
                invoices: { $push: '$$ROOT' },
            },
        },
        {
            $project: {
                lastPaymentPop: { $arrayElemAt: ['$invoices', 0] },
                // namePop: { $arrayElemAt: ['$invoices.user', 0] },
            },
        },
        {
            $project: {
                lastPayment: '$lastPaymentPop',
                // theUser: { $arrayElemAt: ['$namePop', 0] },
            },
        },
        {
            $project: {
                conversationId: '$_id',
                // 'name.first': '$theUser.n.f',
                // 'name.last': '$theUser.n.l',
                // fullname: {
                //    $concat: ['$theUser.n.f', ' ', '$theUser.n.l'],
                // },
                // image: '$theUser.img',
                paidOn: '$lastPayment.pon',
                dueDate: '$lastPayment.dd',
                status: '$lastPayment.st',
                currency: '$lastPayment.cur',
                // sender: '$theUser.__t',
            },
        },
    ];
    const payments = await Message.aggregate(aggregatePipeline);
    _.forEach(payments, (pay, index) => {
        payments[index] = {
            ...pay,
            ...userInfo.get(pay.conversationId.toString()),
        };
    });
    return {
        payments,
    };
};

// Search conversation for a text message
exports.searchConversation = async ({ user, cid, searchText, group }) => {
    let findConversation;
    if (group) {
        findConversation = await GroupConversation.findOne({
            _id: cid,
            'part.usr': user.id,
        }).exec();
        // console.log(findConversation);
        if (!findConversation) throw new BadRequest('Not part of conversation');
    } else {
        findConversation = await Conversation.findById(cid).exec();
        if (
            !findConversation ||
            (user.id != findConversation.u1 && user.id != findConversation.u2)
        ) {
            throw new BadRequest('Not part of conversation');
        }
    }

    let messageModel;
    if (group) {
        messageModel = mongoose.model(C.MODELS.GROUP_MESSAGE);
    } else {
        messageModel = mongoose.model(C.MODELS.MESSAGE);
    }
    const messages = await messageModel
        .find({
            convoId: findConversation._id,
            txt: { $regex: searchText, $options: '-i' },
        })
        .select('txt')
        .exec();
    return {
        messages,
    };
};

// For messageId get it's cursor
// Also get all message upto that cursor
// Useful when we directly want to get to a message inside chat (ex: Show in chat feature)

exports.getCursorFromId = async ({ user, mid, group }) => {
    let message;
    if (group) {
        message = await GroupMessage.findById(mid).exec();
        if (!message) throw new BadRequest('Message not found');
        const findConversation = await GroupConversation.findOne({
            _id: message.convoId,
            'part.usr': user.id,
        }).exec();
        if (!findConversation) throw new BadRequest('Not part of conversation');
    } else {
        message = await Message.findById(mid).populate('convoId').exec();
        if (
            !message ||
            (message.convoId.u1 != user.id && message.convoId.u2 != user.id)
        ) {
            throw new BadRequest('Not part of conversation');
        }
    }

    const convoId = message.convoId._id;
    let query = {
        convoId,
        // File and Proposal have cst field which should be 'CREATED'
        $or: [{ cst: { $exists: false } }, { cst: 'CREATED' }],
        puid: { $gte: message.puid },
    };

    let messageModel;
    if (group) {
        messageModel = mongoose.model(C.MODELS.GROUP_MESSAGE);
    } else {
        messageModel = mongoose.model(C.MODELS.MESSAGE);
    }
    const result = await messageModel
        .find(query)
        .populate([
            // Common
            {
                path: 'sd',
                select: 'n pdg cn stid stdd.nm nm t txt',
            },
            {
                path: 'rto',
                select: 'n sd pdg cn stid stdd.nm nm t txt',
                populate: {
                    path: 'sd',
                    select: 'n',
                },
            },
            // invoice
            {
                path: 'invId',
                select: 'userId invn invc n ind dd ito iby cur tot st pg',
            },
            // collab request
            {
                path: 'rq',
                select: 'rqt sv clt msg st m.title',
                populate: [
                    {
                        path: 'sv',
                        select: 't',
                    },
                ],
            },
            // extPay, extRequest
            {
                path: 'imp',
                select: 'u clt',
                populate: [{ path: 'u', select: 'n img' }],
            },
        ])
        .exec();
    let next_cursor = '';
    let previous_cursor = '';

    if (result.length > 0) {
        next_cursor = result[0].puid;
        previous_cursor = '';
    }

    return { messages: result, pageDetails: { next_cursor, previous_cursor } };
};

exports.updateConversationState = async ({ user, state, convoId }) => {
    const findConversation = await Conversation.findById(convoId).exec();
    if (
        !findConversation ||
        (user.id != findConversation.u1 && user.id != findConversation.u2)
    ) {
        throw new BadRequest('Not part of conversation');
    }
    if (user.id == findConversation.u1) {
        findConversation.fu1 = state;
    } else {
        findConversation.fu2 = state;
    }
    await findConversation.save();
    return {
        msg: 'conversation state changed',
        state,
    };
};

exports.createGroupConversation = async ({ user, data }) => {
    const { name, description, userIds } = data;

    // TODO: Verify if userIds contains valid ids that can be added to group

    const fetchUsers = await User.find({
        _id: {
            $in: userIds,
            $ne: user.id,
        },
    })
        .select('n cn img pdg')
        .exec();
    const memberIds = new Map();
    _.forEach(fetchUsers, (user) => {
        memberIds.set(user.id, user.toJSON());
    });

    for (let userId of userIds) {
        if (!memberIds.has(userId)) {
            throw new BadRequest('One or more user cannot be added to group');
        }
    }
    /*  const { clients, creators } = await connectedUsers({ pm });
    let hasClient = false;
    const memberIds = new Map();
    _.forEach(clients, (user) => {
        if (userIds.includes(user.id)) {
            hasClient = true;
        }
        memberIds.set(user.id, user);
    });
    _.forEach(creators, (user) => {
        memberIds.set(user.id, user);
    });

    for (let userId of userIds) {
        if (!memberIds.has(userId)) {
            throw new BadRequest('One or more user cannot be added to group');
        }
    } */

    // Create conversation
    // Add user as member by default
    const newConversation = new GroupConversation({
        own: user.id,
        n: name,
        desc: description,
        part: [{ usr: user.id, ad: true }],
    });
    for (let userId of userIds) {
        newConversation.part.push({
            usr: userId,
        });
    }
    await newConversation.save();

    // Create InfoText messages for the users added to group
    await userHelpers.createMultipleInfoTextGroup({
        convoId: newConversation.id,
        usecase: 'new-member',
        senders: memberIds,
        userIds,
        ownerId: user.id,
    });
    // Send event to new users for the new conversation
    // If users are online, conversation can be added to the chat in real time
    await rtService.sendNewConversation({
        receivers: userIds,
        conversationId: newConversation.id,
        pendingCount: 0,
        conversationType: C.CONVERSATION_TYPE.PROJECT,
    });
    return {
        msg: 'Group Conversation created successfuly',
        id: newConversation.id,
        name: newConversation.n,
        image: newConversation.img,
        hasClient: newConversation.hc,
        lastMessage: newConversation.lmd,
        pendingCount: 0,
        userState: C.CONVERSATION_LOCAL_STATE.ONGOING,
    };
};

exports.getMembersToAdd = async ({ user }) => {
    const { clients, creators } = await userHelpers.conversationsWith({ user });
    return {
        clients,
        creators,
    };
};

exports.addGroupParticipants = async ({ user, gid, userIds }) => {
    // Fetch group
    const groupConvo = await GroupConversation.findOne({
        own: user.id,
        _id: gid,
    }).exec();
    if (!groupConvo) throw new BadRequest('Group not found');

    // TODO: Verify if userIds contains valid ids that can be added to group

    const fetchUsers = await User.find({
        _id: {
            $in: userIds,
        },
    })
        .select('n cn img pdg')
        .exec();
    const memberIds = new Map();
    _.forEach(fetchUsers, (user) => {
        memberIds.set(user.id, user.toJSON());
    });

    for (let userId of userIds) {
        if (!memberIds.has(userId)) {
            throw new BadRequest('One or more user cannot be added to group');
        }
    }

    /* // Verify if userIds contains valid ids that can be added to group
    let { clients, creators } = await connectedUsers({ pm });
    const creatorMap = new Map();
    const clientMap = new Map();
    _.forEach(clients, (client) => {
        clientMap.set(client.id, client);
    });
    _.forEach(creators, (creator) => {
        creatorMap.set(creator.id, creator);
    });
    _.forEach(userIds, (userId) => {
        if (creatorMap.has(userId) || clientMap.has(userId)) {
            // If one or more userId to added is of client bucket, set hasClient to true
            if (clientMap.has(userId)) {
                groupConvo.hc = true;
            }
        } else {
            throw new BadRequest(
                'One or more userId is not allowed to be added to group',
            );
        }
    }); */

    // To check if userIds contains ids that are not already a member of group
    const groupMemberIds = new Set();
    _.forEach(groupConvo.part, (participant) => {
        groupMemberIds.add(participant.usr.toString());
    });
    // To Store newly added users for response
    const participants = [];
    // For each userId, check if userId is not already in groupMemberIds
    // Push to group.participants and create subDoc
    // build object for the API response
    for (let uid of userIds) {
        if (groupMemberIds.has(uid)) {
            throw new BadRequest('A user is already a member of group');
        }
        groupConvo.part.push({
            usr: uid,
        });
        // Create response object for response
        const newMemberDoc = groupConvo.part[groupConvo.part.length - 1];
        const forRes = {
            admin: newMemberDoc.ad,
            id: newMemberDoc._id,
            user: memberIds.get(uid),
            badge: C.STUDIO_MEMBER_BADGES.BRONZE,
        };
        participants.push(forRes);
    }
    await groupConvo.save();
    // Create InfoText messages for the users added to group
    await userHelpers.createMultipleInfoTextGroup({
        convoId: groupConvo.id,
        usecase: 'new-member',
        senders: memberIds,
        userIds,
        ownerId: user.id,
    });
    // Update cache with latest data
    await updateConverstionInCacheGroup({
        conversation: groupConvo,
    });
    // Send event to new users for the new conversation
    // If users are online, conversation can be added to the chat in real time
    await rtService.sendNewConversation({
        receivers: userIds,
        conversationId: groupConvo.id,
        pendingCount: 0,
        conversationType: C.CONVERSATION_TYPE.PROJECT,
    });
    return {
        msg: 'Users added to group',
        participants,
    };
};

exports.addOffPlatformUser = async ({ user, gid, data }) => {
    const { name, email, admin } = data;
    // Find this group
    // user should be admin to add participant
    const group = await GroupConversation.findOne({
        part: { $elemMatch: { usr: user.id, ad: true } },
        _id: gid,
    }).exec();
    if (!group) throw new BadRequest('Group not found');
    let invitee = await userService.getUserByEmail({ email });
    if (invitee && invitee.email == user.email)
        throw new BadRequest("Please don't add yourself to group");
    // Get group members
    let groupMembers = _.map(group.part, (member) => {
        return member.usr.toString();
    });

    if (invitee) {
        if (groupMembers.includes(invitee.id))
            throw new BadRequest('User is already a member of group');
    } else {
        invitee = userService.createUser({
            role: C.MODELS.EXT_CLIENT,
            firstName: name,
            email,
        });
    }
    group.part.push({
        usr: invitee.id,
        ad: admin,
    });
    await invitee.save();
    await group.save();

    // Send email
    if (invitee.__t == C.ROLES.EXT_CLIENT) {
        // Ext clients can access chat using link only
        // generate jwt
        let token = await jwt.generateToken({
            data: { id: invitee.id },
        });
        await notification.send({
            usecase: 'invite-client-to-group',
            role: C.ROLES.CLIENT_C,
            email: {
                email: invitee.e,
                link: `${env.FRONTEND_URL}/ext-client/access/${token}`,
                creatorName: user.fullname,
                groupName: group.name,
            },
        });
    }

    // Create InfoText messages for the user added to group
    const senders = new Map();
    senders.set(invitee.id.toString(), invitee);
    await userHelpers.createMultipleInfoTextGroup({
        convoId: group.id,
        usecase: 'new-member',
        senders,
        userIds: [invitee.id.toString()],
        ownerId: group.own,
    });
    // Update cache with latest data
    await updateConverstionInCacheGroup({
        conversation: group,
    });
    return {
        msg: 'New user added to group',
    };
};

exports.updateGroupDetails = async ({ user, data, gid }) => {
    const { name, description } = data;
    const groupConvo = await GroupConversation.findOne({
        // $elemMatch - At least on member which satisfies both properties
        // Don't use -  'par.usr' and 'part.ad', as it doesn't match on same document
        part: { $elemMatch: { usr: user.id, ad: true } },
        _id: gid,
    }).exec();
    if (!groupConvo)
        throw new BadRequest(
            'Group not found/Only admins can edit group details',
        );
    groupConvo.n = name;
    groupConvo.desc = description;
    await groupConvo.save();
    return {
        msg: 'Group details updated!',
    };
};

exports.updateLogo = async ({ group, file, fileId }) => {
    if (!file && !fileId) {
        throw new BadRequest('no file selected');
    }
    if (file) {
        // File was uploaded using multer
        group.img = `${env.S3_BUCKET_WEBSITE_URL}/groupConversations/${group.id}/logo`;
    } else {
        // File uploaded directly to s3 using new file upload service
        if (group.img) {
            // first remove existing logo files
            let oldImgOriginal = group.img.replace(
                env.S3_BUCKET_WEBSITE_URL + '/',
                '',
            );
            const filesToRemove = [];
            // This condition is checked for backwards compatibility
            if (oldImgOriginal.includes(env.S3_BUCKET_FILE_FOLDER)) {
                filesToRemove.push(oldImgOriginal);
                // Remove resized versions of older image
                const versions = Object.values(C.PORTFOLIO_IMAGE_VERSIONS);
                for (let vr of versions) {
                    filesToRemove.push(`${oldImgOriginal}-${vr}.webp`);
                }
            }
            if (filesToRemove.length > 0) {
                // Remove from s3 (tortoise); delete documents
                await deleteMultiple(env.S3_BUCKET_USER_DATA, filesToRemove);
                await deleteFilesByKey({ keys: filesToRemove });
            }
        }
        // Now save new image using new fileId
        const fileIds = [fileId];
        // Create Image sub documents
        // Update state of files in db and move objects from 'mayfly' to 'tortoise' directory
        const fileKeys = await updateStateAndPersist({
            fileIds,
            allowedTypes: ['image'],
        });
        _.forEach(fileKeys, (file) => {
            const originalPath = `${env.S3_BUCKET_WEBSITE_URL}/${file.key}`;
            group.img = `${originalPath}`;
        });
    }
    await group.save();
    return {
        msg: 'Logo Updated',
        link: group.img,
    };
};

exports.removeLogo = async ({ group }) => {
    if (group.img) {
        // first remove existing logo files
        let oldImgOriginal = group.img.replace(
            env.S3_BUCKET_WEBSITE_URL + '/',
            '',
        );
        const filesToRemove = [];
        // This condition is checked for backwards compatibility
        if (oldImgOriginal.includes(env.S3_BUCKET_FILE_FOLDER)) {
            filesToRemove.push(oldImgOriginal);
            // Remove resized versions of older image
            const versions = Object.values(C.PORTFOLIO_IMAGE_VERSIONS);
            for (let vr of versions) {
                filesToRemove.push(`${oldImgOriginal}-${vr}.webp`);
            }
        }
        if (filesToRemove.length > 0) {
            // Remove from s3 (tortoise); delete documents
            await deleteMultiple(env.S3_BUCKET_USER_DATA, filesToRemove);
            await deleteFilesByKey({ keys: filesToRemove });
        }
    }
    group.img = '';
    await group.save();
    return {
        msg: 'Logo removed',
    };
};

exports.submitFormResponse = async ({ user, mid, form }) => {
    const findForm = await FormM.findOne({
        _id: mid,
    })
        .populate('convoId')
        .exec();
    if (!findForm) throw new BadRequest('Invalid Form id');
    if (findForm.convoId.u1 != user.id && findForm.convoId.u2 != user.id)
        throw new BadRequest('Not part of conersation');
    if (findForm.sd == user.id)
        throw new BadRequest("Form creator can't submit form");
    if (findForm.submitted)
        throw new BadRequest('Response to form already submitted');
    if (findForm.fields.length !== form.fields.length)
        throw new BadRequest('Fields length mismatch');
    let fieldsCount = findForm.fields.length;

    /**
     * Each field has an id
     * For each Field from request
     * If
     *  type is text then use answer from request. If answer is empty and field if required, throw error
     * Else
     *  The other types have options. Each options has an id
     *  the selected string/array inside request contains the selected option ids
     *  If field has an other field use the answer from request
     *  Let selectedCount = no. of selected fields = length of form.selected + 1(if other is present and is selected)
     *  For multi_choice selectedCount cannot be greater than 1
     *
     */
    for (let i = 0; i < fieldsCount; i++) {
        let fieldId = form.fields[i].id;
        let currentField = form.fields[i];
        let doc = findForm.flds.id(fieldId);
        if (!doc) throw new BadRequest('Field not found');
        // Text
        if (doc.ty == C.FORM_TYPES.TEXT) {
            if (doc.req && !currentField.answer) {
                throw new BadRequest('A text field answer is required');
            }
            doc.ans = currentField.answer;
            // Other
        } else {
            // Change String to array for multiple choice
            if (typeof currentField.selected === 'string') {
                if (currentField.selected.length > 0) {
                    currentField.selected = [currentField.selected];
                } else currentField.selected = [];
            }
            let optionLen = currentField.selected.length;
            // For each option id mark its corresonding subdoc in db to true
            for (let j = 0; j < optionLen; j++) {
                let opId = currentField.selected[j];
                let docop = doc.opt.id(opId);
                // console.log(fieldId, doc, opId, docop);
                if (!docop) throw new BadRequest('Option not found');
                docop.selected = true;
            }
            // No of options that are selected
            let selectedCount = optionLen;
            // Check if other is selected
            if (doc.hasOther) {
                if (currentField.answer) {
                    doc.other = {
                        optionText: currentField.answer,
                        selected: true,
                    };
                    selectedCount++;
                }
            }
            if (doc.req && selectedCount <= 0)
                throw new BadRequest(
                    'A checkbox/multiple choice field is required',
                );
            if (doc.ty == C.FORM_TYPES.MULTI_CHOICE && selectedCount > 1) {
                throw new BadRequest(
                    'Multiple fields selected for Multi-choice',
                );
            }
        }
    }
    findForm.submitted = true;
    await findForm.save();
    // Create Info text message
    // Call Rt service to create
    await rtService.createInfoTextMessage({
        convoId: findForm.convoId.id,
        usecase: 'form-submit',
        // Manish > Update message string
        displayText: `${user.fullname} have submitted a response`,
        sender: user.id,
        data: {
            messageId: findForm.id,
        },
    });
    // For email notification
    const formSender = await User.findById(findForm.sd).select('n e').exec();
    let link = '';
    if (formSender.__t == C.MODELS.CLIENT_C) {
        link = `${env.CLIENT_PROFILE}/chat/view/form/${findForm.id}`;
    } else if (formSender.__t == C.MODELS.PM_C) {
        link = `${env.PM_PORTFOLIO}/chat/view/form/${findForm.id}`;
    } else if (formSender.__t == C.MODELS.WRITER_C) {
        link = `${env.CREATOR_PORTFOLIO}/chat/view/form/${findForm.id}`;
    }
    await notification.send({
        usecase: 'form-response',
        role: user.__t,
        email: {
            email: formSender.e,
            name: user.fullname,
            senderName: formSender.n.f,
            link,
        },
    });
    return {
        msg: 'Form reponse collected successfully',
    };
};

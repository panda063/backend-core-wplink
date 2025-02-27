/*
 * Module Dependencies
 */
const mongoose = require('mongoose');
const _ = require('lodash');
const moment = require('moment');
const C = require('../../lib/constants');
const env = require('../../config/env');
const jwt = require('../../lib/jwt');
const sanitizeHtml = require('sanitize-html');
const debug = require('debug')('creator');
debug.enabled = true;
const { BadRequest } = require('../../lib/errors');

/**
 * Utility functions
 */
const {
    emptyS3Directory,
    deleteMultiple,
    getObject,
} = require('../../utils/s3-operations');

/**
 * External service dependencies
 */
const { notification } = require('../../messaging/index');

// Other Controllers
const { updateStateAndPersist, deleteFilesByKey } = require('../fileStore');

/**
 * Models
 */
const PM = mongoose.model(C.MODELS.PM_C);
const Project = mongoose.model(C.MODELS.PROJECT);
const GroupConversation = mongoose.model(C.MODELS.GROUP_CONVERSATION);
const ListCard = mongoose.model(C.MODELS.LIST_CARD);
const ConversationPM = mongoose.model(C.MODELS.CONVERSATION_PM);

/**
 * * Controllers specific to PM
 */

exports.studioInvite = async ({ pm, emails }) => {
    await Promise.all(
        _.map(emails, async (e) => {
            // console.log(`${env.FRONTEND_URL}/studio/${pm.stid}`);
            const link = `${env.PM_PORTFOLIO}/${pm.stid}`;
            await notification.send({
                usecase: 'studio-invite',
                role: C.ROLES.PM_C,
                email: {
                    email: e,
                    name: pm.n.f,
                    studioName: pm.stdd.nm,
                    link: link,
                },
            });
        }),
    );
    return {
        msg: `${emails.length} invite(s) sent to join studio`,
    };
};

exports.updateStudioInfo = async ({ pm, studioInfo }) => {
    pm.studioDetails.name = studioInfo.name;
    pm.studioDetails.description = studioInfo.description;
    pm.studioDetails.availability = studioInfo.availability;
    if (studioInfo.availableFrom)
        pm.studioDetails.availableFrom = studioInfo.availableFrom;
    pm.studioDetails.creatorRequests = studioInfo.creatorRequests;
    if (studioInfo.creatorRequests)
        pm.studioDetails.creatorsAllowed = studioInfo.creatorsAllowed;
    pm.studioDetails.expertise = studioInfo.expertise;
    await pm.save();
    return { msg: 'Studio details saved' };
};

exports.updatePmInfo = async ({ pm, pmInfo }) => {
    pm.n = { first: pmInfo.firstname, last: pmInfo.lastname };
    pm.dsg = pmInfo.designation;
    await pm.save();
    return { msg: 'Pm details saved' };
};

exports.getStudioMembers = async ({ pm }) => {
    pm = await pm
        .populate({ path: 'mmb.uid', select: 'img pn n pdg' })
        .execPopulate();
    // Create a hash map of each member for fast access by memberId
    // key = memberId.user.id
    // value = memberObject
    const memberMap = new Map();
    const memberIds = _.map(pm.mmb, (member) => {
        memberMap.set(member.user.id, {
            ...member.toJSON(),
            groups: [],
            private: [],
        });
        return member.user.id.toString();
    });
    // Find Personal conversation of pm with studio members
    const personalsConvos = await ConversationPM.find({
        u1: pm.id,
        u2: { $in: memberIds },
    }).exec();
    for (let convo of personalsConvos) {
        let idToString = convo.u2.toString();
        if (memberMap.has(idToString)) {
            let toMember = memberMap.get(idToString);
            toMember.private.push({
                id: convo.id,
                conversationType: C.CONVERSATION_TYPE.INBOX,
                pendingCount: convo.p1,
                userState: convo.fu1,
                state: convo.sta,
            });
            memberMap.set(idToString, toMember);
        }
    }
    // Find groups that contain at least one studio member as participant
    const groups = await GroupConversation.find({
        own: pm.id,
        'part.usr': { $in: memberIds },
    }).exec();
    // For each group
    for (let group of groups) {
        // Find Pending count and state of conversation for PM
        let pmPendingCount, pmConversationState;
        for (let part of group.part) {
            if (part.usr == pm.id) {
                pmPendingCount = part.pc;
                pmConversationState = part.ls;
                break;
            }
        }
        // For each participant of group
        for (let part of group.part) {
            // If participant is a member of group
            // Use hashmap for O(1) search
            let idToString = part.usr.toString();
            // console.log(memberMap, idToString, typeof idToString);
            if (memberMap.has(idToString)) {
                let toMember = memberMap.get(idToString);
                toMember.groups.push({
                    name: group.n,
                    id: group.id,
                    conversationType: C.CONVERSATION_TYPE.PROJECT,
                    pendingCount: pmPendingCount,
                    userState: pmConversationState,
                });
                memberMap.set(idToString, toMember);
            }
        }
    }

    const studioMembers = [...memberMap.values()];
    return { studioMembers };
};

exports.setMemberAvailability = async ({ pm, memberId, availability }) => {
    const member = pm.mmb.id(memberId);
    if (!member) throw new BadRequest('No member with this id');
    member.avail = availability;
    await member.save();
    await pm.save();
    return { msg: 'Availability updated' };
};
exports.updateCreatorInfo = async ({
    pm,
    cid,
    badge,
    tags,
    employmentType,
}) => {
    const conversation = await ConversationPM.findOne({
        _id: cid,
        u1: pm.id,
    }).exec();
    if (!conversation) throw new BadRequest('Conversation not found');
    // Update in conversation
    if (typeof badge == 'string') conversation.minf.bdg = badge;
    if (Array.isArray(tags)) conversation.minf.tg = tags;
    if (typeof employmentType == 'string')
        conversation.minf.empl = employmentType;

    // Check if creator is member of studio and update member document
    for (let i = 0; i < pm.mmb.length; i++) {
        if (pm.mmb[i].uid == conversation.u2.toString()) {
            if (Array.isArray(tags)) pm.mmb[i].tg = tags;
            if (typeof badge == 'string') pm.mmb[i].bdg = badge;
            if (typeof employmentType == 'string')
                pm.mmb[i].empl = employmentType;
            break;
        }
    }
    await conversation.save();
    await pm.save();
    return {
        msg: 'Creator info updated',
    };
};

exports.uploadStudioImg = async ({ user, file }) => {
    // const { originalname, location } = file;
    if (!file) {
        throw new BadRequest('no file selected');
    }
    // Remove resized versions of older image
    const versions = Object.values(C.PORTFOLIO_IMAGE_VERSIONS);
    const filesToRemove = [];
    for (let vr of versions) {
        filesToRemove.push(`${user.id.toString()}/studio-${vr}.webp`);
    }
    await deleteMultiple(env.S3_BUCKET_USER_DATA, filesToRemove);
    user.stdd.img = `${
        env.S3_BUCKET_WEBSITE_URL
    }/${user.id.toString()}/studio-150x150.webp`;
    await user.save();
    return {
        originalname: file.originalname,
        location: user.stdd.img,
    };
};

exports.removeStudioImage = async ({ user }) => {
    const filesToRemove = [`${user.id.toString()}/studio`];
    const versions = Object.values(C.PORTFOLIO_IMAGE_VERSIONS);
    for (let vr of versions) {
        filesToRemove.push(`${user.id.toString()}/studio-${vr}.webp`);
    }
    await deleteMultiple(env.S3_BUCKET_USER_DATA, filesToRemove);
    user.stdd.img = '';
    await user.save();
    return {
        msg: 'image removed',
    };
};

exports.uploadStudioImgv2 = async ({ user, fileId }) => {
    // First remove older image files
    if (user.stdd.img) {
        let oldImgOriginal = user.stdd.img.replace(
            env.S3_BUCKET_WEBSITE_URL + '/',
            '',
        );
        oldImgOriginal = oldImgOriginal.replace('-150x150.webp', '');
        const filesToRemove = [];
        // This condition is checked for backwards compatibility
        // Old image path: userId/studio
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
        user.stdd.img = `${originalPath}-150x150.webp`;
    });
    await user.save();
    return {
        location: user.stdd.img,
    };
};

exports.removeStudioImagev2 = async ({ user }) => {
    // First remove older image files
    if (user.stdd.img) {
        let oldImgOriginal = user.stdd.img.replace(
            env.S3_BUCKET_WEBSITE_URL + '/',
            '',
        );
        oldImgOriginal = oldImgOriginal.replace('-150x150.webp', '');
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
        user.stdd.img = '';
        await user.save();
    }
    return {
        msg: 'image removed',
    };
};

exports.importProjectForPortfolio = async ({ pm, pid }) => {
    const project = await Project.findById(pid).exec();
    if (!project) throw new BadRequest('Project not found');
    // console.log(project.cid, pm.id);
    if (project.cid == pm.id)
        throw new BadRequest('You cannot import your own project');
    const pmMemberIds = _.map(pm.mmb, (member) => {
        return member.uid.toString();
    });
    let idx = pmMemberIds.indexOf(project.cid.toString());
    if (idx == -1) throw new BadRequest('Creator is not a member of studio');
    if (project.__t == C.MODELS.LONG_FORM && project.pblc == false)
        throw new BadRequest('This project is private');

    idx = pm.impr.indexOf(project._id);
    if (idx !== -1) throw new BadRequest('Project already imported');
    pm.impr.push(project._id);
    await pm.save();
    return {
        msg: 'Successfully imported this project',
    };
};

// Get all list cards
exports.getListCards = async ({ pm }) => {
    const query = {
        own: pm._id,
    };
    const lookup1 = {
        from: 'users',
        localField: 'usr',
        foreignField: '_id',
        as: 'user',
    };
    const lookup2 = {
        from: 'messages',
        localField: 'msg',
        foreignField: '_id',
        as: 'message',
    };
    const group1 = {
        _id: { ln: '$ln', st: '$st' },
        cards: {
            $push: {
                id: '$_id',
                position: '$pos',
                status: '$st',
                listname: '$ln',
                owner: '$own',
                user: {
                    fullname: {
                        $concat: [
                            { $arrayElemAt: ['$user.n.f', 0] },
                            ' ',
                            { $arrayElemAt: ['$user.n.l', 0] },
                        ],
                    },
                    id: { $arrayElemAt: ['$user._id', 0] },
                    __t: { $arrayElemAt: ['$user.__t', 0] },
                },
                message: {
                    convoId: { $arrayElemAt: ['$message.convoId', 0] },
                    status: { $arrayElemAt: ['$message.st', 0] },
                    dueDate: { $arrayElemAt: ['$message.dd', 0] },
                    title: { $arrayElemAt: ['$message.t', 0] },
                    invoiceName: { $arrayElemAt: ['$message.n', 0] },
                    proposalName: { $arrayElemAt: ['$message.nm', 0] },
                    id: { $arrayElemAt: ['$message._id', 0] },
                },
            },
        },
    };
    const project = {
        listname: '$_id.ln',
        status: '$_id.st',
        cards: '$cards',
        _id: 0,
    };
    const data = await ListCard.aggregate([
        { $match: query },
        { $lookup: lookup1 },
        { $lookup: lookup2 },
        { $group: group1 },
        { $project: project },
    ]);
    const result = [];
    /**
     * Sort each list with seen cards by its position
     */
    await Promise.all(
        _.map(data, async (list) => {
            if (list.status == C.LIST_CARD_STATUS.SEEN) {
                // console.log(list.cards);
                list.cards.sort((a, b) => {
                    /*  console.log(
                        a.position,
                        b.position,
                        a.position < b.position,
                    ); */
                    if (a.position < b.position) return -1;
                    else return 1;
                });
            }
            result.push(list);
        }),
    );
    return { result };
};

exports.updateListCardPosition = async ({ pm, cardId, position, status }) => {
    const card = await ListCard.findOne({
        _id: cardId,
        own: pm.id,
    }).exec();
    if (!card) throw new BadRequest('Card not found');
    if (card.status == C.LIST_CARD_STATUS.NEW && !status) {
        throw new BadRequest('Cannot update position of a new card');
    }
    if (
        card.status == C.LIST_CARD_STATUS.SEEN &&
        status == C.LIST_CARD_STATUS.NEW
    ) {
        throw new BadRequest('Cannot change seen to new');
    }
    card.pos = position;
    if (status) card.st = status;
    await card.save();
    return {
        msg: 'Position updated',
        position,
    };
};

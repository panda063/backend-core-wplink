/**
 * Dependencies
 */
const mongoose = require('mongoose');
const _ = require('lodash');
const C = require('../../lib/constants');
const jwt = require('../../lib/jwt');
const env = require('../../config/env');

/**
 * Models
 */
const GroupConversation = mongoose.model(C.MODELS.GROUP_CONVERSATION);
const ConversationClient = mongoose.model(C.MODELS.CONVERSATION_CLIENT);
const ConversationPM = mongoose.model(C.MODELS.CONVERSATION_PM);
const User = mongoose.model(C.MODELS.USER_C);
const Client = mongoose.model(C.MODELS.CLIENT_C);
const ListCard = mongoose.model(C.MODELS.LIST_CARD);

/**
 * Services
 */

const userService = require('../../services/db/user');
const {
    updateConverstionInCacheGroup,
} = require('../../services/redis/operations');

const { notification } = require('../../messaging/index');
const rtService = require('../../services/rt');

/**
 * Utility functions
 */
const { BadRequest } = require('../../lib/errors');

/**
 * Helper Functions
 */
const { createMultipleInfoTextGroup } = require('../helpers/pmHelper');
const { connectedUsers } = require('../helpers/userHelper');

// Also export this
exports.getConnectedUsers = connectedUsers;

exports.createGroupConversation = async ({ pm, data }) => {
    const { name, description, userIds } = data;

    // Verify if userIds contains valid ids that can be added to group
    const { clients, creators } = await connectedUsers({ pm });
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
    }
    // Create conversation
    // Add pm as member by default
    const newConversation = new GroupConversation({
        own: pm.id,
        n: name,
        desc: description,
        part: [{ usr: pm.id, ad: true }],
    });
    for (let userId of userIds) {
        newConversation.part.push({
            usr: userId,
        });
    }
    newConversation.hc = hasClient;
    await newConversation.save();

    // Create InfoText messages for the users added to group
    await createMultipleInfoTextGroup({
        convoId: newConversation.id,
        usecase: 'new-member',
        senders: memberIds,
        userIds,
        ownerId: pm.id,
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

// Returns details of clients/creators with whom Pm has worked with
// These users can be added to a group by creator
exports.findMembersForGroup = async ({ pm }) => {
    const { clients, creators } = await connectedUsers({ pm });
    return { clients, creators };
};

exports.addGroupParticipants = async ({ pm, gid, userIds }) => {
    // Fetch group
    const groupConvo = await GroupConversation.findOne({
        own: pm.id,
        _id: gid,
    }).exec();
    if (!groupConvo) throw new BadRequest('Group not found');

    // Verify if userIds contains valid ids that can be added to group
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
    });
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
        };
        if (clientMap.has(uid)) {
            forRes.user = clientMap.get(uid);
        }
        if (creatorMap.has(uid)) {
            forRes.user = creatorMap.get(uid);
        }
        forRes.badge = C.STUDIO_MEMBER_BADGES.BRONZE;
        participants.push(forRes);
    }
    await groupConvo.save();
    // Create InfoText messages for the users added to group
    await createMultipleInfoTextGroup({
        convoId: groupConvo.id,
        usecase: 'new-member',
        senders: new Map([...creatorMap, ...clientMap]),
        userIds,
        ownerId: pm.id,
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

exports.addOffPlatformUser = async ({ pm, gid, data }) => {
    const { email, firstName, lastName, memberType, admin } = data;
    const group = await GroupConversation.findOne({
        _id: gid,
        own: pm.id,
    }).exec();
    if (!group) throw new BadRequest('Group not found');
    const user = await userService.getUserByEmail({ email });
    if (user) {
        if (user.__t !== C.MODELS.GU_C)
            throw new BadRequest('User exists on platform');
        let groupMembers = _.map(group.part, (member) => {
            return member.usr.toString();
        });
        if (groupMembers.includes(user.id))
            throw new BadRequest('User is already a member of group');
    }
    const tokenData = {
        email,
        firstName,
        lastName,
        memberType,
        admin,
        gid,
        uc: 'add-to-group',
    };
    const token = await jwt.generateToken({
        data: tokenData,
        expiresIn: C.GA_USER_TOKEN,
    });
    // Send Email
    let link = `${env.FRONTEND_URL}/spec-signup/${token}`;
    await notification.send({
        usecase: 'add-to-group',
        role: C.ROLES.PM_C,
        email: {
            email,
            name: `${firstName}`,
            pmName: pm.n.f,
            groupName: group.name,
            link,
        },
    });
    return {
        token,
    };
};

// Create List card
// Controller of an Internal endpoint
exports.createListCard = async ({ listname, owner, user, message }) => {
    let newListCard = new ListCard({
        listname,
        owner,
        user,
        message,
    });
    await newListCard.save();
    newListCard = newListCard.toJSON();
    return {
        msg: 'Card created successfully',
        ...newListCard,
    };
};

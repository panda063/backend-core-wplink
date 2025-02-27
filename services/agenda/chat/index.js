const mongoose = require('mongoose');
const C = require('../../../lib/constants');
const env = require('../../../config/env');
const { notification } = require('../../../messaging');
const ConversationClient = mongoose.model(C.MODELS.CONVERSATION_CLIENT);
const ProposalM = mongoose.model(C.MODELS.PROPOSAL_M);
const Brief = mongoose.model(C.MODELS.BRIEF);
const User = mongoose.model(C.MODELS.USER_C);

exports.expire_invite_30_day = async ({ conversationId }) => {
    // Update brief state from sent to proposal_sent
    const findBrief = await Brief.findOneAndUpdate(
        {
            convoId: conversationId,
        },
        {
            $set: {
                st: C.BRIEF_STATES.DECLINED,
            },
        },
    ).exec();
    const expiredConversation = await ConversationClient.findByIdAndUpdate(
        conversationId,
        {
            sta: C.CONVERSATION_STATE.DECLINED,
        },
    ).exec();
    if (!expiredConversation) throw new Error('Invalid Conversation ID');
};

exports.proposal_14_day = async ({ conversationId, proposalId }) => {
    const expiredProposal = await ProposalM.findOneAndUpdate(
        {
            _id: proposalId,
            convoId: conversationId,
        },
        {
            st: C.PROPOSAL_STATES.EXPIRED,
        },
    ).exec();
    if (!expiredProposal) throw new Error('Invalid Proposal');
};

exports.post_job_outside = async ({ pmName, email }) => {
    await notification.send({
        usecase: 'post_job_outside',
        role: C.MODELS.PM_C,
        email: {
            email,
            pmName,
            link: `${env.PM_PORTFOLIO}/jobs/my-jobs`,
        },
    });
};

function domainFromRole(role) {
    const chatPath = '/chat/inbox';
    if (role == C.MODELS.WRITER_C) {
        return `${env.CREATOR_PORTFOLIO}${chatPath}`;
    } else if (role == C.MODELS.CLIENT_C) {
        return `${env.CLIENT_PROFILE}${chatPath}`;
    } else if (role == C.MODELS.EXT_CLIENT) {
        return `${env.EXT_CLIENT_PROFILE}${chatPath}`;
    } else return env.FRONTEND_URL;
}

exports.messageReminder = async ({ senderName, userId, sendText }) => {
    const receiver = await User.findById(userId).select('e n').exec();

    await notification.send({
        usecase: 'message-reminder',
        role: C.ROLES.WRITER_C,
        email: {
            email: receiver.email,
            name: receiver.fullname,
            senderName,
            sendText,
            link: `${domainFromRole(receiver.__t)}`,
        },
    });
};

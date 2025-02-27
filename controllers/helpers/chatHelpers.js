const C = require('../../lib/constants');
const mongoose = require('mongoose');
const { BadRequest } = require('../../lib/errors');

const ConversationCreator = mongoose.model(C.MODELS.CONVERSATION_CREATOR);

// ConversationCreator
exports.createConversationCreator = async ({ u1, u2 }) => {
    if (u1 == u2)
        throw new BadRequest('You cannot create a conversation with yourself');
    let findConversation = await ConversationCreator.findOne({
        $or: [
            { u1: u1, u2: u2 },
            { u1: u2, u2: u1 },
        ],
    }).exec();
    if (!findConversation) {
        findConversation = new ConversationCreator({
            u1,
            u2,
            st: C.CONVERSATION_STATUS.CREATED,
        });
    }
    return findConversation;
};

const Conversation = require('../../../models/chat/conversation');
const listService = require('./conversationList');
const mongoose = require('mongoose');

const findOneOrCreate = async ({ u1, u2, role }) => {
	let isNew = false;
	let convo = await Conversation.findOne({ u1: u1, u2: u2 });
	if (!convo && role === 'Writer') {
		return {
			error: "Writer can't initiate conversation",
			conId: null,
			isNew: null,
		};
	}
	if (!convo) {
		isNew = true;
		convo = await Conversation.create({ u1: u1, u2: u2 });
	}
	return { conId: convo._id, isNew };
};

const findConversationId = async (user1, user2, role) => {
	console.log('Find Conversation Id');
	const { conId, isNew, error } = await findOneOrCreate({
		u1: user1,
		u2: user2,
		role,
	});
	if (error) {
		return { error };
	}
	if (!conId) {
		// if not registered then do some action
		console.log("Can't Find Convorsation id");
	} else if (isNew && conId) {
		console.log('New Conversation Started Need to add into Conversation List');

		await listService.updateConvorsationList(user1, user2, conId);
	}
	return { conId, isNew };
};

const addPendingToConversation = async (
	conversationId,
	sender,
	receiver,
	messageId
) => {
	const u1 = sender > receiver ? sender : receiver;
	const u2 = sender < receiver ? sender : receiver;
	console.log(mongoose.Types.ObjectId.isValid(messageId));
	const update =
		// p1: u1 === sender ? [] : { $push: { message: messageId } },
		u2 === sender
			? { p2: [], $push: { p1: { messages: messageId } } }
			: { p1: [], $push: { p2: { messages: messageId } } };
	await Conversation.findOneAndUpdate({ _id: conversationId }, update);
};

const clearPending = async (conversationId, sender, receiver) => {
	// const u1 = sender > receiver ? sender : receiver;
	const u2 = sender < receiver ? sender : receiver;
	const update = u2 === sender ? { p2: [] } : { p1: [] };
	return await Conversation.findOneAndUpdate({ _id: conversationId }, update);
};

module.exports = { findConversationId, addPendingToConversation, clearPending };

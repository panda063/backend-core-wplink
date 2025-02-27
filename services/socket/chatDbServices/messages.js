const Messages = require('../../../models/chat/messages');
const { Types } = require('mongoose');

const addMessagetoDB = async (conversationId, senderId, messageText) => {
	// console.log('Sending Message', conversationId);
	const added = await Messages.create({
		cid: conversationId,
		sid: senderId,
		mt: messageText,
	});
	if (!added) {
		// if not registered then do some action
		console.log("Can't Add Message", registered);
		return false;
	}
	return added;
};

const getPreviousMessages = async (page, convoId) => {
	const size = 20;
	const skipNum = size * (page && page !== 0 ? page : 1 - 1);

	const messageList = await Messages.find({ cid: convoId })
		//   .select('tl p')
		.sort({ createdAt: -1 })
		.skip(skipNum)
		.limit(size)
		.exec();

	console.log(convoId, 'has', messageList.length, 'messages', messageList);
	return messageList;
};

const getMultiplePreviousMessages = async (convoIds) => {
	const size = 20;
	const skipNum = size * (1 - 1);
	// const skipNum = size * (page - 1);
	console.log(convoIds);
	const messageList = await Promise.all(
		convoIds.map((id) =>
			Messages.find({ cid: id }).sort({ createdAt: -1 }).limit(20)
		)
	);
	const editedMessageList = {};
	for (const msgs in messageList) {
		editedMessageList[convoIds[msgs]] = messageList[msgs];
	}
	// console.log('editedMessageList', editedMessageList);
	return editedMessageList;
};

module.exports = {
	addMessagetoDB,
	getPreviousMessages,
	getMultiplePreviousMessages,
};

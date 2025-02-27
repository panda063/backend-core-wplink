const ConvorsationList = require('../../../models/chat/conversationList');

const updateConvorsationList = async (user1, user2, convoId) => {
	var conditions1 = {
		uid: user1,
	};

	var update1 = {
		$addToSet: { c: { cid: convoId } },
	};
	const updatedU1 = await ConvorsationList.findOneAndUpdate(
		conditions1,
		update1
	);
	if (!updatedU1) {
		console.log('List not found');
		await ConvorsationList.create({
			uid: user1,
			c: [{ cid: convoId }],
		});
	}

	// second user

	var conditions2 = {
		uid: user2,
	};

	var update2 = {
		$addToSet: { c: { cid: convoId } },
	};
	const updatedU2 = await ConvorsationList.findOneAndUpdate(
		conditions2,
		update2
	);
	if (!updatedU2) {
		console.log('List not found');
		await ConvorsationList.create({
			uid: user2,
			c: [{ cid: convoId }],
		});
	}
};

const createNewConversationList = async (userId) => {
	let newConvoList = await ConvorsationList.create({
		uid: userId,
		c: [],
	});
	return newConvoList;
};

const getConversationList = async (userId) => {
	let convoList = await ConvorsationList.findOne({ uid: userId }).populate([
		{ path: 'uid', model: 'User', select: 'id n' },
		{
			path: 'c.cid',
			populate: [
				{
					path: 'u1',
					model: 'User',
					select: 'id img n',
				},
				{
					path: 'u2',
					model: 'User',
					select: 'id img n',
				},
				{
					path: 'p1.messages',
					model: 'Messages',
					// select: 'id n',
				},
				{
					path: 'p2.messages',
					model: 'Messages',
					// select: 'id n',
				},
			],
			select: 'u1 u2',
		},
	]);
	// console.log(convoList);
	if (convoList) {
		convoList = convoList.toJSON();
		convoList.default = convoList.conversations;
		let totalPending = 0;
		const editedConversations = convoList.conversations.map((cn) => {
			totalPending +=
				convoList.userId.id == cn.cid.user1.id
					? cn.cid.pendingMessageUser1.length || 0
					: cn.cid.pendingMessageUser2.length || 0;
			return {
				id: cn.cid.id,
				user:
					convoList.userId.id == cn.cid.user1.id ? cn.cid.user2 : cn.cid.user1,
				pending:
					convoList.userId.id == cn.cid.user1.id
						? cn.cid.pendingMessageUser1.length || 0
						: cn.cid.pendingMessageUser2.length || 0,
				lastMessage:
					convoList.userId.id == cn.cid.user1.id
						? cn.cid.pendingMessageUser1[
								cn.cid.pendingMessageUser1.length - 1
						  ] || null
						: cn.cid.pendingMessageUser2[
								cn.cid.pendingMessageUser2.length - 1
						  ] || null,
			};
		});
		convoList.conversations = editedConversations;
		convoList.totalPending = totalPending;
	} else {
		console.log('No Conversation List Found For This User', 'Create New One');
		convoList = createNewConversationList(userId);
	}
	// console.log('ConvoList', convoList);
	return convoList;
};

module.exports = { updateConvorsationList, getConversationList };

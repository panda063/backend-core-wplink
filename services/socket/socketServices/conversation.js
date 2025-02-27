const conversationListService = require('../chatDbServices/conversationList');
const convorsationService = require('../chatDbServices/conversation');
const { SOCKET_TYPES } = require('../chatDbServices/eventTypes');

const getConversationList = (userId) => {
	return async ({}, callbackFunction) => {
		console.log('[CONVERSATION_LIST_EVENT]');
		const list = await conversationListService.getConversationList(userId);
		callbackFunction(list);
	};
};

const clearPendingConversation = (userId, role) => {
	return async ({ conversationId, secondUserId }, clearPendingCallback) => {
		console.log('[CLEAR_PENDING_EVENT]');
		const {
			conId: serverConversationId,
			isNew: isNewConversationCreated,
			error: errorClearPending,
		} = await convorsationService.findConversationId(
			userId > secondUserId ? userId : secondUserId,
			userId < secondUserId ? userId : secondUserId,
			role
		);
		if (errorClearPending) {
			clearPendingCallback(errorClearPending);
			socket.emit(SOCKET_TYPES.ERROR, { error: errorClearPending });
			return;
		}
		const isCleared = await convorsationService.clearPending(
			serverConversationId,
			userId,
			secondUserId
		);
		clearPendingCallback(null, !!isCleared);
	};
};

module.exports = {
	getConversationList,
	clearPendingConversation,
};

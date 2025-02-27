const conversationListService = require('../chatDbServices/conversationList');
const convorsationService = require('../chatDbServices/conversation');
const activeUserService = require('../chatDbServices/activeUser');
const messageService = require('../chatDbServices/messages');
const mongoose = require('mongoose');
const { SOCKET_TYPES } = require('../chatDbServices/eventTypes');

const getPreviousMessages = (userId, role) => {
	return async ({ secondUserId, page }, callBack) => {
		console.log('[PREVIOUS_MESSAGES_EVENT]');
		const {
			conId: serverConversationId,
			isNew: isNewConversationCreated,
			error: errorPreviousMessage,
		} = await convorsationService.findConversationId(
			userId > secondUserId ? userId : secondUserId,
			userId < secondUserId ? userId : secondUserId,
			role
		);
		// console.log(serverConversationId);
		// If error occur
		if (errorPreviousMessage) {
			callBack(errorPreviousMessage);
			socket.emit(SOCKET_TYPES.ERROR, { error: errorPreviousMessage });
			return;
		}
		if (isNewConversationCreated) {
			console.log('New Conversation Started So Return []');
			return callBack(null, []);
		}
		const fetchedMessages = await messageService.getPreviousMessages(
			page,
			serverConversationId
		);
		// console.log('fetchCallBack');
		callBack(null, fetchedMessages);
	};
};

const getMultiplePreviousMessage = () => {
	return async ({ conversationIds, page }, callBack) => {
		console.log('[MULTIPLE_PREVIOUS_MESSAGES_EVENT] PREVIOUS MESSAGE');
		const fetchedMessages = await messageService.getMultiplePreviousMessages(
			conversationIds
		);
		console.log('fetchCallBack');
		callBack(fetchedMessages);
	};
};

const sendMessageToNewPerson = (userId, role, criteria, socket, io) => {
	return async (
		{ newReceiver, messageText, messageLocalIdOnUserSide },
		serverReceivedCallback
	) => {
		console.log('[SEND_MESSAGE_TO_NEW_USER_EVENT]');
		if (!mongoose.Types.ObjectId.isValid(newReceiver)) {
			// some action
			console.log('Receiver id is not valid');
			newUserMessageCallback('Receiver Id Invalid');
		}
		if (messageText === '') {
			serverReceivedCallback('EMPTY_MESSAGE');
			return;
		}

		const {
			conId: serverConversationIdForNewUser,
			isNew,
			error: errorSendMessageToNewUser,
		} = await convorsationService.findConversationId(
			userId > newReceiver ? userId : newReceiver,
			userId < newReceiver ? userId : newReceiver,
			role
		);
		if (errorSendMessageToNewUser) {
			serverReceivedCallback(errorSendMessageToNewUser);
			socket.emit(SOCKET_TYPES.ERROR, { error: errorSendMessageToNewUser });
			return;
		}
		const addedMessageForNew = await messageService.addMessagetoDB(
			serverConversationIdForNewUser,
			userId,
			messageText
		);

		if (addedMessageForNew) {
			serverReceivedCallback(null, messageLocalIdOnUserSide, {
				...addedMessageForNew.toJSON(),
				newReceiverId: newReceiver,
			});
		}
		const receiverDataForNew = await activeUserService.isUserActive(
			newReceiver
		);
		if (receiverDataForNew) {
			if (io.sockets.sockets[receiverDataForNew.si] != undefined) {
				// SocketId Found in Active User is connected to server
				const nameOfSender =
					criteria.userDetails.n.f + ' ' + criteria.userDetails.n.l;
				// send to receiver socket
				io.sockets.sockets[receiverDataForNew.si].emit(
					SOCKET_TYPES.RECEIVE_MESSAGE_EVENT,
					{
						...addedMessageForNew.toJSON(),
						userName: nameOfSender,
						newReceiverId: newReceiver,
					},
					async (shouldAddToPending) => {
						if (shouldAddToPending) {
							await convorsationService.addPendingToConversation(
								serverConversationIdForNewUser,
								userId,
								newReceiver,
								addedMessageForNew._id
							);
						}
					}
				);
			} else {
				// SocketId Found in Active User is NOT connected to server
				await convorsationService.addPendingToConversation(
					serverConversationIdForNewUser,
					userId,
					newReceiver,
					addedMessageForNew._id
				);
				// REMOVE false data about active user
				console.log('Remove False Active User');
				await activeUserService.removeActiveUser(receiverDataForNew.uid);
			}
		} else {
			// add to pending
			await convorsationService.addPendingToConversation(
				serverConversationIdForNewUser,
				userId,
				newReceiver,
				addedMessageForNew._id
			);
		}
	};
};

const sendMessage = (userId, role, io) => {
	return async (
		{ messageText, receiver, messageLocalIdOnUserSide },
		serverReceivedCallback
	) => {
		console.log('[SEND_MESSAGE_EVENT]');
		if (!mongoose.Types.ObjectId.isValid(receiver)) {
			// some action
			console.log('Receiver id is not valid');
			serverReceivedCallback('INVALID_DATA');
		}
		if (messageText === '') {
			serverReceivedCallback('EMPTY_DATA');
			return;
		}

		const {
			conId: serverConversationId,
			isNew,
			error: errorSendMessage,
		} = await convorsationService.findConversationId(
			userId > receiver ? userId : receiver,
			userId < receiver ? userId : receiver,
			role
		);
		if (errorSendMessage) {
			serverReceivedCallback(errorSendMessage);
			socket.emit(SOCKET_TYPES.ERROR, { error: errorSendMessage });
			return;
		}
		const addedMessage = await messageService.addMessagetoDB(
			serverConversationId,
			userId,
			messageText
		);

		if (addedMessage) {
			serverReceivedCallback(null, messageLocalIdOnUserSide, addedMessage);
		}
		const receiverData = await activeUserService.isUserActive(receiver);
		if (receiverData) {
			// console.log('Socket Id to send data', receiverData.si);
			// io.to(receiverData.si).emit(
			// 	SOCKET_TYPES.RECEIVE_MESSAGE_EVENT,
			// 	addedMessage
			// );
			if (io.sockets.sockets[receiverData.si] != undefined) {
				// SocketId Found in Active User is connected to server
				console.log('Socket Id to send data', receiverData.si);
				// send to receiver socket
				io.sockets.sockets[receiverData.si].emit(
					SOCKET_TYPES.RECEIVE_MESSAGE_EVENT,
					addedMessage,
					async (shouldAddToPending) => {
						if (shouldAddToPending) {
							await convorsationService.addPendingToConversation(
								serverConversationId,
								userId,
								receiver,
								addedMessage._id
							);
						}
					}
				);
			} else {
				// SocketId Found in Active User is NOT connected to server
				await convorsationService.addPendingToConversation(
					serverConversationId,
					userId,
					receiver,
					addedMessage._id
				);
				// REMOVE false data about active user
				console.log('Remove False Active User');
				await activeUserService.removeActiveUser(receiverData._id);
			}
		} else {
			// add to pending
			await convorsationService.addPendingToConversation(
				serverConversationId,
				userId,
				receiver,
				addedMessage._id
			);
		}
	};
};

module.exports = {
	getPreviousMessages,
	getMultiplePreviousMessage,
	sendMessageToNewPerson,
	sendMessage,
};

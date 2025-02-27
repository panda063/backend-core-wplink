/**
 * ! Deprecation notice
 * ! Socket service is now separate microservice
 */

const jwt = require('jsonwebtoken');
const env = require('../../config/env');
const C = require('../../lib/constants');
const userController = require('../../controllers/user');
const activeUserService = require('./chatDbServices/activeUser');
const { SOCKET_TYPES } = require('./chatDbServices/eventTypes');

const socketConversationService = require('./socketServices/conversation');
const socketMessageService = require('./socketServices/messages');
const socketUserService = require('./socketServices/userInformation');

var sockets = {};

sockets.init = function (server) {
    // socket.io setup
    console.log('Socket Path:', env.SOCKET_PATH);
    const socketIO = require('socket.io');
    // let io = socketIO(server, { path: '/api/socket.io' });
    let io = socketIO(server, { path: env.SOCKET_PATH });
    // io.use(
    // 	socketioJwt.authorize({
    // 		secret: process.env.JWT_SECRET,
    // 		handshake: true,
    // 		// auth_header_required: true,
    // 	})
    // );
    io.use((socket, next) => {
        if (socket.handshake.query && socket.handshake.query.token) {
            jwt.verify(
                socket.handshake.query.token,
                process.env.JWT_SECRET,
                (err, decoded) => {
                    if (err) return next(new Error('Invalid token'));
                    socket.decoded_token = decoded;
                    next();
                },
            );
        } else {
            next(new Error('Token Required'));
        }
    });
    io.on('connection', async function (socket) {
        const { id: socketId } = socket;
        const { id: userId, role } = socket.decoded_token.data;
        console.log('*****************');
        const criteria = { id: userId, role: role };
        try {
            const user = await userController.getUser(criteria);
            let invalidAccountStatus = [
                C.ACCOUNT_STATUS.BAN,
                C.ACCOUNT_STATUS.INACTIVE,
            ];

            // Restrict socket connections from banned/inactive users
            if (invalidAccountStatus.includes(user.acst)) {
                throw new Error('INACTIVE_OR_BANNED');
            }
            criteria['userDetails'] = user;
        } catch (err) {
            socket.emit('no_user_found / banned user', {
                code: 'invalid_user',
            });
            socket.disconnect(true);
            return;
        }

        await activeUserService.registerActiveUser(userId, socketId);

        // Get User Info
        // Pass Id to get UserInfo
        // If Client want his own info then pass null to userIdFromClient
        socket.on(
            SOCKET_TYPES.GET_USER_INFO_EVENT,
            socketUserService.getUserInformation(userId),
        );

        // GET CONVERSATION LIST
        socket.on(
            SOCKET_TYPES.CONVERSATION_LIST_EVENT,
            socketConversationService.getConversationList(userId),
        );

        // CLEAR CONVERSATION
        socket.on(
            SOCKET_TYPES.CLEAR_PENDING_EVENT,
            socketConversationService.clearPendingConversation(userId, role),
        );

        // GET PREVIOUS MESSAGE
        socket.on(
            SOCKET_TYPES.PREVIOUS_MESSAGES_EVENT,
            socketMessageService.getPreviousMessages(userId, role),
        );

        // Search User
        socket.on(
            SOCKET_TYPES.SEARCH_PERSON_EVENT,
            socketUserService.searchUser(),
        );

        socket.on(
            SOCKET_TYPES.MULTIPLE_PREVIOUS_MESSAGES_EVENT,
            socketMessageService.getMultiplePreviousMessage(),
        );

        // SEND MESSAGE TO NEW PERSON
        socket.on(
            SOCKET_TYPES.SEND_MESSAGE_TO_NEW_USER_EVENT,
            socketMessageService.sendMessageToNewPerson(
                userId,
                role,
                criteria,
                socket,
                io,
            ),
        );

        // SEND MESSAGE TO ANOTHER PERSON
        socket.on(
            SOCKET_TYPES.SEND_MESSAGE_EVENT,
            socketMessageService.sendMessage(userId, role, io),
        );

        socket.on('connect_error', () => {
            console.log(
                'User Errorr',
                socket.handshake.query.requestedUid,
                socket.id,
            );
        });

        socket.on('disconnect', async function () {
            console.log('User disconnect', userId, socket.id);
            await activeUserService.removeActiveUser(userId);
        });
    });
    return io;
};

module.exports = sockets;

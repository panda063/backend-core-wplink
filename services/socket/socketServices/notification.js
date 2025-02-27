const mongoose = require('mongoose');
const activeUserService = require('../chatDbServices/activeUser');
const { SOCKET_TYPES } = require('../chatDbServices/eventTypes');

const sendNotif = async ({ forD, byD, axn, msg }, io) => {
    const receiver = await activeUserService.isUserActive(forD.id);
    if (receiver) {
        if (io.sockets.sockets[receiver.si] != undefined) {
            io.sockets.sockets[receiver.si].emit('sendNotif', {
                byD,
                axn,
                msg,
            });
        } else {
            await activeUserService.removeActiveUser(receiver.uid);
        }
    }
};
module.exports = {
    sendNotif,
};

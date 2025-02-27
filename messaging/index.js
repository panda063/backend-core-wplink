const notificationQ = require('./notification');
module.exports = {
    // createNotification: notificationQ.createNotification,
    notif: notificationQ.push,
    notification: { send: notificationQ.send },
};

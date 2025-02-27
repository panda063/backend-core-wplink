const ActiveUser = require('../../../models/chat/active');

const registerActiveUser = async (userId, socketId) => {
    const registered = await ActiveUser.findOneAndUpdate(
        { uid: userId },
        {
            uid: userId,
            si: socketId,
        },
        { new: true, upsert: true }
    );
    console.log('Register Active User', registered.uid);
    if (!registered) {
        // if not registered then do some action
        console.log("Can't Register Active User", registered);
    }
};

const isUserActive = async (userId) => {
    const isActive = await ActiveUser.findOne({ uid: userId });
    if (!isActive) {
        console.log('Active user Not Found');
    }
    return isActive;
};

const removeActiveUser = async (userId) => {
    console.log('Removing Active User');
    const removed = await ActiveUser.findOneAndRemove({ uid: userId });
    if (!removed) {
        // some action
        console.log('Not removed', userId);
    }
};
module.exports = { registerActiveUser, removeActiveUser, isUserActive };

const mongoose = require('mongoose');
const env = require('../../config/env');
const C = require('../../lib/constants');
const { BadRequest } = require('../../lib/errors');

const GroupConversation = mongoose.model(C.MODELS.GROUP_CONVERSATION);

const attachGroupConversationForAdmin = async (req, res, next) => {
    try {
        const group = await GroupConversation.findOne({
            _id: req.params.gid,
            // own: req.user.id,
            part: { $elemMatch: { usr: req.user.id, ad: true } },
        }).exec();
        if (!group) throw new BadRequest('Group not found');
        req.group = group;
        return next();
    } catch (err) {
        return next(err);
    }
};

module.exports = { attachGroupConversationForAdmin };

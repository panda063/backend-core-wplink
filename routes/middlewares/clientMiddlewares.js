const { isCelebrate } = require('celebrate');
const C = require('../../lib/constants');
const env = require('../../config/env');
const {
    emptyS3Directory,
    deleteMultiple,
} = require('../../utils/s3-operations');
const {
    BadRequest,
    InternalServerError,
    ForbiddenRequest,
} = require('../../lib/errors');

const mongoose = require('mongoose');

const Brief = mongoose.model(C.MODELS.BRIEF);
const ConversationClient = mongoose.model(C.MODELS.CONVERSATION_CLIENT);

const attachConversation = async (req, res, next) => {
    /**
     * If there is an existing Conversation with status: INIT use it otherwise create a new one
     * status: INIT conversation denotes that client tried to upload files before
     * INIT conversation are used internally to upload briefs/refs and generate path in s3 bucket and are not shown to user in any way
     * Once invite is sent status of conversation is CREATED
     */
    try {
        let findConversationOrCreate = await ConversationClient.findOne({
            u1: req.user._id,
            u2: req.params.cid,
            st: {
                $in: [
                    C.CONVERSATION_STATUS.INIT,
                    C.CONVERSATION_STATUS.CREATED,
                ],
            },
        }).exec();
        if (!findConversationOrCreate) {
            findConversationOrCreate = new ConversationClient({
                u1: req.user._id,
                u2: req.params.cid,
                st: C.CONVERSATION_STATUS.INIT,
            });
            await findConversationOrCreate.save();
        } else {
            if (
                findConversationOrCreate.status == C.CONVERSATION_STATUS.CREATED
            )
                throw new BadRequest('Creator already invited');
        }
        req.conversation = findConversationOrCreate;
        return next();
    } catch (error) {
        return next(error);
    }
};

/**
 * Remove uploaded file when there is an error
 */
const attachConversationErrorHandler = async (err, req, res, next) => {
    if (err) {
        if (Array.isArray(req.files) && req.files.length > 0) {
            const files = [req.files[0].key];
            await deleteMultiple(env.S3_BUCKET_USER_DATA, files);
        }
        return next(err);
    }
    return next();
};
module.exports = { attachConversation, attachConversationErrorHandler };

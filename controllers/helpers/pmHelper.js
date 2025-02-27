// Dependencies

const C = require('../../lib/constants');
const agenda = require('../../services/agenda');
const _ = require('lodash');
const mongoose = require('mongoose');
const moment = require('moment');
const axios = require('axios');
const { BadRequest } = require('../../lib/errors');

// Models

const GroupConversation = mongoose.model(C.MODELS.GROUP_CONVERSATION);
const InfoTexts = mongoose.model(C.MODELS.GROUP_INFO_TEXT);

exports.createMultipleInfoTextGroup = async ({
    convoId,
    usecase,
    senders,
    userIds,
    ownerId,
}) => {
    const infoTexts = [];
    userIds.forEach((userId) => {
        infoTexts.push({
            convoId,
            usecase,
            dtxt: `${senders.get(userId).fullname} added to group`,
            d: {},
            sd: ownerId,
        });
    });
    const createdInfoTexts = await InfoTexts.create(infoTexts);
};

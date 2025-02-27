/**
 * Dependencies
 */

const axios = require('axios');
const env = require('../config/env');
const logger = require('../lib/logger');

/**
 * Call APIs of the Real time service
 */
exports.createInfoTextMessage = async ({
    convoId,
    displayText,
    usecase,
    data,
    sender,
}) => {
    try {
        await axios.post(`${env.RT_SERVICE_URL}/info-text-message`, {
            convoId,
            usecase,
            displayText,
            data,
            sender,
        });
    } catch (err) {
        // console.log(err);
        logger.error(new Error('Error in creating infoText message'));
    }
};

exports.sendNewConversation = async (data) => {
    try {
        await axios.post(`${env.RT_SERVICE_URL}/send-new-conversation`, {
            ...data,
        });
    } catch (err) {
        logger.error(new Error('New conversation not sent'));
    }
};
exports.sendNewMessage = async (data) => {
    try {
        console.log(data);
        await axios.post(`${env.RT_SERVICE_URL}/send-new-message`, {
            ...data,
        });
    } catch (err) {
        logger.error(new Error('New message was not sent'));
    }
};

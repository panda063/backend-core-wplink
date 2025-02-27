const axios = require('axios');
const { WP_QUEUE_NOTIF_PRODUCER_URL } = require('../config/env/index');

const mongoose = require('mongoose');
const C = require('../lib/constants');
const { blockedemail } = require('./blockedemail');
const Notification = mongoose.model(C.MODELS.NOTIFICATION_C);

// ! Socket service is now a separate microservice
/*
const socket = require('../services/socket/socket');
const socketNotificationService = require('../services/socket/socketServices/notification');
/*
// ! Use Queue Service
const createNotification = async ({ forD, byD, axn, msg }) => {
    const notifBody = { for: forD, by: byD, axn, msg };
    if (axn.axnn === 'View new Applications') {
        let result = await Notification.deleteOne({
            'for.id': forD.id,
            'for.role': forD.role,
            axnn: axn.axnn,
            axnv: axn.axnv,
        });
        console.log(result);
    }

    const notif = await Notification.createOne(notifBody);
    await socketNotificationService.sendNotif(
        { forD, byD, axn, msg },
        socket.io
    );
    return notif;
};
*/

const push = async (data) => {
    try {
        await axios.post(WP_QUEUE_NOTIF_PRODUCER_URL, {
            ...data,
            timeStamp: Date.now(),
        });
    } catch (err) {
        console.log('ERROR: QUEUE SERVICE IS NOT UP');
    }
};

/**
 * @param role string
 * @param usecase string
 * @param web object
 * @param email object
 */
const send = async ({ role, usecase, web, email, sms }) => {
    // Excluded Emails
    // console.log(email.email);
    if (email && email.email && blockedemail.includes(email.email)) {
        // console.log(email.email);
        return;
    }
    /**
     * Each type is sent as a separate event
     * This makes sure that only failed events are retried
     */
    const splitIntoTypes = [];
    if (web) {
        splitIntoTypes.push(
            await push({
                role,
                usecase,
                web,
            }),
        );
    }
    if (email) {
        splitIntoTypes.push(
            await push({
                role,
                usecase,
                email,
            }),
        );
    }
    if (sms) {
        splitIntoTypes.push(
            await push({
                role,
                usecase,
                sms,
            }),
        );
    }
    await Promise.all(splitIntoTypes);
};

module.exports = { push, send };

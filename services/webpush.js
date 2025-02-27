const webpush = require('web-push');

const { vapidPublicKey, vapidPrivateKey } = require('../config/webpush');

exports.pushWebNotification = async ({ payload, webpushUser }) => {
    let options = {
        vapidDetails: {
            subject: 'mailto:contact@passionbits.io',
            publicKey: vapidPublicKey,
            privateKey: vapidPrivateKey,
        },
        TTL: 60,
    };
    // console.log(pushSubscription, payload, options, typeof payload);
    // console.log(pushSubscription, payload, options);
    for (let subs of webpushUser) {
        try {
            let asJson = subs.toJSON();
            // console.log(asJson);
            const pushSubscription = {
                endpoint: asJson.endpoint,
                expirationTime: asJson.expirationTime,
                keys: {
                    p256dh: asJson.p256dh,
                    auth: asJson.auth,
                },
            };
            const response = await webpush.sendNotification(
                pushSubscription,
                payload,
                options,
            );
        } catch (err) {}
    }
};

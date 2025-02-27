const axios = require('axios');
const env = require('../config/env');

exports.pushCalculateScoreEvent = async (data) => {
    try {
        await axios.post(env.WP_QUEUE_FEED_PRODUCER_URL, {
            ...data,
            timeStamp: Date.now(),
        });
    } catch (err) {
        console.log('ERROR: QUEUE SERVICE IS NOT UP');
    }
};

exports.getScoreFromInput = async (data) => {
    try {
        const response = await axios.post(
            'http://localhost:4200/score/collab-feed',
            {
                ...data,
                timeStamp: Date.now(),
            },
        );
        return response.data;
    } catch (err) {
        console.log('ERROR: GETTING SCORES');
        throw new Error(err);
    }
};

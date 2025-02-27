const redisService = require('./redisService');

const logger = require('../../lib/logger');
const moment = require('moment');

const {
    fetchAndSetUserStat,
    fetchAndSetServiceStat,
} = require('../../controllers/helpers/analyticsHelpers');

/**
 * Update conversation in cache if any value(ex. lmd and p1/p2) is changed for DB
 * conversation key = chat:private:convoId
 */
exports.updateConverstionInCache = async ({ conversation }) => {
    const key = `chat:private:${conversation.id}`;
    // Set key value
    const asObj = conversation.toObject();
    redisService.set(key, JSON.stringify(asObj));
};

/**
 * Update conversation in cache if any value is changed for DB
 * conversation key = chat:group:convoId
 */
exports.updateConverstionInCacheGroup = async ({ conversation }) => {
    const key = `chat:group:${conversation.id}`;
    // Set key value
    const asObj = conversation.toObject();
    redisService.set(key, JSON.stringify(asObj));
};

exports.getCreatorStats = async ({ id }) => {
    const key = `creator:stats:${id}`;

    // If not connected -> return default
    const defaultObj = {
        acceptRate: 'Low',
        acceptRatePercent: 0,
        totalActiveCollabs: 0,
        activityPercent: 0,
        activity: 'Low',
        reach: 'Low',
        reachPercent: 0,
    };

    if (!redisService.isConnected) {
        return defaultObj;
    }

    // If exists -> return data

    const value = await redisService.get(key);

    if (value) {
        const valueAsObj = JSON.parse(value);

        if (moment.utc().isAfter(moment(valueAsObj.expiresAt))) {
            // If exists but expired -> return data but schedule set new
            fetchAndSetUserStat(id)
                .then(async (data) => {
                    data.expiresAt = moment.utc().add(1, 'days').valueOf();
                    await redisService.set(key, JSON.stringify(data));
                })
                .catch((err) => {
                    logger.error(err);
                });
        }
        return { ...defaultObj, ...valueAsObj };
    } else {
        // If DNE -> return default, set new data
        fetchAndSetUserStat(id)
            .then(async (data) => {
                data.expiresAt = moment.utc().add(1, 'days').valueOf();
                await redisService.set(key, JSON.stringify(data));
            })
            .catch((err) => {
                logger.error(err);
            });

        // also set value with low expires to avoid flooding
        defaultObj.expiresAt = moment.utc().add(3, 'minute').valueOf();
        await redisService.set(key, JSON.stringify(defaultObj));
        return defaultObj;
    }
};

exports.getServiceStats = async ({ id, userId }) => {
    const key = `service:stats:${id}`;

    // If not connected -> return default
    const defaultObj = {
        totalViews: 0,
        totalGetInTouch: 0,
        ctr: 0,
        totalGetInTouchAccepted: 0,
        acceptRate: 0,
    };

    if (!redisService.isConnected) {
        return defaultObj;
    }

    // If exists -> return data

    const value = await redisService.get(key);

    if (value) {
        const valueAsObj = JSON.parse(value);

        if (moment.utc().isAfter(moment(valueAsObj.expiresAt))) {
            // If exists but expired -> return data but schedule set new
            fetchAndSetServiceStat(id, userId)
                .then(async (data) => {
                    data.expiresAt = moment.utc().add(1, 'days').valueOf();
                    await redisService.set(key, JSON.stringify(data));
                })
                .catch((err) => {
                    logger.error(err);
                });
        }
        return { ...defaultObj, ...valueAsObj };
    } else {
        // If DNE -> return default, set new data
        fetchAndSetServiceStat(id, userId)
            .then(async (data) => {
                data.expiresAt = moment.utc().add(1, 'days').valueOf();
                await redisService.set(key, JSON.stringify(data));
            })
            .catch((err) => {
                logger.error(err);
            });

        // also set value with low expires to avoid flooding
        defaultObj.expiresAt = moment.utc().add(3, 'minute').valueOf();
        await redisService.set(key, JSON.stringify(defaultObj));
        return defaultObj;
    }
};

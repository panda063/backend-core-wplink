/**
 * Dependencies
 */

const mongoose = require('mongoose');
const moment = require('moment');
const C = require('../../lib/constants');
const _ = require('lodash');
const env = require('../../config/env');

/**
 * Models
 */

const Creator = mongoose.model(C.MODELS.WRITER_C);
const ServiceBlock = mongoose.model(C.MODELS.SERVICE_BLOCK);

/**
 * Controllers
 */

const { getUserStats, serviceStats } = require('../creator/analytics-v1');

exports.getFeedAlgorithmInput = async () => {
    const creators = await Creator.find({
        obs: C.V3_CREATOR_ONBOARDING_STATES.STEP_DONE,
    })
        .select('createdAt obs')
        .exec();

    const creatorIds = _.map(creators, (creator) => creator.id);
    const services = await ServiceBlock.find({
        uid: {
            $in: creatorIds,
        },
    })
        .select('createdAt uid')
        .exec();

    let now = moment(new Date());
    // {
    //    id,
    //    portfolioComplete, createdAt;
    //    serviceData: {totalVisits, totalGetInTouch}, activity, avgResponseTime,
    //    totProfileVisits
    // }
    const creatorInput = [];
    for (let creator of creators) {
        let when = moment(creator.createdAt);
        const data = {
            id: creator.id,
            portfolioComplete: 1,
            createdAt: Math.max(
                Math.floor(moment.duration(now.diff(when)).asDays()),
                1,
            ),
            serviceData: { totalVisits: 1, totalGetInTouch: 1 },
            activity: 1,
            avgResponseTime: 1,
            totProfileVisits: 1,
        };
        const { activityPercent, reachPercent } = await getUserStats({
            user: creator,
        });
        data.activity = Math.max(activityPercent, 1);
        data.totProfileVisits = Math.max(reachPercent, 1);

        creatorInput.push(data);
    }
    // {
    //    visits,
    //    getInTouch,
    //    sCreatedAt,
    //    creator,
    //    sid
    // }
    const serviceInput = [];
    for (let service of services) {
        // We added createdAt field on this date
        let when = '2022-07-18';
        if (service.createdAt) {
            when = moment(service.createdAt);
        }
        const data = {
            sid: service.id,
            visits: 1,
            getInTouch: 1,
            sCreatedAt: Math.max(
                Math.floor(moment.duration(now.diff(when)).asDays()),
                1,
            ),
            creator: service.uid,
        };
        const { totalViews, totalGetInTouch } = await serviceStats({
            userId: service.uid.toString,
            id: service.id,
        });
        data.getInTouch = Math.max(totalGetInTouch, 1);
        data.visits = Math.max(totalViews, 1);
        serviceInput.push(data);
    }
    return { creatorInput, serviceInput };
};

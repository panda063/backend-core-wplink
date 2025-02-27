const mongoose = require('mongoose');

const {
    getFeedAlgorithmInput,
} = require('../../../controllers/helpers/feedHelpers');
const {
    serviceStats,
    getUserStats,
} = require('../../../controllers/creator/analytics-v1');

const feedService = require('../../feed');

/**
 * Models
 */

const ServiceData = mongoose.model('ServiceData');
const CreatorData = mongoose.model('CreatorData');

exports.calculateScoreForCollabFeed = async ({}) => {
    try {
        console.log('starting');
        const { creatorInput, serviceInput } = await getFeedAlgorithmInput();
        const data = {
            services: serviceInput,
            creators: creatorInput,
        };
        const { feedResultCreator, feedResultService } =
            await feedService.getScoreFromInput(data);
        const serviceOperations = [];
        const creatorOperations = [];

        for (let entry of feedResultService) {
            const stats = await serviceStats({ id: entry.id });
            serviceOperations.push({
                updateOne: {
                    filter: { sid: mongoose.Types.ObjectId(entry.id) },
                    update: {
                        $set: {
                            scr: entry.score,
                            rc: stats.totalViews,
                            acr: stats.acceptRate,
                            ctr: stats.ctr,
                        },
                    },
                    upsert: true,
                },
            });
        }

        for (let entry of feedResultCreator) {
            const stats = await getUserStats({ user: { id: entry.id } });
            creatorOperations.push({
                updateOne: {
                    filter: { uid: mongoose.Types.ObjectId(entry.id) },
                    update: {
                        $set: {
                            scr: entry.score,
                            rc: stats.reachPercent,
                            act: stats.activityPercent,
                            shd: stats.totalActiveCollabs,
                            accp: stats.acceptRatePercent,
                        },
                    },
                    upsert: true,
                },
            });
        }

        if (serviceOperations.length > 0)
            await ServiceData.collection.bulkWrite(serviceOperations, {
                ordered: false,
            });

        if (creatorOperations.length > 0)
            await CreatorData.collection.bulkWrite(creatorOperations, {
                ordered: false,
            });
        console.log('done');
    } catch (err) {
        console.log(err);
        console.log('scoring agenda failed');
    }
};

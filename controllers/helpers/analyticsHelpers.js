// Dependency
const mongoose = require('mongoose');
const _ = require('lodash');
const C = require('../../lib/constants');
const moment = require('moment');

// Models
const CollabRequest = mongoose.model(C.MODELS.COLLAB_REQUEST);
const CollabImport = mongoose.model(C.MODELS.COLLAB_IMPORT);

// Services
const posthogService = require('../../services/posthog');

const {
    calculatePercentile,
    assignPercentLabel,
} = require('../helpers/writerHelper');

exports.fetchAndSetUserStat = async (id) => {
    // user activity

    const activityPerDay = await posthogService.getInsightsFromEvents({
        events: [
            {
                id: 'edit portfolio',
                properties: [{ key: 'user_id', value: id }],
            },
            {
                id: 'block changed',
                properties: [{ key: 'user_id', value: id }],
            },
            {
                id: 'visit feed',
                properties: [{ key: 'user_id', value: id }],
            },
            {
                id: 'request sent',
                properties: [{ key: 'user_id', value: id }],
            },
            {
                id: 'request action',
                properties: [{ key: 'user_id', value: id }],
            },
            {
                id: 'import action',
                properties: [{ key: 'user_id', value: id }],
            },
        ],
        display: 'ActionsLineGraph',
        date_from: moment()
            .utc()
            .subtract(30 - 1, 'days')
            .format('YYYY-MM-DD'),
    });

    const dailyActivity = Array(30).fill(0);
    for (let i = 0; i < 30; i++) {
        for (let eventResult of activityPerDay.result) {
            dailyActivity[i] += eventResult.data[i];
        }
    }

    let activity = Math.min(_.sum(dailyActivity), 25 * 30) / (25 * 30);
    activity *= 100;

    // accept rate
    const totalRequests = await CollabRequest.countDocuments({
        rc: id,
    }).exec();
    const acceptedRequests = await CollabRequest.countDocuments({
        rc: id,
        st: C.COLLAB_REQUEST_STATES.ACCEPTED,
    }).exec();
    const acceptRatePercent =
        totalRequests > 0 ? (acceptedRequests / totalRequests) * 100 : 0;
    const acceptRate = assignPercentLabel(acceptRatePercent);

    // profile reach

    const perUserInsight = await posthogService.getInsightsFromEvents({
        events: [
            {
                id: 'profile visited',
            },
        ],
        breakdown_value: 'distinct_id',
        date_from: moment().utc().subtract(8, 'days').format('YYYY-MM-DD'),
    });

    const visitValues = [];
    for (let user of perUserInsight.result) {
        visitValues.push(user.aggregated_value);
    }

    const currentUserInsight = await posthogService.getInsightsFromEvents({
        events: [
            {
                id: 'profile visited',
                properties: [{ key: 'distinct_id', value: id }],
            },
        ],
        breakdown_value: 'distinct_id',
        date_from: moment().utc().subtract(8, 'days').format('YYYY-MM-DD'),
    });

    let currentUserValue = 0;
    if (currentUserInsight.result.length > 0) {
        currentUserValue = currentUserInsight.result[0].aggregated_value;
    }

    let reachPercent = calculatePercentile(visitValues, currentUserValue);
    const reach = assignPercentLabel(reachPercent);

    // total collaboration

    const totalActiveCollabs = await CollabImport.countDocuments({
        $or: [
            {
                u: id,
            },
            {
                svo: id,
            },
        ],
        st: C.COLLAB_IMPORT_STATES.ACTIVE,
    }).exec();

    return {
        acceptRate,
        acceptRatePercent,
        totalActiveCollabs,
        activityPercent: activity,
        activity: assignPercentLabel(activity),
        reach,
        reachPercent,
    };
};

exports.fetchAndSetServiceStat = async (id, userId) => {
    // totalViews
    let insight = await posthogService.getInsightsFromEvents({
        events: [
            {
                id: 'service viewed',
                properties: [
                    /*  { key: 'distinct_id', value: userId }, */
                    { key: 'service_id', value: id },
                ],
            },
        ],
        date_from: 'all',
    });

    const totalViews = insight.result[0].aggregated_value;

    // total Getintouch
    insight = await posthogService.getInsightsFromEvents({
        events: [
            {
                id: 'got in touch',
                properties: [
                    /* { key: 'distinct_id', value: userId }, */
                    { key: 'service_id', value: id },
                ],
            },
        ],
        date_from: 'all',
    });

    const totalGetInTouch = insight.result[0].aggregated_value;

    insight = await posthogService.getInsightsFromEvents({
        events: [
            {
                id: 'accept got in touch',
                properties: [{ key: 'service_id', value: id }],
            },
        ],
        date_from: 'all',
    });

    const totalGetInTouchAccepted = insight.result[0].aggregated_value;

    const ctr =
        totalViews > 0
            ? Number(((totalGetInTouch / totalViews) * 100).toFixed(2))
            : 0;

    const acceptRate =
        totalGetInTouch > 0
            ? Number(
                  ((totalGetInTouchAccepted / totalGetInTouch) * 100).toFixed(
                      2,
                  ),
              )
            : 0;

    return {
        totalViews,
        totalGetInTouch,
        ctr,
        totalGetInTouchAccepted,
        acceptRate,
    };
};

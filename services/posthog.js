const axios = require('axios');
const { performance } = require('perf_hooks');
const {
    authKey: { personalApiKey, projectApiKey },
    hostname,
} = require('../config/posthog');

const env = require('../config/env');

// Custom errors
const { BadRequest } = require('../lib/errors');

/**
 * @param userId User of which to fetch events for
 * @param eventType Fetch events of a particular type (Optional)
 * @param nextUrl Result is paginated. Use nextUrl to fetch the next page
 */

exports.fetchAllEventsOfUser = async ({ userId, eventType, nextUrl }) => {
    try {
        let params = {
            distinct_id: userId,
        };
        if (eventType && eventType !== 'all') {
            params = {
                ...params,
                event: eventType,
            };
        }
        let reqUrl = `${hostname}/api/event`;
        if (nextUrl) {
            reqUrl = nextUrl;
        }
        const res = await axios.get(reqUrl, {
            params,
            headers: {
                Authorization: `Bearer ${personalApiKey}`,
            },
        });
        return res.data;
    } catch (err) {
        throw new BadRequest('Error fetching events of user');
    }
};

exports.fetchAllEventsOfUserPaginate = async ({ userId, nextUrl }) => {
    try {
        const res = await axios.get(`${nextUrl}`, {
            params: {
                distinct_id: userId,
            },
            headers: {
                Authorization: `Bearer ${personalApiKey}`,
            },
        });
        return res.data;
    } catch (err) {
        throw new BadRequest('Error fetching events of user');
    }
};

/**
  * @param events Events can be an array of event names and filter properties. 
  *         Ex.   events: [
            {
                id: 'profile visited',
                properties: [{ key: 'distinct_id', value: user.id }],
            },
        ],
    @param breakdown_value If a value is provided. Result will breakdown on this property. See - https://posthog.com/docs/api/trend
    @param display - One of ActionsLineGraph ActionsLineGraphCumulative ActionsTable ActionsPie ActionsBar ActionsBarV. Default is ActionsBarValue
    @param interval
    @param date_from
    @param date_to
 */
exports.getInsightsFromEvents = async ({
    events,
    breakdown_value,
    display = 'ActionsBarValue',
    interval,
    date_from,
    date_to,
    refresh = true,
}) => {
    try {
        /* var startTime = performance.now(); */

        // TODO: Cache data. Check last_refresh and decide whether to send refresh=true or not
        let params = { events: JSON.stringify(events), display, refresh };
        if (breakdown_value) {
            params = {
                ...params,
                breakdown: breakdown_value,
                breakdown_type: 'property',
            };
        }
        if (interval) {
            params = {
                ...params,
                interval,
            };
        }
        if (date_from) {
            params = {
                ...params,
                date_from,
            };
        }
        if (date_to) {
            params = {
                ...params,
                date_to,
            };
        }
        const res = await axios.get(`${hostname}/api/insight/trend`, {
            params,
            headers: {
                Authorization: `Bearer ${personalApiKey}`,
            },
        });
        /*  var endTime = performance.now();
        console.log(
            `Call to doSomething took ${endTime - startTime} milliseconds`,
        ); */
        return res.data;
    } catch (err) {
        console.log(err);
        throw new BadRequest('Error fetching insights');
    }
};

exports.captureEvent = async ({ event, properties, distinct_id }) => {
    try {
        const res = await axios.post(`${hostname}/capture/`, {
            api_key: projectApiKey,
            event,
            properties: {
                ...properties,
                env: env.NODE_ENV,
            },
            type: 'capture',
            distinct_id,
        });
    } catch (err) {
        throw new BadRequest('event not captured');
    }
};

exports.captureEventBatch = async ({ events }) => {
    try {
        const res = await axios.post(`${hostname}/capture/`, {
            api_key: projectApiKey,
            events,
        });
    } catch (err) {
        throw new BadRequest('event not captured');
    }
};

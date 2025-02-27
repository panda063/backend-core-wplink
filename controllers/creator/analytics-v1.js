// Dependency
const mongoose = require('mongoose');
const _ = require('lodash');
const C = require('../../lib/constants');
const env = require('../../config/env');
const async = require('async');
const moment = require('moment');

// Models
const ServiceBlock = mongoose.model(C.MODELS.SERVICE_BLOCK);
const Block = mongoose.model(C.MODELS.BLOCK);
const CollabRequest = mongoose.model(C.MODELS.COLLAB_REQUEST);
const CollabImport = mongoose.model(C.MODELS.COLLAB_IMPORT);

// Services
const posthogService = require('../../services/posthog');
const {
    getCreatorStats,
    getServiceStats,
} = require('../../services/redis/operations');

// Dependent Controllers

const chatController = require('../chat');
const creatorChatController = require('./chat');

// Helpers

// Errors
const { BadRequest } = require('../../lib/errors');

exports.getReport = async ({ user }) => {
    return {
        report: user.otherDetails.report,
    };
};

exports.getClientActivity = async ({ user, nextUrl, eventType }) => {
    const allEvents = await posthogService.fetchAllEventsOfUser({
        userId: user.id,
        nextUrl,
        eventType,
    });
    nextUrl = '';
    // Check if next query needs to be paginated
    if (allEvents.next) nextUrl = allEvents.next;

    let allEventsFiltered = _.filter(allEvents.results, function (o) {
        return o.event && o.event != '$identify';
    });
    let sessions = new Map();
    _.map(allEventsFiltered, (e) => {
        const session_id = e.properties.$session_id;
        if (session_id) {
            const [
                visitor_id,
                visitor_role,
                visitor_name,
                city,
                country,
                device,
                browser,
            ] = [
                e.properties.visitor_id,
                e.properties.visitor_role,
                e.properties.visitor_name,
                e.properties.$geoip_city_name,
                e.properties.$geoip_country_name,
                e.properties.$device_type,
                e.properties.$browser,
            ];
            e.eventProperties = {
                public_view: e.properties.public_view,
                portfolio_owner: e.properties.portfolio_owner,
            };
            if (e.event == 'post viewed') {
                e.eventProperties.post_id = e.properties.post_id;
            }
            if (e.event == 'service viewed') {
                e.eventProperties.service_id = e.properties.service_id;
            }
            if (e.event == 'got in touch') {
                e.eventProperties.service_id = e.properties.service_id;
            }

            delete e.properties;
            delete e.person;
            delete e.elements;
            delete e.elements_chain;
            let getSession = sessions.get(session_id);
            if (!getSession) {
                sessions.set(session_id, {
                    session_id,
                    timestamp: e.timestamp,
                    visitor_id,
                    visitor_role,
                    visitor_name,
                    city,
                    country,
                    device,
                    browser,
                    events: [e],
                });
            } else {
                getSession.events.push(e);
                sessions.set(session_id, getSession);
            }
        }
    });
    sessions = Array.from(sessions.values());
    sessions.sort((a, b) => (a.timestamp > b.timestamp ? -1 : 1));
    return { nextUrl, sessions };
};

exports.getChartDataAndViews = async ({ user, timeframe }) => {
    let noOfDays = 7;
    if (timeframe == '7d') {
        noOfDays = 7;
    } else if (timeframe == '30d') {
        noOfDays = 30;
    }
    // For Chart
    const currentInsights = await posthogService.getInsightsFromEvents({
        events: [
            {
                id: 'profile visited',
                properties: [{ key: 'distinct_id', value: user.id }],
            },
        ],
        display: 'ActionsLineGraph',
        interval: 'day',
        date_from: moment()
            .utc()
            .subtract(noOfDays - 1, 'days')
            .format('YYYY-MM-DD'),
    });
    const chartData = {
        labels: currentInsights.result[0].labels,
        data: currentInsights.result[0].data,
    };
    // ! AKHIL (Temporary)
    if (user.id == '6273e4a69f963274ecb43f7c') {
        for (let idx in chartData.data) {
            chartData.data[idx] = Math.floor(
                Math.random() * (150 - 100 + 1) + 100,
            );
        }
    }

    return {
        chartData,
    };
};

exports.getViewSource = async ({ user, sourceType }) => {
    let breakdown_value = '$referrer';
    if (sourceType == 'referrer') {
        breakdown_value = '$referrer';
    }
    if (sourceType == 'region') {
        breakdown_value = '$geoip_city_name';
    }
    // For source
    const sourceInsights = await posthogService.getInsightsFromEvents({
        events: [
            {
                id: 'profile visited',
                properties: [{ key: 'distinct_id', value: user.id }],
            },
        ],
        interval: 'day',
        breakdown_value,
        date_from: 'all',
    });
    const viewsSource = [];
    let totalViews = 0;
    _.map(sourceInsights.result, (s) => {
        viewsSource.push({
            source: s.breakdown_value,
            visits: s.aggregated_value,
            percent: 0,
        });
        totalViews += s.aggregated_value;
    });
    if (totalViews > 0) {
        _.map(viewsSource, (s) => {
            s.percent = Math.floor((s.visits * 100) / totalViews);
        });
    }
    viewsSource.sort((a, b) => (a.visits > b.visits ? -1 : 1));
    return { viewsSource };
};

exports.getLeads = async ({ user, compareFrom }) => {
    const services = await ServiceBlock.find({
        uid: user.id,
    })
        .select('t')
        .exec();
    const leadsMap = new Map();
    _.map(services, (s) => {
        leadsMap.set(s.id, {
            service_id: s.id,
            visits: 0,
            prev_visits: 0,
            percent: 0,
            title: s.title,
        });
    });
    // Current Count
    const currentInsights = await posthogService.getInsightsFromEvents({
        events: [
            {
                id: 'service viewed',
                properties: [{ key: 'distinct_id', value: user.id }],
            },
        ],
        breakdown_value: 'service_id',
        date_from: 'all',
    });
    // Count until a time t in the past
    let noOfDays = 7;
    if (compareFrom == 'last-week') {
        noOfDays = 7;
    }
    if (compareFrom == 'last-month') {
        noOfDays = 30;
    }
    const prevInsights = await posthogService.getInsightsFromEvents({
        events: [
            {
                id: 'service viewed',
                properties: [{ key: 'distinct_id', value: user.id }],
            },
        ],
        breakdown_value: 'service_id',
        date_from: 'all',
        date_to: moment().utc().subtract(noOfDays, 'days').format('YYYY-MM-DD'),
    });
    // Set current count
    _.map(currentInsights.result, (service) => {
        const value = leadsMap.get(service.breakdown_value);
        if (value) {
            leadsMap.set(service.breakdown_value, {
                ...value,
                visits: service.aggregated_value,
            });
        }
    });
    // Set previous count
    _.map(prevInsights.result, (service) => {
        const value = leadsMap.get(service.breakdown_value);
        if (value) {
            leadsMap.set(service.breakdown_value, {
                ...value,
                prev_visits: service.aggregated_value,
            });
        }
    });
    const leads = Array.from(leadsMap.values());
    // Calculate change in percent
    _.map(leads, (lead) => {
        if (lead.visits)
            lead.percent = Math.floor(
                ((lead.visits - lead.prev_visits) * 100) / lead.visits,
            );
    });
    leads.sort((a, b) => (a.visits > b.visits ? -1 : 1));
    return {
        leads,
    };
};

exports.getPostViews = async ({ user, compareFrom }) => {
    const blocks = await Block.find({
        uid: user.id,
        __t: {
            $in: [
                C.MODELS.IMAGE_BLOCK,
                C.MODELS.LINK_BLOCK,
                C.MODELS.PDF_BLOCK,
                C.MODELS.PROJECT_BLOCK,
            ],
        },
    })
        .select('t')
        .exec();
    const blockMap = new Map();
    _.map(blocks, (s) => {
        blockMap.set(s.id, {
            post_id: s.id,
            visits: 0,
            prev_visits: 0,
            percent: 0,
            title: s.title,
        });
    });
    // Current Counts
    const currentInsights = await posthogService.getInsightsFromEvents({
        events: [
            {
                id: 'post viewed',
                properties: [{ key: 'distinct_id', value: user.id }],
            },
        ],
        breakdown_value: 'post_id',
        date_from: 'all',
    });
    // Count until a time t in the past
    let noOfDays = 7;
    if (compareFrom == 'last-week') {
        noOfDays = 7;
    }
    if (compareFrom == 'last-month') {
        noOfDays = 30;
    }
    const prevInsights = await posthogService.getInsightsFromEvents({
        events: [
            {
                id: 'post viewed',
                properties: [{ key: 'distinct_id', value: user.id }],
            },
        ],
        breakdown_value: 'post_id',
        date_from: 'all',
        date_to: moment().utc().subtract(noOfDays, 'days').format('YYYY-MM-DD'),
    });
    // Set current count first
    _.map(currentInsights.result, (post) => {
        const value = blockMap.get(post.breakdown_value);
        if (value) {
            blockMap.set(post.breakdown_value, {
                ...value,
                visits: post.aggregated_value,
            });
        }
    });
    // Set previous count
    _.map(prevInsights.result, (post) => {
        const value = blockMap.get(post.breakdown_value);
        if (value) {
            blockMap.set(post.breakdown_value, {
                ...value,
                prev_visits: post.aggregated_value,
            });
        }
    });
    const posts = Array.from(blockMap.values());
    // Calculate change in percent
    _.map(posts, (post) => {
        if (post.visits)
            post.percent = Math.floor(
                ((post.visits - post.prev_visits) * 100) / post.visits,
            );
    });
    posts.sort((a, b) => (a.visits > b.visits ? -1 : 1));
    return {
        posts,
    };
};

exports.getEarnings = async ({ user }) => {
    const { payments } = await chatController.getPaymentsList({
        user,
        onlyInvoice: true,
    });
    const { invoiceRaised, invoicePaid, pending } =
        await creatorChatController.getPaymentAnalytics({ creator: user });
    return { invoiceRaised, invoicePaid, pending, payments };
};

exports.getDailyAnalytics = async ({ user }) => {
    let noOfDays = 1;
    let totalVisit = 0,
        totalServiceVisit = 0,
        totalPostVisit = 0;
    let posts = [];
    let leads = [];

    // Get portfolio visits in in last 1 day
    const visitInsight = await posthogService.getInsightsFromEvents({
        events: [
            {
                id: 'profile visited',
                properties: [{ key: 'distinct_id', value: user.id }],
            },
        ],
        interval: 'day',
        date_from: moment()
            .utc()
            .subtract(noOfDays - 1, 'days')
            .format('YYYY-MM-DD'),
    });
    totalVisit = visitInsight.result[0].aggregated_value;
    if (totalVisit == 0) {
        return {
            dontSend: true,
        };
    }

    // Get service view in last 1 day  const visistInsight = await posthogService.getInsightsFromEvents({
    const serviceInsight = await posthogService.getInsightsFromEvents({
        events: [
            {
                id: 'service viewed',
                properties: [{ key: 'distinct_id', value: user.id }],
            },
        ],
        interval: 'day',
        date_from: moment()
            .utc()
            .subtract(noOfDays - 1, 'days')
            .format('YYYY-MM-DD'),
    });
    totalServiceVisit = serviceInsight.result[0].aggregated_value;
    // Get post view in last 1 day
    const postInsight = await posthogService.getInsightsFromEvents({
        events: [
            {
                id: 'post viewed',
                properties: [{ key: 'distinct_id', value: user.id }],
            },
        ],
        interval: 'day',
        date_from: moment()
            .utc()
            .subtract(noOfDays - 1, 'days')
            .format('YYYY-MM-DD'),
    });

    totalPostVisit = postInsight.result[0].aggregated_value;

    // For each block get view count
    const blocks = await Block.find({
        uid: user.id,
        __t: {
            $in: [
                C.MODELS.IMAGE_BLOCK,
                C.MODELS.LINK_BLOCK,
                C.MODELS.PDF_BLOCK,
                C.MODELS.PROJECT_BLOCK,
            ],
        },
    })
        .select('t')
        .exec();
    const blockMap = new Map();
    _.map(blocks, (s) => {
        blockMap.set(s.id, {
            post_id: s.id,
            visits: 0,
            title: s.title,
        });
    });

    const currentInsightsPost = await posthogService.getInsightsFromEvents({
        events: [
            {
                id: 'post viewed',
                properties: [{ key: 'distinct_id', value: user.id }],
            },
        ],
        breakdown_value: 'post_id',
        date_from: moment()
            .utc()
            .subtract(noOfDays - 1, 'days')
            .format('YYYY-MM-DD'),
    });
    _.map(currentInsightsPost.result, (post) => {
        const value = blockMap.get(post.breakdown_value);
        if (value) {
            blockMap.set(post.breakdown_value, {
                ...value,
                visits: post.aggregated_value,
            });
        }
    });
    posts = Array.from(blockMap.values()).filter((post) => post.visits > 0);

    // For each service get view count
    const services = await ServiceBlock.find({
        uid: user.id,
    })
        .select('t')
        .exec();
    const leadsMap = new Map();
    _.map(services, (s) => {
        leadsMap.set(s.id, {
            service_id: s.id,
            visits: 0,
            title: s.title,
        });
    });
    const currentInsightsService = await posthogService.getInsightsFromEvents({
        events: [
            {
                id: 'service viewed',
                properties: [{ key: 'distinct_id', value: user.id }],
            },
        ],
        breakdown_value: 'service_id',
        date_from: moment()
            .utc()
            .subtract(noOfDays - 1, 'days')
            .format('YYYY-MM-DD'),
    });

    _.map(currentInsightsService.result, (service) => {
        const value = leadsMap.get(service.breakdown_value);
        if (value) {
            leadsMap.set(service.breakdown_value, {
                ...value,
                visits: service.aggregated_value,
            });
        }
    });
    leads = Array.from(leadsMap.values()).filter(
        (service) => service.visits > 0,
    );

    return {
        totalVisit,
        totalServiceVisit,
        totalPostVisit,
        posts,
        leads,
        dontSend: false,
    };
};

exports.getUserStats = async ({ id }) => {
    const result = await getCreatorStats({ id });

    return result;
};

async function serviceStats({ id, userId }) {
    const result = await getServiceStats({ id, userId });

    return result;
}

exports.serviceStats = serviceStats;

exports.getServiceStats = async ({ id, user }) => {
    const exists = await Block.exists({ _id: id });
    if (!exists) throw new BadRequest('service block not found');

    const result = await serviceStats({ id, userId: user.id });

    return {
        ...result,
    };
};

exports.collabSummary = async ({ user, interval, type }) => {
    const summary = {
        requests: 0,
        accepted: 0,
        reach: 0,
    };

    summary.requests = await CollabRequest.countDocuments({
        $or: [
            {
                sd: user.id,
            },
            {
                rc: user.id,
            },
        ],
        rqt: type,
    }).exec();

    summary.accepted = await CollabRequest.countDocuments({
        $or: [
            {
                sd: user.id,
            },
            {
                rc: user.id,
            },
        ],
        rqt: type,
        st: C.COLLAB_REQUEST_STATES.ACCEPTED,
    }).exec();

    const query = { st: C.COLLAB_IMPORT_STATES.ACTIVE };

    if (type == C.COLLAB_REQUEST_TYPE.IMPORT) {
        query.u = user.id;
    } else {
        query.svo = user.id;
        // ?? when viewing export data, you can only view data of exported refer services
        // query.clt = C.COLLAB_TYPE.REFER;
    }

    const activeImports = await CollabImport.find(query).select('bl').exec();

    const blockIds = _.map(activeImports, (imported) => imported.bl.toString());

    // In days
    let timeframe = 10;

    if (interval == 'day') {
        timeframe = 30;
    }
    if (interval == 'month') {
        timeframe = 30 * 12;
    }
    if (interval == 'week') {
        timeframe = 7 * 8;
    }
    const insights = await posthogService.getInsightsFromEvents({
        events: [
            {
                id: 'service viewed',
                properties: [{ key: 'service_id', value: blockIds }],
            },
        ],
        interval,
        display: 'ActionsLineGraph',
        date_from: moment()
            .utc()
            .subtract(timeframe - 1, 'days')
            .format('YYYY-MM-DD'),
    });

    const chartData = {
        totalViews: insights.result[0].count,
        labels: insights.result[0].labels,
        data: insights.result[0].data,
        interval,
        type,
    };

    /*  // Just for testing
    for (let idx in chartData.data) {
        chartData.data[idx] = Math.floor(Math.random() * (20 - 1 + 1) + 1);
    } */

    return {
        summary,
        chartData,
    };
};

exports.specificImportSummary = async ({ user, id, interval }) => {
    // TODO: Add reach
    const getImport = await CollabImport.findOne({
        _id: id,
        $or: [{ u: user.id }, { svo: user.id }],
    }).exec();

    if (!getImport) throw new BadRequest('Import was not found');

    // service
    const serviceDetails = {
        title: '',
        state: getImport.state,
        public_url: '',
        importId: getImport.id,
    };

    let blockId = getImport.bl.toString();

    if (getImport.state == C.COLLAB_IMPORT_STATES.REMOVED) {
        serviceDetails.title = getImport.meta.title || '';
    } else {
        let fromBlock = blockId;
        /*   if (getImport.clt == C.COLLAB_TYPE.REFER) {
            fromBlock = getImport.sv;
        } */
        const block = await Block.findById(fromBlock).select('t pul').exec();
        if (block) {
            serviceDetails.title = block.title;
            serviceDetails.public_url = block.public_url;
        }
    }

    // In days
    let timeframe = 10;

    if (interval == 'day') {
        timeframe = 30;
    }
    if (interval == 'month') {
        timeframe = 30 * 12;
    }
    if (interval == 'week') {
        timeframe = 7 * 8;
    }
    const insights = await posthogService.getInsightsFromEvents({
        events: [
            {
                id: 'service viewed',
                properties: [{ key: 'service_id', value: blockId }],
            },
        ],
        interval,
        display: 'ActionsLineGraph',
        date_from: moment()
            .utc()
            .subtract(timeframe - 1, 'days')
            .format('YYYY-MM-DD'),
    });

    const chartData = {
        totalViews: 0,
        labels: insights.result[0].labels,
        data: insights.result[0].data,
        interval,
    };

    /* // Just for testing
    for (let idx in chartData.data) {
        chartData.data[idx] = Math.floor(Math.random() * (20 - 1 + 1) + 1);
    } */

    // summary
    const summary = {
        /*   totalGetInTouch: 0,
        acceptRate: 0,
        ctr: 0, */
        reach: 0,
    };

    if (
        !(
            getImport.svo == user.id &&
            getImport.collabType == C.COLLAB_TYPE.MANAGE
        )
    ) {
        // We dont show this data if block is not on user's portfolio i.e exported
        // and is of manage type

        const { totalGetInTouch, ctr, acceptRate } = await serviceStats({
            id: blockId,
            userId: getImport.u.toString(),
        });

        summary.totalGetInTouch = totalGetInTouch;
        summary.ctr = ctr;
        summary.acceptRate = acceptRate;

        serviceDetails.emailsCollected = getImport.emailsCollected;
    }

    return {
        chartData,
        serviceDetails,
        summary,
    };
};

exports.getImportList = async ({ user, type }) => {
    let query = {
        st: C.COLLAB_IMPORT_STATES.ACTIVE,
    };

    if (type == C.COLLAB_REQUEST_TYPE.IMPORT) {
        query.u = user.id;
    } else if (type == C.COLLAB_REQUEST_TYPE.EXPORT) {
        query.svo = user.id;
    } else {
        // all
        query = {
            ...query,
            $or: [
                {
                    u: user.id,
                },
                {
                    svo: user.id,
                },
            ],
        };
    }

    const results = await CollabImport.find(query)
        .select('u bl sv clt m st createdAt')
        .populate([
            {
                path: 'sv',
                select: 't ft prc ru curr',
            },
        ])
        .exec();
    let imports = {};

    const getStatsParams = [];

    for (let res of results) {
        let blockId = res.bl.toString();
        let userId = res.u.toString();

        res = await res.execPopulate({
            path: 'bl',
            select: 't dta.ft dta.prc dta.ru dta.curr',
        });
        res = res.toJSON();

        let service = {
            title: '',
            feesType: C.SERVICE_BLOCK_FEES_TYPE.FIXED,
            price: 0,
            rateUnit: null,
            currency: C.CURRENCY.INR,
        };

        if (res.state == C.COLLAB_IMPORT_STATES.REMOVED) {
            // ! removed imports have now been filtered
            if (res.meta) {
                service.title = res.meta.title;
                service.feesType = res.meta.feesType;
                service.price = res.meta.price;
                service.rateUnit = res.meta.rateUnit;
                service.currency = res.meta.currency;
            }
        } else {
            if (res.collabType == C.COLLAB_TYPE.MANAGE) {
                if (res.block) {
                    // imported block not deleted
                    // OR import is still active
                    service.title = res.block.title;
                    service.feesType = res.block.feesType;
                    service.price = res.block.price;
                    service.rateUnit = res.block.rateUnit;
                    service.currency = res.block.currency;
                }
            } else {
                // original block not deleted
                if (res.service) {
                    service.title = res.service.title;
                    service.feesType = res.service.feesType;
                    service.price = res.service.price;
                    service.rateUnit = res.service.rateUnit;
                    service.currency = res.service.currency;
                }
            }
        }

        delete res.service;
        delete res.meta;
        delete res.block;
        res.service = service;

        /*  const stats = {
            totalGetInTouch,
            totalViews,
            reach: 0,
        }; */

        getStatsParams.push({
            id: blockId,
            userId,
            importId: res.id,
        });

        imports[res.id] = res;
    }

    await async.each(getStatsParams, async (param) => {
        const stats = await serviceStats(param);
        imports[param.importId] = {
            ...imports[param.importId],
            stats: { ...stats, reach: 0 },
        };
    });

    imports = Object.values(imports);

    return {
        imports,
    };
};

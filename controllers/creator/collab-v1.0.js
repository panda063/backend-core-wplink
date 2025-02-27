/**
 * Module dependencies
 */

const mongoose = require('mongoose');
const moment = require('moment');

const C = require('../../lib/constants');
const env = require('../../config/env');
const _ = require('lodash');

/**
 * Models
 */

const Creator = mongoose.model(C.MODELS.WRITER_C);
const Page = mongoose.model(C.MODELS.PAGE);
const Block = mongoose.model(C.MODELS.BLOCK);
const ServiceBlock = mongoose.model(C.MODELS.SERVICE_BLOCK);
const TestimonialBlock = mongoose.model(C.MODELS.TESTIMONIAL_BLOCK);
const CollabImport = mongoose.model(C.MODELS.COLLAB_IMPORT);
const CollabRequest = mongoose.model(C.MODELS.COLLAB_REQUEST);
const CollabRequestMessage = mongoose.model(C.MODELS.REQUEST_COLLAB);
const ImportedService = mongoose.model(C.MODELS.IMPORTED_SERVICE);

/**
 * External Services
 */

const redisOperations = require('../../services/redis/operations');
const rtService = require('../../services/rt');
const { notification } = require('../../messaging/index');

/**
 * Helpers
 */

const { createConversationCreator } = require('../helpers/chatHelpers');
const {
    importedServiceUrl,
    getFirstPositionInPage,
    assignPercentLabel,
} = require('../helpers/writerHelper');

/**
 * Controllers
 */

const analyticControllers = require('./analytics-v1');

// Errors
const { BadRequest } = require('../../lib/errors');

async function createRequestMessage({ sender, receiver, request, service }) {
    // chat message for request
    const conversation = await createConversationCreator({
        u1: sender.id,
        u2: receiver.id,
    });

    // Flag to check if document is for a new conversation
    const isNew = conversation.isNew;

    let newRequest = await CollabRequestMessage({
        convoId: conversation.id,
        sender: sender.id,
        rq: request.id,
    });
    conversation.lmd = new Date(moment());
    conversation.lmsg = newRequest.id;

    if (conversation.u1 == sender.id) {
        conversation.pendingCountUser2 += 1;
    } else {
        conversation.pendingCountUser1 += 1;
    }

    await newRequest.save();
    await conversation.save();

    // update conversation in redis cache
    await redisOperations.updateConverstionInCache({
        conversation,
    });
    // Push new message and conversation event
    newRequest = newRequest.toJSON();
    newRequest.sender = {
        name: sender.fullname,
        designation: '',
    };
    if (isNew) {
        // if conversation is new
        // push conversation
        const conversationData = {
            conversationId: conversation.id,
            pendingCount:
                conversation.u1 == sender.id
                    ? conversation.pendingCountUser2
                    : conversation.pendingCountUser1,
            conversationType: C.CONVERSATION_TYPE.INBOX,
        };
        await rtService.sendNewConversation({
            receiver: [receiver.id],
            ...conversationData,
        });
    }
    newRequest.request = {
        id: request.id,
        sender,
        service,
        ...request,

        /* requestType,
        collabType,
        message,
        page,
        state,
        meta, */
    };

    // push message
    await rtService.sendNewMessage({
        receivers: [receiver.id],
        ...newRequest,
    });

    return conversation.id;
}

async function createImportRequest({ user, sid, pageId, message, collabType }) {
    const service = await ServiceBlock.findOne({
        _id: sid,
    }).exec();
    if (!service) throw new BadRequest('service block was not found');

    if (service.uid == user.id)
        throw new BadRequest('You cannot import your own service');

    // prepaidGig services cannot be imported
    if (service.feesType == C.SERVICE_BLOCK_FEES_TYPE.PREPAID) {
        throw new BadRequest('Prepaid gig services cannot be imported');
    }

    const page = await Page.findOne({
        _id: pageId,
        uid: user.id,
    }).exec();

    if (!page) throw new BadRequest('Page not found');

    let request = await CollabRequest.findOne({
        sd: user.id,
        rc: service.uid,
        sv: service.id,
        rqt: C.COLLAB_REQUEST_TYPE.IMPORT,
        clt: collabType,
        st: C.COLLAB_REQUEST_STATES.PENDING,
    }).exec();

    if (request) throw new BadRequest('A request is already pending');

    const collabImport = await CollabImport.findOne({
        u: user.id,
        sv: service.id,
        clt: collabType,
        st: C.COLLAB_IMPORT_STATES.ACTIVE,
    }).exec();

    if (collabImport)
        throw new BadRequest('This block has already been imported');

    request = new CollabRequest({
        sd: user.id,
        rc: service.uid,
        sv: service.id,
        svo: service.uid,
        rqt: C.COLLAB_REQUEST_TYPE.IMPORT,
        clt: collabType,
        msg: message,
        page: pageId,
    });

    await request.save();

    // send request message
    const conversationId = await createRequestMessage({
        sender: {
            id: user.id,
            fullname: user.fullname,
        },
        receiver: {
            id: service.uid,
        },
        request: {
            id: request.id,
            collabType: request.collabType,
            requestType: request.requestType,
            message: request.message,
            page: request.page,
            state: request.state,
            meta: request.meta,
        },
        service: {
            title: service.title,
            id: service.id,
        },
    });

    request.convo = conversationId;
    await request.save();

    // notification
    const usecase =
        collabType == C.COLLAB_TYPE.MANAGE
            ? 'manage_import_request'
            : 'refer_import_request';
    const actionName =
        collabType == C.COLLAB_TYPE.MANAGE
            ? 'view_manage_import_request'
            : 'view_refer_import_request';

    await notification.send({
        usecase,
        role: C.ROLES.WRITER_C,
        web: {
            for: {
                id: service.uid,
                role: C.ROLES.WRITER_C,
            },
            by: {
                id: user.id,
                role: C.ROLES.WRITER_C,
            },
            actions: {
                n: actionName,
                d: {
                    requestId: request.id,
                    collabType: request.collabType,
                },
            },
            createdAt: Date.now(),
            name: user.fullname,
        },
    });
}

async function createExportRequest({ user, sid, userId, message, collabType }) {
    if (user.id === userId)
        throw new BadRequest('You cannot send a request to yourself');

    const other = await Creator.findOne({
        _id: userId,
    })
        .select('e')
        .exec();
    if (!other) throw new BadRequest('The other user was not found');

    const service = await ServiceBlock.findOne({
        uid: user.id,
        _id: sid,
    })
        .select('ft t uid')
        .exec();

    // prepaidGig services cannot be imported
    if (service.feesType == C.SERVICE_BLOCK_FEES_TYPE.PREPAID) {
        throw new BadRequest('Prepaid gig services cannot be exported');
    }

    if (!service) throw new BadRequest('Service not found on your portfolio');

    let request = await CollabRequest.findOne({
        sd: user.id,
        rc: other.id,
        sv: service.id,
        rqt: C.COLLAB_REQUEST_TYPE.EXPORT,
        clt: collabType,
        st: C.COLLAB_REQUEST_STATES.PENDING,
    }).exec();
    if (request) throw new BadRequest('A request is already pending');

    const collabImport = await CollabImport.findOne({
        u: other.id,
        sv: service.id,
        clt: collabType,
        st: C.COLLAB_IMPORT_STATES.ACTIVE,
    }).exec();

    if (collabImport)
        throw new BadRequest('This block has already been imported');

    // Create request
    request = new CollabRequest({
        sd: user.id,
        rc: other.id,
        sv: service.id,
        svo: user.id,
        rqt: C.COLLAB_REQUEST_TYPE.EXPORT,
        clt: collabType,
        msg: message,
    });

    await request.save();

    // send request message
    const conversationId = await createRequestMessage({
        sender: {
            id: user.id,
            fullname: user.fullname,
        },
        receiver: {
            id: userId,
        },
        request: {
            id: request.id,
            collabType: request.collabType,
            requestType: request.requestType,
            message: request.message,
            page: request.page,
            state: request.state,
            meta: request.meta,
        },
        service: {
            title: service.title,
            id: service.id,
        },
    });

    request.convo = conversationId;
    await request.save();

    // notification
    const usecase =
        collabType == C.COLLAB_TYPE.MANAGE
            ? 'manage_export_request'
            : 'refer_export_request';
    const actionName =
        collabType == C.COLLAB_TYPE.MANAGE
            ? 'view_manage_export_request'
            : 'view_refer_export_request';

    await notification.send({
        usecase,
        role: C.ROLES.WRITER_C,
        web: {
            for: {
                id: userId,
                role: C.ROLES.WRITER_C,
            },
            by: {
                id: user.id,
                role: C.ROLES.WRITER_C,
            },
            actions: {
                n: actionName,
                d: {
                    requestId: request.id,
                    collabType: request.collabType,
                },
            },
            createdAt: Date.now(),
            name: user.fullname,
        },
    });
}

/**
 * Controllers
 */

exports.fetchFeedServices = async ({ filters, sorting, page, user }) => {
    // service filters
    const { text, priceMin, priceMax, feesType, rateUnit } = filters;
    if (priceMin >= priceMax)
        throw new BadRequest('priceMax should be greater than priceMin');

    // creator filters
    const { designation, skills, location } = filters;

    // find onboarded creators with creator filter
    const creatorQuery = {
        _id: {
            $ne: user.id,
        },
        obs: C.V3_CREATOR_ONBOARDING_STATES.STEP_DONE,
        // ?? designation, skills
    };

    if (location) {
        creatorQuery['adr.co'] = location;
    }

    const creators = await Creator.find(creatorQuery)
        .select('n adr.ci adr.co pn img pdg')
        .exec();

    // using creator.id wont work in aggregation pipeline
    const creatorIds = _.map(creators, (creator) => creator._id);

    const testimonials = await Block.aggregate([
        {
            $match: {
                __t: C.MODELS.TESTIMONIAL_BLOCK,
                uid: {
                    $in: creatorIds,
                },
                'tstm.req': false,
            },
        },
        {
            $group: {
                _id: '$uid',
                testimonials: {
                    $push: {
                        image: { $arrayElemAt: ['$tstm.img', 0] },
                        company: { $arrayElemAt: ['$tstm.cmp', 0] },
                    },
                },
            },
        },
        {
            $replaceWith: {
                id: '$_id',
                testimonials: { $slice: ['$testimonials', 5] },
            },
        },
    ]);

    const creatorMap = new Map();
    for (let creator of creators) {
        creator = creator.toJSON();
        creatorMap.set(creator.id.toString(), {
            ...creator,
            testimonials: [],
        });
    }

    for (let testimonial of testimonials) {
        let creator = creatorMap.get(testimonial.id.toString());
        creator.testimonials = testimonial.testimonials;
        creatorMap.set(creator.id.toString(), {
            ...creator,
        });
    }

    // ?? Blocks on private pages
    // ?? Prepaid gig service
    //  deliveryTime -> decision to remove
    //  price range to be applied when we have feesType
    // ?? currency
    // ?? Filter already requested services

    let serviceQuery = {
        uid: {
            $in: creatorIds,
        },
        hid: false,
    };

    if (feesType) {
        serviceQuery.ft = feesType;
        if (rateUnit) serviceQuery.ru = rateUnit;
        if (feesType != C.SERVICE_BLOCK_FEES_TYPE) {
            serviceQuery['$and'] = [
                { prc: { $gte: priceMin } },
                { prc: { $lte: priceMax } },
            ];
        }
    }
    if (typeof text == 'string' && text.length > 0) {
        serviceQuery = {
            ...serviceQuery,
            $text: { $search: text },
        };
    }

    let addFields = {
        updatedAt: { $ifNull: ['$updatedAt', '2022-02-22T10:59:12.861Z'] },
        'metric.reach': { $ifNull: ['$metric.reach', 0] },
        'metric.acceptRate': { $ifNull: ['$metric.acceptRate', 0] },
        'metric.ctr': { $ifNull: ['$metric.ctr', 0] },
        'metric.score': { $ifNull: ['$metric.score', 0] },
    };

    const { sortBy, sortOrder } = sorting;

    let sortByQuery = {};

    // sortBy (users input) is always given highest priority
    switch (sortBy) {
        case 'reach':
            sortByQuery = { 'metric.reach': sortOrder };
            break;
        case 'acceptRate':
            sortByQuery = { 'metric.acceptRate': sortOrder };
            break;
        case 'ctr':
            sortByQuery = { 'metric.ctr': sortOrder };
            break;
        case 'postTime':
            sortByQuery = { updatedAt: sortOrder };
            break;
        default:
            // Second priority given to text search
            if (typeof text == 'string' && text.length > 0) {
                sortByQuery = { 'metric.textScore': -1 };
                addFields = {
                    ...addFields,
                    'metric.textScore': { $meta: 'textScore' },
                };
            } else {
                // the default is to sort by score
                sortByQuery = { 'metric.score': -1 };
            }
    }

    const pipeline = [
        {
            $match: serviceQuery,
        },
        {
            $lookup: {
                from: 'servicedatas',
                localField: '_id',
                foreignField: 'sid',
                pipeline: [
                    {
                        $project: {
                            score: '$scr',
                            reach: '$rc',
                            acceptRate: '$acr',
                            ctr: '$ctr',
                        },
                    },
                ],
                as: 'metric',
            },
        },
        {
            $project: {
                _id: 0,
                __t: 'ServiceBlock',
                updatedAt: '$updatedAt',
                feesType: '$ft',
                price: '$prc',
                rateUnit: '$ru',
                currency: '$curr',
                userId: '$uid',
                pageId: '$pid',
                public_url: '$pul',
                title: '$t',
                description: '$desc',
                tags: '$tg',
                category: '$ctg',
                id: '$_id',
                type: C.MODELS.SERVICE_BLOCK,
                metric: { $arrayElemAt: ['$metric', 0] },
            },
        },
        {
            $addFields: addFields,
        },
        { $sort: sortByQuery },
        {
            $skip: 5 * (page - 1),
        },
        {
            $limit: 5,
        },
    ];

    const services = await ServiceBlock.aggregate(pipeline);

    const results = [];
    for (let service of services) {
        let creator = creatorMap.get(service.userId.toString());
        const { acceptRate, activity } = await analyticControllers.getUserStats(
            { user: { id: service.userId.toString() }, refresh: false },
        );
        service.creator = { ...creator, acceptRate, activity };

        // TODO: this is not percentile
        service.reach = assignPercentLabel(service.metric.reach);
        delete service.metric;
        results.push(service);
    }

    return {
        results,
        pageDetails: {
            page,
            hasNextPage: results.length >= 5,
        },
    };
};

exports.fetchFeedProfiles = async ({ filters, sorting, page, user }) => {
    // creator filters
    const { designation, skills, location, text } = filters;

    // find onboarded creators with creator filter
    let creatorQuery = {
        _id: {
            $ne: user._id,
        },
        obs: C.V3_CREATOR_ONBOARDING_STATES.STEP_DONE,
        // ?? designation, skills
    };

    if (location) {
        creatorQuery['adr.co'] = location;
    }

    if (typeof text == 'string' && text.length > 0) {
        // ?? more fields to match
        creatorQuery = {
            ...creatorQuery,
            $text: { $search: text },
        };
    }

    let addFields = {
        'metric.score': { $ifNull: ['$metric.score', 0] },
        'metric.reach': { $ifNull: ['$metric.reach', 0] },
        'metric.activity': { $ifNull: ['$metric.activity', 0] },
        'metric.shared': { $ifNull: ['$metric.shared', 0] },
        'metric.acceptance': { $ifNull: ['$metric.acceptance', 0] },
    };

    let sortByQuery = {};

    const { sortBy, sortOrder } = sorting;

    switch (sortBy) {
        case 'reach':
            sortByQuery = { 'metric.reach': sortOrder };
            break;
        case 'activity':
            sortByQuery = { 'metric.activity': sortOrder };
            break;
        case 'shared':
            sortByQuery = { 'metric.shared': sortOrder };
            break;
        case 'acceptance':
            sortByQuery = { 'metric.acceptance': -sortOrder };
            break;
        default:
            // Second priority given to text search
            if (typeof text == 'string' && text.length > 0) {
                sortByQuery = { 'metric.textScore': -1 };
                addFields = {
                    ...addFields,
                    'metric.textScore': { $meta: 'textScore' },
                };
            } else {
                // the default is to sort by score
                sortByQuery = { 'metric.score': -1 };
            }
    }

    /* const creators = await Creator.find(creatorQuery)
        .select('n adr.ci adr.co pn img lac bio othd.skills')
        .exec(); */

    const pipeline = [
        {
            $match: creatorQuery,
        },
        {
            $lookup: {
                from: 'creatordatas',
                localField: '_id',
                foreignField: 'uid',
                pipeline: [
                    {
                        $project: {
                            score: '$scr',
                            reach: '$rc',
                            activity: '$act',
                            shared: '$shd',
                            acceptance: '$accp',
                        },
                    },
                ],
                as: 'metric',
            },
        },
        {
            $project: {
                _id: 0,
                id: '$_id',
                fullname: '$n.f',
                'address.country': '$adr.co',
                'address.city': '$adr.ci',
                penname: '$pn',
                image: '$img',
                lastActive: '$lac',
                bio: '$bio',
                'otherDetails.skills': '$othd.skills',
                metric: { $arrayElemAt: ['$metric', 0] },
            },
        },
        {
            $addFields: addFields,
        },
        { $sort: sortByQuery },
        {
            $skip: 5 * (page - 1),
        },
        {
            $limit: 5,
        },
    ];

    const creators = await Creator.aggregate(pipeline);

    // using creator.id wont work in aggregation pipeline
    const creatorIds = _.map(creators, (creator) => creator.id);

    const testimonials = await Block.aggregate([
        {
            $match: {
                __t: C.MODELS.TESTIMONIAL_BLOCK,
                uid: {
                    $in: creatorIds,
                },
                'tstm.req': false,
            },
        },
        {
            $group: {
                _id: '$uid',
                testimonials: {
                    $push: {
                        image: { $arrayElemAt: ['$tstm.img', 0] },
                        company: { $arrayElemAt: ['$tstm.cmp', 0] },
                    },
                },
            },
        },
        {
            $replaceWith: {
                id: '$_id',
                testimonials: { $slice: ['$testimonials', 4] },
            },
        },
    ]);

    const testimonialMap = new Map();

    for (let testimonial of testimonials) {
        testimonialMap.set(testimonial.id.toString(), testimonial.testimonials);
    }

    const results = [];

    for (let creator of creators) {
        creator.skills = creator.otherDetails.skills;
        delete creator.otherDetails;
        creator.testimonials = [];
        let tstms = testimonialMap.get(creator.id.toString());
        if (tstms) {
            creator.testimonials = tstms;
        }

        const { acceptRate, activity, reach, totalActiveCollabs } =
            await analyticControllers.getUserStats({
                user: { id: creator.id },
                refresh: false,
            });

        creator.acceptRate = acceptRate;
        creator.activity = activity;
        creator.reach = reach;
        creator.totalActiveCollabs = totalActiveCollabs;
        delete creator.metric;
        results.push(creator);
    }

    return {
        results,
        pageDetails: {
            page,
            hasNextPage: results.length >= 5,
        },
    };
};

exports.sendReferExportRequest = async ({ user, sid, userId, message }) => {
    await createExportRequest({
        user,
        sid,
        userId,
        message,
        collabType: C.COLLAB_TYPE.REFER,
    });

    return {
        msg: 'request sent',
    };
};

exports.sendReferImportRequest = async ({
    user,
    sid,
    pageId,

    message,
}) => {
    await createImportRequest({
        user,
        sid,
        pageId,
        message,
        collabType: C.COLLAB_TYPE.REFER,
    });

    return {
        msg: 'request sent',
    };
};

exports.sendManageImportRequest = async ({
    user,
    sid,
    pageId,

    message,
}) => {
    // ?? Should we allow prepaid gigs to be managed
    await createImportRequest({
        user,
        sid,
        pageId,
        message,
        collabType: C.COLLAB_TYPE.MANAGE,
    });

    return {
        msg: 'request sent',
    };
};

exports.sendManageExportRequest = async ({ user, sid, userId, message }) => {
    // ?? Should we allow prepaid gigs to be managed
    await createExportRequest({
        user,
        sid,
        userId,
        message,
        collabType: C.COLLAB_TYPE.MANAGE,
    });

    return {
        msg: 'request sent',
    };
};

exports.requestAction = async ({ user, id, action, pageId }) => {
    const request = await CollabRequest.findOne({
        _id: id,
        rc: user.id,
    }).exec();

    if (!request) throw new BadRequest('Request was not found');

    if (request.state !== C.COLLAB_REQUEST_STATES.PENDING)
        throw new BadRequest('Action on request was already taken');

    let service = await ServiceBlock.findById(request.sv)
        .select('-pg -pos -ci')
        .exec();

    if (!service)
        throw new BadRequest('The service of this request does not exist');

    // prepaidGig services cannot be imported
    if (service.feesType == C.SERVICE_BLOCK_FEES_TYPE.PREPAID) {
        throw new BadRequest('Prepaid gig services cannot be imported');
    }

    request.state = action;
    // Save current of state service details inside request
    request.m = {
        ...service.toJSON(),
    };

    let pageName = '';
    let position = 'n';

    let newBlockId;

    if (action == C.COLLAB_REQUEST_STATES.ACCEPTED) {
        if (request.requestType === C.COLLAB_REQUEST_TYPE.EXPORT) {
            // * Handles both Refer and Manage

            if (!pageId)
                throw new BadRequest('PageId  required to accept this request');
            // 1. Check if block already imported for same collabType
            // 2. Check if page exists
            // 3. Create Imported block
            // 4. Create Import

            let importDoc = await CollabImport.findOne({
                u: user.id,
                sv: request.sv,
                clt: request.clt,
                st: C.COLLAB_IMPORT_STATES.ACTIVE,
            }).exec();

            if (importDoc)
                throw new BadRequest('This block is already imported');

            const findPage = await Page.findOne({
                uid: user.id,
                _id: pageId,
            }).exec();

            if (!findPage)
                throw new BadRequest('The selected page was not found');

            position = await getFirstPositionInPage(pageId);

            const importedBlock = new ImportedService({
                uid: user.id,
                pid: pageId,
                pos: position,
                clt: request.clt,
                sref: request.sv,
                uref: request.svo,
            });

            // * For managed type store original service data in details fields as it can also be edited my the manager
            if (request.collabType == C.COLLAB_TYPE.MANAGE) {
                importedBlock.title = service.title;
                importedBlock.description = service.description;
                importedBlock.tags = service.tags;
                importedBlock.category = service.category;

                importedBlock.details.feesType = service.feesType;
                importedBlock.details.price = service.price;
                importedBlock.details.rateUnit = service.rateUnit;
                importedBlock.details.deliveryTime = service.currency;
                importedBlock.details.customMessage = service.customMessage;
                importedBlock.details.askMoreFields = service.askMoreFields;
                // importedBlock.details.calendly = service.calendly;
                // should not include calendly link of owner
                importedBlock.details.calendly = "";
            }

            importedBlock.pul = await importedServiceUrl(importedBlock.id);

            importDoc = new CollabImport({
                u: user.id,
                bl: importedBlock.id,
                rq: request.id,
                sv: request.sv,
                svo: request.svo,
                clt: request.clt,
            });

            importedBlock.imp = importDoc.id;
            await importedBlock.save();
            await importDoc.save();

            newBlockId = importedBlock.id;
        } else if (request.requestType === C.COLLAB_REQUEST_TYPE.IMPORT) {
            // * Handles both Refer and Manage

            // 1. Check if block already imported for same collabType
            // 2. Check if page exists
            // 3. Create imported block
            // 4. Create Import
            let importDoc = await CollabImport.findOne({
                u: request.sd,
                sv: request.sv,
                clt: request.clt,
                st: C.COLLAB_IMPORT_STATES.ACTIVE,
            }).exec();

            if (importDoc)
                throw new BadRequest('This block is already imported');

            pageId = request.page;
            position = await getFirstPositionInPage(pageId);

            const findPage = await Page.findOne({
                uid: request.sd,
                _id: pageId,
            }).exec();

            if (!findPage)
                throw new BadRequest(
                    'The selected page was not found on sender',
                );

            pageName = findPage.name;

            const importedBlock = new ImportedService({
                uid: request.sd,
                pid: pageId,
                pos: position,
                clt: request.clt,
                sref: request.sv,
                uref: request.svo,
            });

            // * For managed type store original service data in details fields as it can also be edited my the manager
            if (request.collabType == C.COLLAB_TYPE.MANAGE) {
                importedBlock.title = service.title;
                importedBlock.description = service.description;
                importedBlock.tags = service.tags;
                importedBlock.category = service.category;

                importedBlock.details.feesType = service.feesType;
                importedBlock.details.price = service.price;
                importedBlock.details.rateUnit = service.rateUnit;
                importedBlock.details.deliveryTime = service.currency;
                importedBlock.details.customMessage = service.customMessage;
                importedBlock.details.askMoreFields = service.askMoreFields;
                // importedBlock.details.calendly = service.calendly;
                // should not include calendly link of owner
                importedBlock.details.calendly = "";
            
            }

            importedBlock.pul = await importedServiceUrl(importedBlock.id);

            importDoc = new CollabImport({
                u: request.sd,
                bl: importedBlock.id,
                rq: request.id,
                sv: request.sv,
                svo: request.svo,
                clt: request.clt,
            });

            importedBlock.imp = importDoc.id;

            await importedBlock.save();
            await importDoc.save();

            newBlockId = importedBlock.id;
        } else throw new BadRequest('scenerio not handled');
    }

    await request.save();

    if (action == C.COLLAB_REQUEST_STATES.ACCEPTED) {
        // notification
        await notification.send({
            usecase: `request_accepted_${request.rqt.toLowerCase()}_${request.clt.toLowerCase()}`,
            role: C.ROLES.WRITER_C,
            web: {
                for: {
                    id: request.sd,
                    role: C.ROLES.WRITER_C,
                },
                by: {
                    id: user.id,
                    role: C.ROLES.WRITER_C,
                },
                actions: {
                    n: 'request_accepted',
                    d: {
                        requestId: request.id,
                        collabType: request.collabType,
                        page: pageName,
                    },
                },
                createdAt: Date.now(),
                name: user.fullname,
            },
        });
    }

    // Get response time for posthog event
    let now = moment(new Date());
    let when = moment(request.createdAt);
    let response_time = Math.floor(moment.duration(now.diff(when)).asDays());

    return {
        msg: 'request action taken',
        response_time,
        newBlockId,
    };
};

async function makeImportInactive({ collabImport, user }) {
    if (collabImport.state !== C.COLLAB_IMPORT_STATES.ACTIVE) return;

    collabImport.state = C.COLLAB_IMPORT_STATES.REMOVED;

    let block = await ImportedService.findOne({
        _id: collabImport.bl,
        uid: collabImport.u,
    })
        .populate({
            path: 'sref',
            select: '-pg -cln -askm -cmsg -pos -ci',
        })
        .exec();

    await collabImport.save();

    if (block) {
        block = block.toJSON();

        // store service details in import meta before remove
        if (block.collabType == C.COLLAB_TYPE.MANAGE) {
            collabImport.m = {
                ...block.details,
                title: block.title,
                description: block.description,
            };
        } else {
            collabImport.m = { ...block.serviceRef };
        }

        await collabImport.save();

        await ImportedService.findOneAndDelete({
            _id: collabImport.bl,
            uid: collabImport.u,
        }).exec();

        // send notification

        let receiver,
            sender,
            name = user.fullname,
            serviceTitle = '';
        if (user.id == collabImport.u) {
            receiver = collabImport.svo.id;
            sender = user.id;
        } else {
            receiver = user.id;
            sender = collabImport.svo.id;
        }

        if (collabImport.collabType == C.COLLAB_TYPE.MANAGE) {
            serviceTitle = block.details.title;
        } else {
            serviceTitle = block.serviceRef.title;
        }

        await notification.send({
            usecase: 'import_removed',
            role: C.ROLES.WRITER_C,
            web: {
                for: {
                    id: receiver,
                    role: C.ROLES.WRITER_C,
                },
                by: {
                    id: sender,
                    role: C.ROLES.WRITER_C,
                },
                actions: {
                    n: 'view-import',
                    d: {
                        importId: collabImport.id,
                    },
                },
                createdAt: Date.now(),
                name,
                serviceTitle,
            },
        });
    }
}

exports.removeImport = async ({ user, id }) => {
    // import can be removed by service owner or importer
    const collabImport = await CollabImport.findOne({
        _id: id,
        $or: [
            {
                u: user.id,
            },
            {
                svo: user.id,
            },
        ],
    })
        .populate({
            path: 'svo',
            select: 'n',
        })
        .exec();
    if (!collabImport) throw new BadRequest('The collab import was not found');

    await makeImportInactive({ collabImport, user });

    return {
        msg: 'Import removed',
    };
};

// given a service block this controller removes all imports of that block
exports.removeAllImportsOfBlock = async ({ user, id }) => {
    /*  const service = await ServiceBlock.findOne({
        uid: user.id,
        _id: id,
    }).exec();

    if (!service) throw new BadRequest('service block not found for this user'); */

    // find all active imports
    const imports = await CollabImport.find({
        sv: id,
        svo: user.id,
        st: C.COLLAB_IMPORT_STATES.ACTIVE,
    })
        .populate({
            path: 'svo',
            select: 'n',
        })
        .exec();

    if (imports.length > 0) {
        let totalRemoved = 0;
        for (let collabImport of imports) {
            // TODO: Execute this in parallel
            try {
                await makeImportInactive({ collabImport, user });
                totalRemoved++;
            } catch (err) {}
        }
        if (imports.length !== totalRemoved)
            throw new BadRequest('Unable to remove some imports');
    }

    return {
        msg: 'imports removed',
    };
};

exports.fetchSingleRequest = async ({ user, id }) => {
    let request = await CollabRequest.findOne({
        _id: id,
        $or: [
            {
                sd: user.id,
            },
            {
                rc: user.id,
            },
        ],
    })
        .populate([
            {
                path: 'sd',
                select: 'img n',
            },
            {
                path: 'rc',
                select: 'img n',
            },
            {
                path: 'sv',
                select: '-pg -cln -askm -cmsg -pos -ci',
            },
        ])
        .exec();

    if (!request) throw new BadRequest('Request not found by this id');

    request = request.toJSON();

    request.user =
        user.id == request.sender.id ? request.receiver : request.sender;

    // whether this request is incoming for the user or not
    request.incoming = user.id !== request.sender.id;

    let service = {};

    if (request.service) {
        // original service not deleted
        service = request.service;
    } else {
        service = request.meta;
    }

    request.service = service;

    delete request.sender;
    delete request.receiver;
    delete request.meta;

    return {
        request,
    };
};

exports.fetchSingleImport = async ({ user, id }) => {
    let collabImport = await CollabImport.findOne({
        _id: id,
        $or: [
            {
                u: user.id,
            },
            {
                svo: user.id,
            },
        ],
    })
        .populate([
            {
                path: 'bl',
                select: 't desc pul dta',
            },
            {
                path: 'sv',
                select: '-pg -cln -askm -cmsg -pos -ci',
            },
            {
                path: 'rq',
                select: 'convo',
            },
            {
                path: 'svo',
                select: 'n img pdg adr.co adr.ci',
            },
            {
                path: 'u',
                select: 'n img pdg adr.co adr.ci',
            },
        ])
        .exec();

    if (!collabImport) throw new BadRequest('Import not found');

    collabImport = collabImport.toJSON();

    let service = {};

    if (collabImport.collabType == C.COLLAB_TYPE.MANAGE) {
        if (collabImport.block) {
            // imported block not deleted
            // OR import is still active
            service = {
                id: collabImport.block.id,
                ...collabImport.block.details,
                title: collabImport.block.title,
                description: collabImport.block.description,
            };
        } else {
            service = collabImport.meta;
        }
    } else {
        // original block not deleted
        if (collabImport.service) {
            service = collabImport.service;
        } else {
            service = collabImport.meta;
        }
    }

    delete collabImport.block;
    delete collabImport.service;
    delete collabImport.meta;

    if (
        collabImport.serviceOwner.id == user.id &&
        collabImport.collabType == C.COLLAB_TYPE.MANAGE
    ) {
        delete collabImport.emailsCollected;
    }

    collabImport.service = service;

    collabImport.user =
        user.id == collabImport.user.id
            ? collabImport.serviceOwner
            : collabImport.user;

    collabImport.requestType =
        user.id == collabImport.user.id ? 'import' : 'export';

    return {
        collabImport,
    };
};

exports.fetchAllRequests = async ({ user, incoming, status }) => {
    const query = {};
    if (status) {
        query.st = status;
    }
    if (incoming) query.rc = user._id;
    else query.sd = user._id;

    const sortStage = {
        createdAt: -1,
    };
    const pipeline = [
        { $match: query },
        {
            $sort: sortStage,
        },
        {
            $lookup: {
                from: 'users',
                localField: incoming ? 'sd' : 'rc',
                foreignField: '_id',
                pipeline: [
                    {
                        $project: {
                            _id: 0,
                            id: '$_id',
                            image: '$img',
                            fullname: { $concat: ['$n.f', ' ', '$n.l'] },
                        },
                    },
                ],
                as: 'user',
            },
        },
        {
            $lookup: {
                from: 'blocks',
                localField: 'sv',
                foreignField: '_id',
                pipeline: [
                    {
                        $project: {
                            _id: 0,
                            id: '$_id',
                            title: '$t',
                        },
                    },
                ],
                as: 'service',
            },
        },
        {
            $replaceRoot: {
                newRoot: {
                    id: '$_id',
                    requestType: '$rqt',
                    user: { $arrayElemAt: ['$user', 0] },
                    service: { $arrayElemAt: ['$service', 0] },
                    message: '$msg',
                    state: '$st',
                    title: '$m.title',
                    collabType: '$clt',
                    createdAt: '$createdAt',
                },
            },
        },
        {
            $group: {
                _id: '$requestType',
                requests: {
                    $push: '$$ROOT',
                },
            },
        },
        {
            $project: {
                _id: 0,
                requestType: '$_id',
                requests: '$requests',
            },
        },
    ];

    const results = await CollabRequest.aggregate(pipeline);

    const response = {
        import: [],
        export: [],
    };

    if (results.length == 1) {
        response[results[0].requestType] = results[0].requests;
    }
    if (results.length == 2) {
        response[results[0].requestType] = results[0].requests;
        response[results[1].requestType] = results[1].requests;
    }

    for (let result of response.import) {
        if (result.state == C.COLLAB_REQUEST_STATES.ACCEPTED) {
            result.serviceTitle = result.title ? result.title : '';
        } else {
            let getTitle = '';
            if (result && result.service && result.service.title) {
                getTitle = result.service.title;
            }
            result.serviceTitle = getTitle;
        }
        delete result.title;
        delete result.service;
    }
    for (let result of response.export) {
        if (result.state == C.COLLAB_REQUEST_STATES.ACCEPTED) {
            result.serviceTitle = result.title ? result.title : '';
        } else {
            let getTitle = '';
            if (result && result.service && result.service.title) {
                getTitle = result.service.title;
            }
            result.serviceTitle = getTitle;
        }
        delete result.title;
        delete result.service;
    }

    return {
        ...response,
    };
};

exports.fetchAllImports = async ({ user, collabType }) => {
    const query = {
        $or: [
            {
                u: user._id,
            },
            {
                svo: user._id,
            },
        ],
    };
    if (collabType !== 'all') {
        query.clt = collabType;
    }

    const sortStage = {
        createdAt: -1,
    };
    const pipeline = [
        { $match: query },
        {
            $sort: sortStage,
        },
        {
            $lookup: {
                from: 'users',
                localField: 'u',
                foreignField: '_id',
                pipeline: [
                    {
                        $project: {
                            _id: 0,
                            id: '$_id',
                            image: '$img',
                            fullname: { $concat: ['$n.f', ' ', '$n.l'] },
                        },
                    },
                ],
                as: 'user',
            },
        },
        {
            $lookup: {
                from: 'users',
                localField: 'svo',
                foreignField: '_id',
                pipeline: [
                    {
                        $project: {
                            _id: 0,
                            id: '$_id',
                            image: '$img',
                            fullname: { $concat: ['$n.f', ' ', '$n.l'] },
                        },
                    },
                ],
                as: 'serviceOwner',
            },
        },
        {
            $lookup: {
                from: 'collabrequests',
                localField: 'rq',
                foreignField: '_id',
                pipeline: [
                    {
                        $project: {
                            _id: 0,
                            id: '$_id',
                            requestType: '$rqt',
                            conversation: '$convo',
                        },
                    },
                ],
                as: 'request',
            },
        },
        {
            $lookup: {
                from: 'blocks',
                localField: 'bl',
                foreignField: '_id',
                pipeline: [
                    {
                        $project: {
                            _id: 0,
                            id: '$_id',
                            title: '$t',
                            details: '$dta',
                        },
                    },
                ],
                as: 'block',
            },
        },
        {
            $lookup: {
                from: 'blocks',
                localField: 'sv',
                foreignField: '_id',
                pipeline: [
                    {
                        $project: {
                            _id: 0,
                            id: '$_id',
                            title: '$t',
                        },
                    },
                ],
                as: 'service',
            },
        },
        {
            $replaceRoot: {
                newRoot: {
                    id: '$_id',
                    request: { $arrayElemAt: ['$request', 0] },
                    collabType: '$clt',
                    user: { $arrayElemAt: ['$user', 0] },
                    serviceOwner: { $arrayElemAt: ['$serviceOwner', 0] },
                    block: { $arrayElemAt: ['$block', 0] },
                    service: { $arrayElemAt: ['$service', 0] },
                    state: '$st',
                    createdAt: '$createdAt',
                    meta: '$m',
                },
            },
        },
    ];

    const results = await CollabImport.aggregate(pipeline);

    const imports = [];
    for (let result of results) {
        let obj = {
            id: result.id,
            requestId: result.request.id,
            requestType: user.id == result.user.id ? 'import' : 'export',
            collabType: result.collabType,
            user: user.id == result.user.id ? result.serviceOwner : result.user,
            serviceTitle: '',
            state: result.state,
            conversation: result.request.conversation,
            createdAt: result.createdAt,
        };

        let serviceTitle = '';

        if (result.collabType == C.COLLAB_TYPE.MANAGE) {
            if (result.block) {
                // imported block not deleted
                // OR import is still active
                if (result.block && result.block.title)
                    serviceTitle = result.block.title;
            } else {
                if (result.meta && result.meta.title)
                    serviceTitle = result.meta.title;
            }
        } else {
            // original block not deleted
            if (result.service) {
                if (result.service && result.service.title)
                    serviceTitle = result.service.title;
            } else {
                if (result.meta && result.meta.title)
                    serviceTitle = result.meta.title;
            }
        }
        obj.serviceTitle = serviceTitle;
        imports.push(obj);
    }

    return {
        imports,
    };
};

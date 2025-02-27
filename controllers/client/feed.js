/*
 * Module Dependencies
 */
const mongoose = require('mongoose');
const debug = require('debug')('client');
debug.enabled = true;
const moment = require('moment');
const _ = require('lodash');
const C = require('../../lib/constants');
const { CONVERSATION_STATUS, CREATOR_LEVEL } = C;

// Models
const User = mongoose.model(C.MODELS.USER_C);
const Creator = mongoose.model(C.MODELS.WRITER_C);
const PM = mongoose.model(C.MODELS.PM_C);
const Project = mongoose.model(C.MODELS.PROJECT);
const ConversationClient = mongoose.model(C.MODELS.CONVERSATION_CLIENT);
const { BadRequest } = require('../../lib/errors');

const { rankedResult } = require('../helpers/clientHelpers');

/**
 *
 * @version 2.1
 */
/**
 * Get conversation if exists between client and creator
 */
exports.getConversation = async ({ client, id }) => {
    let conversation = await ConversationClient.findOne({
        u1: client._id,
        u2: id,
        st: CONVERSATION_STATUS.CREATED,
    })
        .populate({ path: 'u2', select: 'n' })
        .exec();
    let response = { inboxDetails: null };
    if (conversation) {
        response['inboxDetails'] = {
            fullname: conversation.u2.fullname,
            state: conversation.state,
            conversationId: conversation.id,
            type: C.CONVERSATION_TYPE.INBOX,
            __t: conversation.__t,
        };
    }
    return response;
};
exports.shortlistCreatorPortfolio = async ({ client, pid }) => {
    if (client.shortlisted.includes(pid))
        throw new BadRequest('User already shortlisted');
    // Client can shortlist both creators and PMs
    const getCreator = await User.findOne({
        _id: pid,
        __t: { $in: [C.MODELS.WRITER_C, C.MODELS.PM_C] },
    }).exec();
    if (getCreator.level && getCreator.level == CREATOR_LEVEL.CLASSIFIED)
        throw new BadRequest(
            'Shortlisting a classified creator is not allowed',
        );
    client.shortlisted.push(pid);
    await client.save();
    return {
        msg: 'user shortlisted',
    };
};
exports.getShortlistedPortfolios = async ({ client, filters }) => {
    const { search, fastResponse, priceMin, priceMax, city } = filters;
    if (priceMax < priceMin)
        throw new BadRequest('Min price should be less than max price');
    /**
     * Filter Creators
     */
    const creatorQuery = {
        _id: { $in: client.sht },
        $and: [
            {
                $or: [
                    { 'n.f': { $regex: search, $options: '-i' } },
                    { 'n.l': { $regex: search, $options: '-i' } },
                ],
            },
            {
                $and: [
                    { phc: { $gte: priceMin } },
                    { phc: { $lte: priceMax } },
                ],
            },
        ],
        __t: { $in: [C.MODELS.WRITER_C, C.MODELS.PM_C] },
        // * Show results from clients country only
        'adr.co': client.adr.co,
    };
    if (city) {
        creatorQuery['adr.ci'] = city;
    }
    if (fastResponse) {
        // Return creators online in the past two days only
        creatorQuery['lac'] = { $gte: new Date(moment().subtract(2, 'day')) };
    }
    /**
     * Get all portfolios client has invited
     */
    const findInvited = await ConversationClient.find({
        u1: client._id,
        st: C.CONVERSATION_STATUS.CREATED,
    }).exec();
    const findInvitedIds = findInvited.map((convo) => {
        return convo.u2.toString();
    });
    const result = await User.find(creatorQuery)
        .select('n pn stid dsg id adr pdg img phc')
        .exec();
    const creators = result.map((creator) => {
        toSend = creator.toJSON();
        toSend.invited = false;
        if (findInvitedIds.includes(toSend.id)) {
            toSend.invited = true;
        }
        /* TBD
        if (toSend.address.country == C.CURRENCY_COUNTRY.INDIA) {
            toSend.currency = C.CURRENCY.INR;
        } else {
            toSend.currency = C.CURRENCY.USD;
        }
        */
        toSend.currency = C.CURRENCY.USD;
        delete toSend.address.street;
        delete toSend.address.state;
        delete toSend.address.pincode;
        delete toSend.name;
        return toSend;
    });
    return {
        shortlisted: creators,
    };
};

exports.createClientFeed = async ({ client, filters }) => {
    // TODO: Order of updated project, published long form
    const {
        projectType,
        category,
        industry,
        fastResponse,
        budgetMin,
        budgetMax,
        city,
        keywords,
        // Studio
        fromTeams,
        pmRating,
        cursor,
        limit,
    } = filters;
    if (budgetMax < budgetMin)
        throw new BadRequest('Min budget should be less than max budget');
    /**
     * Filter Creators
     */
    let creatorQuery = {};
    if (fromTeams) {
        creatorQuery = {
            'sstats.crrat': { $gte: pmRating },
            // * Show results from clients country only
            'adr.co': client.adr.co,
        };
    } else {
        creatorQuery = {
            lv: CREATOR_LEVEL.NORMAL,
            // [budgetMin, budgetMax] should overlap with [minb, maxb]
            $and: [
                { minb: { $gte: budgetMin } },
                { minb: { $lte: budgetMax } },
            ],
            // * Show results from clients country only
            'adr.co': client.adr.co,
        };
    }

    if (city) {
        creatorQuery['adr.ci'] = city;
    }

    if (fastResponse) {
        // Return creators online in the past two days only
        creatorQuery['lac'] = { $gte: new Date(moment().subtract(10, 'day')) };
    }
    let creators = [];
    if (fromTeams) creators = await PM.find(creatorQuery).exec();
    else {
        creators = await Creator.find(creatorQuery).exec();
    }
    const creatorIds = creators.map((creator) => {
        return creator._id;
    });
    /**
     * Filter Projects
     */
    let query = { cid: { $in: creatorIds } };

    if (projectType == C.PROJECT_TYPES.LONG_FORM) {
        query.__t = C.MODELS.LONG_FORM;
        query.pblc = true;
    } else if (projectType == C.PROJECT_TYPES.SHORT_FORM) {
        query.__t = C.MODELS.CARDS;
        query.cty = C.CARD_TYPES.SHORT_FORM;
    } else {
        query.__t = C.MODELS.CARDS;
        query.cty = C.CARD_TYPES.DESIGN;
    }
    if (category) {
        // query['$or'] = [{ ptg: category }, { ctg: category }];
        query.ctg = category;
    }
    if (industry) {
        query.iny = industry;
    }
    if (keywords) {
        query['$text'] = { $search: keywords };
    }
    /**
     * Apply query + options + paginate
     */
    if (cursor) {
        query = { ...query, puid: { $lt: cursor } };
    }
    const options = {
        limit: limit,
        sort: { puid: -1 },
    };
    const results = await Project.find(query, null, options);
    /**
     * Update cursor
     */
    let next_cursor = '';
    if (results.length > 0) {
        next_cursor = results[results.length - 1].puid;
    }
    /**
     * Customize
     */
    const projects = results.map((project) => {
        toSend = project.toJSON();
        if (toSend.projectType == C.PROJECT_TYPES.LONG_FORM) {
            let coverImage = '';
            if (toSend.images.length > 0) {
                coverImage = toSend.images[0].thumbnail;
            }
            toSend.image = coverImage;
            delete toSend.images;
            delete toSend.fileUrl;
        }
        if (toSend.projectType == C.PROJECT_TYPES.DESIGN) {
            if (toSend.images.length > 0) {
                toSend.images = toSend.images.slice(0, 1);
            }
        }
        return toSend;
    });
    return {
        projects,
        pageDetails: {
            next_cursor,
            limit,
        },
    };
};

exports.createClientFeedRanked = async ({ client, filters }) => {
    // TODO: Order of updated project, published long form
    const {
        projectType,
        category,
        industry,
        fastResponse,
        budgetMin,
        budgetMax,
        city,
        keywords,
        // Studio
        fromTeams,
        pmRating,
        limit,
        page,
    } = filters;
    if (budgetMax < budgetMin)
        throw new BadRequest('Min budget should be less than max budget');
    /**
     * Filter Creators
     */
    let creatorQuery = {};
    if (fromTeams) {
        creatorQuery = {
            'sstats.crrat': { $gte: pmRating },
            // * Show results from clients country only
            'adr.co': client.adr.co,
        };
    } else {
        creatorQuery = {
            lv: CREATOR_LEVEL.NORMAL,
            // [budgetMin, budgetMax] should overlap with [minb, maxb]
            $and: [
                { minb: { $gte: budgetMin } },
                { minb: { $lte: budgetMax } },
            ],
            // * Show results from clients country only
            'adr.co': client.adr.co,
        };
    }

    if (city) {
        creatorQuery['adr.ci'] = city;
    }

    if (fastResponse) {
        // Return creators online in the past 30 days only
        creatorQuery['lac'] = { $gte: new Date(moment().subtract(30, 'day')) };
    }
    let creators = [];
    if (fromTeams) creators = await PM.find(creatorQuery).exec();
    else {
        creators = await Creator.find(creatorQuery).exec();
    }
    const creatorIds = creators.map((creator) => {
        return creator._id;
    });
    /**
     * Filter Projects
     */
    let query = { cid: { $in: creatorIds } };

    // Project type
    if (projectType == C.PROJECT_TYPES.LONG_FORM) {
        query.__t = C.MODELS.LONG_FORM;
        query.pblc = true;
    } else if (projectType == C.PROJECT_TYPES.SHORT_FORM) {
        query.__t = C.MODELS.CARDS;
        query.cty = C.CARD_TYPES.SHORT_FORM;
    } else {
        query.__t = C.MODELS.CARDS;
        query.cty = C.CARD_TYPES.DESIGN;
    }

    // Project metadata
    if (category) {
        query['ctg'] = category;
    }
    if (industry) {
        query.iny = industry;
    }
    if (keywords) {
        query['$text'] = { $search: keywords };
    }
    // If category or industry is not given
    // Use it from client preferences
    if (!category && !industry) {
        if (client.fp.cty.length > 0 || client.fp.ind) {
            query['$or'] = [
                { ctg: { $in: client.fp.cty } },
                { iny: client.fp.ind },
            ];
        }
    }
    // console.log(query);

    const results = await Project.find(query, null)
        .sort({
            scr: -1,
        })
        .skip((page - 1) * limit)
        .limit(limit)
        .exec();

    /**
     * Customize
     */
    const projects = results.map((project) => {
        toSend = project.toJSON();
        if (toSend.projectType == C.PROJECT_TYPES.LONG_FORM) {
            let coverImage = '';
            if (toSend.images.length > 0) {
                coverImage = toSend.images[0].thumbnail;
            }
            toSend.image = coverImage;
            delete toSend.images;
            delete toSend.fileUrl;
        }
        if (toSend.projectType == C.PROJECT_TYPES.DESIGN) {
            if (toSend.images.length > 0) {
                toSend.images = toSend.images.slice(0, 1);
            }
        }
        return toSend;
    });
    return {
        projects,
        pageDetails: {
            page,
            limit,
        },
    };
};

/**
 * Collect Feed preferences
 * Form shown on empty feed
 */
exports.clientFeedPreferences = async ({ client, data }) => {
    client.fp = { submitted: true, ...data };
    await client.save();
    return {
        msg: 'Feed Preferences saved',
    };
};

exports.getFeedPreferences = async ({ client }) => {
    return {
        feedPreferences: client.fp,
    };
};

/*
 * Module Dependencies
 */
const mongoose = require('mongoose');
const debug = require('debug')('pm');
debug.enabled = true;
const moment = require('moment');
const _ = require('lodash');
const C = require('../../lib/constants');
const { CREATOR_LEVEL } = C;

// Models
const Creator = mongoose.model(C.MODELS.WRITER_C);
const Project = mongoose.model(C.MODELS.PROJECT);
const ConversationClient = mongoose.model(C.MODELS.CONVERSATION_CLIENT);
const ConversationPM = mongoose.model(C.MODELS.CONVERSATION_PM);
const { BadRequest } = require('../../lib/errors');

// Feed Controllers

exports.shortlistCreatorPortfolio = async ({ pm, pid }) => {
    if (pm.shortlisted.includes(pid))
        throw new BadRequest('User already shortlisted');
    const getCreator = await Creator.findById(pid).exec();
    if (getCreator.level == CREATOR_LEVEL.CLASSIFIED)
        throw new BadRequest(
            'Shortlisting a classified creator is not allowed',
        );
    pm.shortlisted.push(pid);
    await pm.save();
    return {
        msg: 'creator shortlisted',
    };
};
exports.getShortlistedPortfolios = async ({ pm, filters }) => {
    const { search, fastResponse, priceMin, priceMax, city } = filters;
    if (priceMax < priceMin)
        throw new BadRequest('Min price should be less than max price');
    /**
     * Filter Creators
     */
    const creatorQuery = {
        _id: { $in: pm.sht },
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
        // * Show results from clients country only
        'adr.co': pm.adr.co,
    };
    if (city) {
        creatorQuery['adr.ci'] = city;
    }
    if (fastResponse) {
        // Return creators online in the past two days only
        creatorQuery['lac'] = { $gte: new Date(moment().subtract(2, 'day')) };
    }
    /**
     * Get all portfolios creator has invited
     */
    const findInvited = await ConversationPM.find({
        u1: pm._id,
        st: C.CONVERSATION_STATUS.CREATED,
    }).exec();
    const findInvitedIds = findInvited.map((convo) => {
        return convo.u2.toString();
    });
    const result = await Creator.find(creatorQuery)
        .select('n pn id adr pdg img phc')
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

exports.createFeedOfCreators = async ({ pm, filters }) => {
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
        cursor,
        limit,
    } = filters;
    if (budgetMax < budgetMin)
        throw new BadRequest('Min budget should be less than max budget');
    /**
     * Filter Creators
     */
    const creatorQuery = {
        lv: CREATOR_LEVEL.NORMAL,
        // [budgetMin, budgetMax] should overlap with [minb, maxb]
        $and: [{ minb: { $gte: budgetMin } }, { minb: { $lte: budgetMax } }],
        // * Show results from pms country only
        'adr.co': pm.adr.co,
    };
    if (city) {
        creatorQuery['adr.ci'] = city;
    }

    if (fastResponse) {
        // Return creators online in the past two days only
        creatorQuery['lac'] = { $gte: new Date(moment().subtract(2, 'day')) };
    }
    const creators = await Creator.find(creatorQuery).exec();
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
        query['$or'] = [{ ptg: category }, { ctg: category }];
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

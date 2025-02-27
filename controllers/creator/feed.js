/*
 * Module Dependencies
 */
const mongoose = require('mongoose');
const _ = require('lodash');
const moment = require('moment');
const C = require('../../lib/constants');
const env = require('../../config/env');
const jwt = require('../../lib/jwt');
const sanitizeHtml = require('sanitize-html');
const debug = require('debug')('creator');
debug.enabled = true;
const { BadRequest } = require('../../lib/errors');

/**
 * Models
 */
const PM = mongoose.model(C.MODELS.PM_C);
const Project = mongoose.model(C.MODELS.PROJECT);
const ConversationPM = mongoose.model(C.MODELS.CONVERSATION_PM);
const Message = mongoose.model(C.MODELS.MESSAGE);

exports.studioFeed = async ({ creator, filters }) => {
    const {
        studioType,
        activeMembers,
        studioProjects,
        pmRating,
        city,
        studioName,
        page,
    } = filters;
    let query = {
        'sstats.crrat': { $gte: pmRating },
        acst: C.ACCOUNT_STATUS.ACTIVE,
    };
    if (city) query = { ...query, 'adr.ci': city };
    if (studioName)
        query = { ...query, 'stdd.nm': { $regex: studioName, $options: '-i' } };
    let sort = {
        'sstats.stp': studioProjects,
    };
    const options = {
        sort,
        select:
            'stdd.img stdd.nm stdd.dsc sstats.stp sstats.totcop sstats.totd n img dsg tstm',
        page: page,
        limit: 20,
    };
    const allStudios = await PM.paginate(query, options);
    let conversations = await ConversationPM.find({
        u2: creator.id,
    })
        .select('_id')
        .exec();
    conversations = _.map(conversations, (convo) => {
        return convo.id;
    });
    const inviteOrRequest = await Message.find({
        convoId: { $in: conversations },
        __t: { $in: [C.MODELS.STUDIO_INVITE, C.MODELS.STUDIO_REQUEST] },
    }).exec();
    const senders = new Set();
    _.forEach(inviteOrRequest, (invite) => {
        senders.add(invite.sd.toString());
    });
    // console.log(allStudios);
    const studios = [];
    await Promise.all(
        _.map(allStudios.docs, async (studio) => {
            studio = studio.toJSON();
            studio.testimonials = studio.testimonials.filter(
                (testimonial) =>
                    testimonial.isPublic && testimonial.isBookmarked,
            );
            const recent3Projects = await Project.find({
                cid: studio.id,
                $or: [
                    // For all except longForm
                    { lst: { $exists: false } },
                    //  For long form
                    {
                        $and: [
                            { __t: C.MODELS.LONG_FORM },
                            { lst: C.LONG_FORM_STATES.SAVED },
                            { pblc: true },
                        ],
                    },
                ],
            })
                .select('t desc pul img')
                .sort({ puid: -1 })
                .limit(3)
                .exec();
            const samples = [];
            for (let post of recent3Projects) {
                toSend = post.toJSON();
                // Only Send Cover Image for long form
                // Cover Image is first image
                if (toSend.__t == C.MODELS.LONG_FORM) {
                    let coverImage = '';
                    if (toSend.images.length > 0) {
                        coverImage = toSend.images[0].thumbnail;
                    }
                    toSend.image = coverImage;
                    delete toSend.images;
                }
                samples.push(toSend);
            }
            studio.samples = samples;
            studio.isRequested =
                senders.has(studio.id) || senders.has(creator.id);
            studios.push(studio);
        }),
    );
    delete allStudios.docs;
    const pageDetails = allStudios;
    return { studios, pageDetails };
};

exports.getConnectedStudios = async ({ creator }) => {
    let conversations = await ConversationPM.find({
        u2: creator.id,
    })
        .select('u1 sta')
        .populate({ path: 'u1', select: 'n dsg img stdd.nm stdd.img stdd.dsc' })
        .exec();
    const studios = [];
    _.forEach(conversations, (convo) => {
        convo = convo.toJSON();
        convo.user = convo.user1;
        delete convo.user1;
        studios.push(convo);
    });
    return { studios };
};

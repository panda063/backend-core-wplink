/*
 * Module Dependencies
 */
const mongoose = require('mongoose');
const _ = require('lodash');
const moment = require('moment');
const C = require('../lib/constants');
const env = require('../config/env');
const { BadRequest } = require('../lib/errors');
const debug = require('debug')('creator');
debug.enabled = true;
// const NOTIF_C = require('../config/notification');

// Models
const PM = mongoose.model(C.MODELS.PM_C);
const Creator = mongoose.model(C.MODELS.WRITER_C);

/**
 * How can creators join studio
 * 1. Creators request to join was accepted
 * 2. Pm's invite was accpeted by creator
 * Note: When Pm hires creator that also starts the conversation but creator is not added to studio. To join, creators need to fulfill any of above two conditions
 */
exports.addCreatorToStudio = async ({ pmId, creatorId }) => {
    const pm = await PM.findOne({
        _id: pmId,
    }).exec();
    if (!pm) throw new BadRequest('Studio not found');
    const findCreator = await Creator.findById(creatorId).exec();
    if (!findCreator) throw new BadRequest('Creator not found');
    const memberIds = pm.mmb.map((member) => {
        return member.uid.toString();
    });
    if (!memberIds.includes(creatorId)) {
        pm.mmb.push({
            uid: creatorId,
        });
        if (findCreator.cty == C.CREATOR_TYPES.WRITER) {
            pm.sstats.totcop += 1;
        }
        if (findCreator.cty == C.CREATOR_TYPES.DESIGNER) {
            pm.sstats.totd += 1;
        }
    }
    await pm.save();
    return {
        msg: 'Creator added to studio',
    };
};

exports.updateStudioStats = async ({ pmId, studioProjects, collabCount }) => {
    const pm = await PM.findOne({
        _id: pmId,
    }).exec();
    if (!pm) throw new BadRequest('Studio not found');
    if (studioProjects) {
        pm.sstats.stp += 1;
    }
    if (collabCount) {
        pm.sstats.colc += 1;
    }
    await pm.save();
    return {
        msg: 'Stats updated',
    };
};

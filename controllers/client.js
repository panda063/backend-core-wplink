/*
 * Module Dependencies
 */
const mongoose = require('mongoose');
const debug = require('debug')('client');
debug.enabled = true;
const env = require('../config/env');
const _ = require('lodash');
const jwt = require('../lib/jwt');
const C = require('../lib/constants');

// Models
const Client = mongoose.model(C.MODELS.CLIENT_C);
const Creator = mongoose.model(C.MODELS.WRITER_C);
const User = mongoose.model(C.MODELS.USER_C);
const TestimonialBlock = mongoose.model(C.MODELS.TESTIMONIAL_BLOCK);

// Errors
const { BadRequest } = require('../lib/errors');

// Services
const { updateStateAndPersist } = require('./fileStore');
const { createEmailFindRegex } = require('../services/db/user');

// Testimonial Controllers
// @version2

exports.verifyTestimonialRequest = async ({ token }) => {
    // verify token
    const decoded = await jwt.validateToken({ token });
    const { creatorId, email } = decoded.data;
    const client = await Client.findOne({
        e: createEmailFindRegex({ email }),
    }).exec();
    const creator = await User.findById(creatorId).exec();
    if (!creator)
        throw new BadRequest('invalid creator OR creator not found', 'CRGN100');
    if (client)
        return {
            msg: 'token verified',
            company: client.cn,
            creatorName: creator.n.f + ' ' + (creator.n.l ? creator.n.l : ''),
        };
    return {
        msg: 'token verified',
        creatorName: creator.n.f + ' ' + (creator.n.l ? creator.n.l : ''),
    };
};

exports.giveTestimonial = async ({ testimonialData, files }) => {
    const decoded = await jwt.validateToken({ token: testimonialData.token });
    const { creatorId, email, client_type, testimonialId } = decoded.data;

    const creator = await User.findById(creatorId).exec();
    if (!creator)
        throw new BadRequest('invalid creator OR creator not found', 'CRGN100');

    let invalid = true;

    for (let tr of creator.tstm) {
        if (tr.email === email && tr.req === true) {
            invalid = false;
            tr.received = true;
        }
    }

    if (invalid)
        throw new BadRequest('invalid testimonial operation', 'CLPR101');

    let logo = '';
    // Use Uploaded image if upload success
    if (Array.isArray(files) && files.length > 0) logo = files[0].location;

    let isVerified = false; // is on platform client
    let company = testimonialData.company;

    // When testimonial is provided by an on-platform client, it is a verified testimonial
    const client = await Client.findOne({
        e: createEmailFindRegex({ email }),
    }).exec();

    if (client && client_type == 'on-platform') {
        isVerified = true;
        company = client.cn;
        // If no image upload then use client image
        if (logo.length == 0) logo = client.img;

        // newTestimonial.verified = true;
    }

    const testimonial = creator.tstm.id(testimonialId);

    testimonial.req = false;
    testimonial.verified = isVerified;
    testimonial.img = logo;
    testimonial.reviewText = testimonialData.reviewText;
    testimonial.cmp = company;

    await creator.save();

    return { msg: 'testimonial sent successfully' };
};

// Version 3.1

exports.verifyTestimonialRequestV3 = async ({ token }) => {
    // verify token
    const decoded = await jwt.validateToken({ token });
    const { creatorId, email } = decoded.data;
    const client = await Client.findOne({
        e: createEmailFindRegex({ email }),
    }).exec();
    const creator = await User.findById(creatorId).exec();
    if (!creator)
        throw new BadRequest('invalid creator OR creator not found', 'CRGN100');
    if (client)
        return {
            msg: 'token verified',
            company: client.cn,
            creatorName: creator.n.f + ' ' + (creator.n.l ? creator.n.l : ''),
        };
    return {
        msg: 'token verified',
        creatorName: creator.n.f + ' ' + (creator.n.l ? creator.n.l : ''),
    };
};

exports.giveTestimonialV3 = async ({ testimonialData }) => {
    const decoded = await jwt.validateToken({ token: testimonialData.token });
    const { creatorId, email, client_type, testimonialId } = decoded.data;

    const testimonialBlock = await TestimonialBlock.findOne({
        uid: creatorId,
        'tstm._id': testimonialId,
    }).exec();
    if (!testimonialBlock)
        throw new BadRequest(
            'No Testimonial block found with this testimonial',
            'CRGN100',
        );

    let invalid = true;

    for (let tr of testimonialBlock.tstm) {
        if (tr.email === email && tr.req === true) {
            invalid = false;
            tr.received = true;
        }
    }

    if (invalid)
        throw new BadRequest('invalid testimonial operation', 'CLPR101');

    let logo = '';
    // Use Uploaded image if upload success
    if (testimonialData.fileId) {
        const [file] = await updateStateAndPersist({
            fileIds: [testimonialData.fileId],
            allowedTypes: ['image'],
        });
        const originalPath = `${env.S3_BUCKET_WEBSITE_URL}/${file.key}`;
        logo = originalPath;
    }

    let isVerified = false; // is on platform client
    let company = testimonialData.company;

    // When testimonial is provided by an on-platform client, it is a verified testimonial
    const client = await Client.findOne({
        e: createEmailFindRegex({ email }),
    }).exec();

    if (client && client_type == 'on-platform') {
        isVerified = true;
        company = client.cn;
        // If no image upload then use client image
        if (logo.length == 0) logo = client.img;

        // newTestimonial.verified = true;
    }

    const testimonial = testimonialBlock.tstm.id(testimonialId);

    testimonial.req = false;
    testimonial.verified = isVerified;
    testimonial.img = logo;
    testimonial.reviewText = testimonialData.reviewText;
    testimonial.cmp = company;

    await testimonialBlock.save();

    return { msg: 'testimonial sent successfully' };
};

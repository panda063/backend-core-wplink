/*
 * Module Dependencies
 */
const mongoose = require('mongoose');
const debug = require('debug')('client');
debug.enabled = true;
const moment = require('moment');
const _ = require('lodash');
const C = require('../../lib/constants');

// Models
const Client = mongoose.model(C.MODELS.CLIENT_C);
const Organisation = mongoose.model(C.MODELS.ORGANISATION_C);
const { BadRequest } = require('../../lib/errors');

exports.getClientProfile = async function getClientProfile({ client }) {
    const clientProfile = await Client.findById(client.id)
        .select('organisation n adr.ci adr.co designation cn img pfs')
        .populate('organisation')
        .exec();
    if (!clientProfile) {
        throw new BadRequest('NO_SUCH_CLIENT');
    }
    return {
        ...clientProfile.toJSON(),
    };
};
// Testimonial Controllers
// @version2

exports.updatePersonalInfo = async ({
    client,
    firstName,
    lastName,
    // country,
    city,
    designation,
}) => {
    client.n = { f: firstName, l: lastName };
    client.adr.ci = city;
    // client.adr.co = country;
    client.designation = designation;
    if (client.pfs == C.CLIENT_PROFILE_STATUS.PERSONAL_DETAILS_PENDING)
        client.pfs = C.CLIENT_PROFILE_STATUS.ORGANISATION_DETAILS_PENDING;
    await client.save();
    return {
        msg: 'Personal Info Updated',
        profileStatus: client.pfs,
    };
};

exports.updateOrganisationInfo = async ({
    client,
    postingAs,
    name,
    description,
    sectors,
    website,
    socialMedia,
}) => {
    let clientOrganisation = await Organisation.findById(client.organisation);
    if (!clientOrganisation) {
        clientOrganisation = new Organisation({});
    }
    clientOrganisation.postingAs = postingAs;
    clientOrganisation.name = name;
    clientOrganisation.desc = description;
    clientOrganisation.sectors = sectors;
    clientOrganisation.website = website;
    clientOrganisation.socialMedia = socialMedia;

    client.organisation = clientOrganisation._id;
    client.cn = name;
    if (client.pfs == C.CLIENT_PROFILE_STATUS.ORGANISATION_DETAILS_PENDING)
        client.pfs = C.CLIENT_PROFILE_STATUS.ORGANISATION_DETAILS_COMPLETED;
    await clientOrganisation.save();
    await client.save();
    return {
        msg: 'Organisation info updated',
        profileStatus: client.pfs,
    };
};

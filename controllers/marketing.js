const mongoose = require('mongoose');

const jwt = require('../lib/jwt');
const env = require('../config/env');
const C = require('../lib/constants');
const { v4: uuidv4, version, validate } = require('uuid');

const MarketingReferral = mongoose.model('MarketingReferral');

const { BadRequest } = require('../lib/errors');

const { notification } = require('../messaging/index');
const agenda = require('../services/agenda');
const { createEmailFindRegex } = require('../services/db/user');

function uuidValidateV4(uuid) {
    return validate(uuid) && version(uuid) === 4;
}

async function sendFirstEmail(user, name) {
    /* const referralJwt = await jwt.generateToken({
        data: {
            whoEmail: user.email,
            whoReferId: user.refId,
        },
    }); */
    const referralLink = `${env.FRONTEND_URL}/cold-email-strategy/${user.refId}`;

    const resourceJwt = await jwt.generateToken({
        data: {
            id: user.id,
        },
    });
    const resourceLink = `${env.FRONTEND_URL}/cold-email-strategy/resource/${resourceJwt}`;

    await notification.send({
        usecase: 'referral_loop_one',
        role: C.ROLES.WRITER_C,
        email: {
            email: user.email,
            name,
            link: referralLink,
            resource: resourceLink,
        },
    });
}

async function sendDirectAccessEmail(user) {
    await notification.send({
        usecase: 'freelance_success_blueprint',
        role: C.ROLES.WRITER_C,
        email: {
            email: user.email,
        },
    });
}

async function startNurturing(user, name) {
    agenda.schedule('after 1 hour', 'referral_loop_three', {
        email: user.email,
        name,
    });

    agenda.schedule('after 1 days', 'referral_loop_four', {
        email: user.email,
        name,
    });

    agenda.schedule('after 2 days', 'referral_loop_five', {
        email: user.email,
        name,
    });
    agenda.schedule('after 3 days', 'referral_loop_six', {
        email: user.email,
        name,
    });
}

// TODO:
// * ISSUES:
// * How to make links secure so that users dont share it among themselves
// * (Resolved)No email verification step currently - Someone could use their own link and type 3 random emails to get the reward

exports.registerUser = async ({
    email,
    name,
    role,
    revenue,
    token,
    directAccess,
}) => {
    let user = await MarketingReferral.findOne({
        e: createEmailFindRegex({ email }),
    }).exec();
    if (user) {
        // If already registered, only resend first email
        if (directAccess) {
            // with direct access, send the link to final resource directly
            // this is part of a different campaign which does not have the referral flow
            await sendDirectAccessEmail(user);
        } else await sendFirstEmail(user, name);
        return {
            msg: 'Already Registered. First email sent',
        };
    }

    user = new MarketingReferral({
        e: email,
        name,
        role,
        revenue,
        refId: uuidv4(),
    });

    // Send First email
    if (directAccess) {
        await sendDirectAccessEmail(user);
    } else await sendFirstEmail(user, name);

    // send nurturing emails
    await startNurturing(user, name);

    await user.save();

    // Update referral for owner of referral link
    if (token && !directAccess) {
        /* const decoded = await jwt.validateToken({ token }); */
        /*  const { whoReferId, whoEmail } = decoded.data; */
        const whoReferId = token;
        if (!uuidValidateV4(whoReferId)) {
            throw new BadRequest('Referral token was invalid');
        }
        const ownerRef = await MarketingReferral.findOne({
            /* e: createEmailFindRegex({ email: whoEmail }), */
            refId: whoReferId,
        }).exec();
        if (!ownerRef) throw new BadRequest('user not found from referral id');
        user.whoReferId = whoReferId;
        await user.save();
    }
    return {
        msg: 'User Registered',
    };
};

exports.getReferralLink = async ({ token }) => {
    const decoded = await jwt.validateToken({ token });
    const { id } = decoded.data;

    // user who is accessing the resource
    const user = await MarketingReferral.findById(id).exec();
    if (!user) throw new BadRequest('user not found');

    return {
        referralLink: `${env.FRONTEND_URL}/cold-email-strategy/${user.refId}`,
    };
};

exports.accessedFirstResource = async ({ token }) => {
    const decoded = await jwt.validateToken({ token });
    const { id } = decoded.data;

    // user who is accessing the resource
    const user = await MarketingReferral.findById(id).exec();
    if (!user) throw new BadRequest('user not found');

    if (!user.accessedFirstResource) {
        // Accessing resource for the first time
        user.accessedFirstResource = true;
        await user.save();

        if (user.wr) {
            // If user has owner's refId
            // Check if owner is eligible to receive full award
            const result = await MarketingReferral.countDocuments({
                wr: user.wr,
                asf: true,
            }).exec();
            if (result == 3) {
                const owner = await MarketingReferral.findOne({
                    refId: user.wr,
                })
                    .select('e n')
                    .exec();

                // Send 2nd email
                const resourceLink2 =
                    'https://docs.google.com/spreadsheets/d/12iEjj-6QIdOU7UYN9VocQwSoPt7UYy-H9G3lSht0X98/edit?usp=sharing';
                await notification.send({
                    usecase: 'referral_loop_two',
                    role: C.ROLES.WRITER_C,
                    email: {
                        email: owner.e,
                        name: owner.n,
                        resource: resourceLink2,
                    },
                });
            }
        }
        // Scenerio for multilpe emails sent
        // There exists 2 users with { wr: user.wr, asf: true }
        // Current user's accessedFirstResource = false
        // Now perform this operation in parallel on multiple machines
    }
    return {
        msg: 'resource accessed',
    };
};

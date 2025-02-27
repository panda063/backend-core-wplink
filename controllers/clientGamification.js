const mongoose = require('mongoose');
const C = require('../lib/constants');
const Gamification = mongoose.model(C.MODELS.C_GAMIFICATION_C);
const jwt = require('../lib/jwt');
const emailService = require('../services/sendgrid/index');
const bcrypt = require('bcrypt');
const { BadRequest, InternalServerError } = require('../lib/errors');
const env = require('../config/env');

const {
    client_join_friend_mail,
    client_after_registration_mail,
    client_invite_friends_mail,
    client_after_verification_mail,
    for_admin_client_after_registration_mail,
} = require('../utils/emails');

const { createEmailFindRegex } = require('../services/db/user');

const { v4: uuidv4 } = require('uuid');
const agenda = require('../services/agenda');
const { CHRONS, CHRON_TIME } = require('../services/agenda/constants');
const domainMail = 'service@passionbits.io';

const cancelScheduledMail = async (name, userId) => {
    const agendaQuery = {
        name,
        'data.userId': userId,
    };
    await agenda.cancel(agendaQuery);
    console.log('Cancel Mail', name);
};

const refAdded = async (token) => {
    if (token) {
        const afterUpdate = await Gamification.findOneAndUpdate(
            {
                r: token,
            },
            {
                $inc: {
                    'rc.jc': 1,
                    s: 3,
                },
            },
        ).select('n e');
        if (afterUpdate) {
            const userAuthtoken = await jwt.generateToken({
                data: { id: afterUpdate._id },
                expiresIn: '1y',
            });
            const message = {
                subject:
                    'Congratulations! 3 more months of subscription for free.',
                html: client_join_friend_mail(userAuthtoken, afterUpdate.n.f),
            };
            emailService.sendEmail(afterUpdate.e, message, domainMail);
        }
    }
    console.log('REF ADDED');
    return;
};

const addSocialRef = async (token) => {
    const afterUpdate = await Gamification.findOneAndUpdate(
        { r: token },
        {
            $inc: {
                'ss.sjc': 1,
            },
        },
    );
    if (!afterUpdate) throw new BadRequest('INVALID_TOKEN');
    return;
};

const addPerksOnInvitation = async (id, inviteUserCount) => {
    await Gamification.findByIdAndUpdate(id, {
        $inc: { p: C.GAMIFICATION_GET_PERKS.INVITATION * inviteUserCount },
    });
};

/**
 * @version 2.1
 * Add to waitlist controller
 */

exports.addClientToWaitlist = async ({
    firstName,
    lastName,
    email,
    industry,
    website,
    company,
    clientRole,
    refId,
    social,
}) => {
    let checkIfexists = await Gamification.findOne({
        e: createEmailFindRegex({ email }),
    });
    if (checkIfexists) {
        throw new BadRequest('Email already on waitlist');
    }
    const newUser = new Gamification({
        e: email,
        n: { f: firstName, l: lastName },
        i: industry,
        ws: website,
        cc: company,
        crl: clientRole,
        iv: true,
        rfr: {
            refId,
            social,
        },
    });
    await newUser.save();
    /**
     * email to client
     */
    const message = {
        subject:
            'Congratulations! One year subscription for free to post jobs on passionbits.',
        html: client_after_registration_mail(firstName),
    };

    emailService.sendEmail(newUser.e, message, domainMail);
    /**
     * Email to us
     */
    // ***********For Admin****************
    let msgAdmin = {
        subject: 'New Client Registered',
        html: for_admin_client_after_registration_mail(newUser),
    };
    if (env.NODE_ENV === 'prod') {
        emailService.sendEmail('roshan@whitepanda.in', msgAdmin, domainMail);
    }
    if (env.NODE_ENV === 'dev') {
        emailService.sendEmail('arpitpathak97@gmail.com', msgAdmin, domainMail);
    }
    // *************************************
    return {
        msg: 'added to waitlist',
    };
};

/**
 *
 */

exports.addToWishlist = async ({ email, token, social }) => {
    let checkIfexists = await Gamification.findOne({ e: email });
    if (!checkIfexists) {
        const newUser = new Gamification();
        newUser.e = email;
        newUser.a.push({
            activity: C.GAMIFICATION_CLIENT_ACTIVITIES.ADD_TO_WAITLIST,
            triggerBy: C.GAMIFICATION_ACTIVTY_TRIGGER_BY.USER,
        });
        newUser.lsm = CHRONS.GC_NOT_REGISTERED;

        await newUser.save();

        console.log('Schedule Mail', CHRONS.GC_NOT_REGISTERED);
        agenda.schedule(CHRON_TIME.IN_HOURS_42, CHRONS.GC_NOT_REGISTERED, {
            userId: newUser._id,
            email,
        });
        // If token in URL and social is null. Invitation was from email
        if (token && !social) {
            await refAdded(token);
        }
        // If token in URL and social is not null. User clicked Social Platform link

        if (token && social) {
            await addSocialRef(token);
        }
        // Bad Request
        if (!token && social) {
            throw new BadRequest();
        }

        const userAuthtoken = await jwt.generateToken({
            data: { email, id: newUser._id },
            expiresIn: '1y',
        });
        return { token: userAuthtoken };
    } else {
        // console.log(err);
        /*
    if (
      err.code === 11000 &&
      err.name === "MongoError" &&
      err.keyPattern.e === 1
    ) {
    */
        const existedUser = await Gamification.findOne({ e: email }).select(
            'iv',
        );
        if (!existedUser.iv) {
            const existedUserAuthtoken = await jwt.generateToken({
                data: { email, id: existedUser._id },
                expiresIn: '1y',
            });
            return { token: existedUserAuthtoken };
        } else throw new BadRequest('EMAIL_EXIST');
        // } else throw new BadRequest();
    }
};

exports.registerUser = async ({
    user,
    firstName,
    lastName,
    website,
    company,
    medium,
    city,
    country,
    lookingFor,
    industry,
}) => {
    if (user.r) {
        throw new BadRequest('ALREADY_REGISTERED');
    }
    let ref = uuidv4();
    user.n.f = firstName;
    user.n.l = lastName;
    user.ws = website;
    user.cc = company;
    user.add.c = country;
    user.add.ct = city;
    user.lf = lookingFor;
    user.r = ref;
    user.medium = medium;
    user.i = industry;

    // If Any Scheduled Mail Exist Cancel That
    if (user.lsm) {
        await cancelScheduledMail(user.lsm, user._id);
    }

    user.lsm = CHRONS.GC_NOT_VERIFIED;

    // Register Activity
    user.a.push(
        {
            activity: C.GAMIFICATION_CLIENT_ACTIVITIES.REGISTER,
            triggerBy: C.GAMIFICATION_ACTIVTY_TRIGGER_BY.USER,
        },
        {
            activity: C.GAMIFICATION_CLIENT_ACTIVITIES.SEND_VERIFICATION_MAIL,
            triggerBy: C.GAMIFICATION_ACTIVTY_TRIGGER_BY.SYSTEM,
        },
    );

    await user.save();

    const userAuthtoken = await jwt.generateToken({
        data: { email: user.e },
        expiresIn: '1y',
    });

    const message = {
        subject:
            'Congratulations! One year subscription for free to post jobs on passionbits.',
        html: client_after_registration_mail(firstName, userAuthtoken),
    };

    emailService.sendEmail(user.e, message, domainMail);

    // ***********For Admin****************
    let msgAdmin = {
        subject: 'New Client Registered',
        html: for_admin_client_after_registration_mail(user),
    };
    if (env.NODE_ENV === 'prod') {
        emailService.sendEmail('roshan@whitepanda.in', msgAdmin, domainMail);
    }
    if (env.NODE_ENV === 'dev') {
        emailService.sendEmail('arpitpathak97@gmail.com', msgAdmin, domainMail);
    }
    // *************************************

    console.log('Schedule Mail', CHRONS.GC_NOT_VERIFIED);
    agenda.schedule(CHRON_TIME.IN_HOURS_42, CHRONS.GC_NOT_VERIFIED, {
        userId: user._id,
        email: user.e,
        token: userAuthtoken,
        name: user.n.f,
    });

    return { success: true, userRef: ref };
};

exports.verify = async ({ token }) => {
    const decoded = await jwt.validateToken({ token });
    const { email } = decoded.data;
    if (!email) throw new BadRequest('Invalid token.');

    const verifiedUser = await Gamification.findOneAndUpdate(
        { e: email },
        { iv: true },
    );
    if (!verifiedUser) throw new BadRequest('Something went wrong.');

    console.log('CANCEL PREVIOUS MAIL');
    // If Any Scheduled Mail Exist Cancel That
    if (verifiedUser.lsm) {
        await cancelScheduledMail(verifiedUser.lsm, verifiedUser._id);
    }

    console.log('SET LSM');
    verifiedUser.lsm = CHRONS.GC_SOCIAL_REMINDER_1D;

    console.log('TRYING TO PUSH ACTIVITY');
    verifiedUser.a.push({
        activity: C.GAMIFICATION_CLIENT_ACTIVITIES.VERIFY,
        triggerBy: C.GAMIFICATION_ACTIVTY_TRIGGER_BY.USER,
    });

    console.log('SAVING USER');
    await verifiedUser.save();
    console.log('SAVED USER');

    console.log('Schedule Mail', CHRONS.GC_SOCIAL_REMINDER_1D);
    agenda.schedule(CHRON_TIME.IN_DAY, CHRONS.GC_SOCIAL_REMINDER_1D, {
        userId: verifiedUser._id,
        email: email,
        userRef: verifiedUser.r,
        name: verifiedUser.n.f,
    });

    const userAuthtoken = await jwt.generateToken({
        data: { id: verifiedUser._id },
        expiresIn: '1y',
    });

    const message = {
        subject: 'Visit your dashboard to know more',
        html: client_after_verification_mail(userAuthtoken, verifiedUser.n.f),
    };
    emailService.sendEmail(verifiedUser.e, message, domainMail);

    return { success: true, token: userAuthtoken };
};

function isValidEmail(email) {
    var emailRegex = /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/;
    return !!email && typeof email === 'string' && email.match(emailRegex);
}

exports.inviteViaEmails = async ({ id, emails, user }) => {
    console.log('Invite Via Email');

    let validatedEmails = emails.filter((email) => isValidEmail(email));

    // If emails exist in users invitation list but not in wishlist
    // User can not invite same email twice

    if (validatedEmails.length > 0) {
        validatedEmails = validatedEmails.map((mail) => {
            const message = {
                subject: `${user.n.f} invited you to post jobs for free!`,
                // text: ' Your friend invited you. You can look join us via given link.',
                html: client_invite_friends_mail(user.r, user.n.f),
            };
            emailService.sendEmail(mail, message, domainMail);
            return { email: mail };
        });
        const updatedInvited = await Gamification.findByIdAndUpdate(
            id,
            {
                $push: {
                    a: {
                        activity: C.GAMIFICATION_CLIENT_ACTIVITIES.INVITE,
                        triggerBy: C.GAMIFICATION_ACTIVTY_TRIGGER_BY.USER,
                    },
                },
                $inc: {
                    'rc.rc': validatedEmails.length,
                },
            },
            { new: true },
        );
        if (!updatedInvited) throw "Can't update invitation";
        return {
            success: true,
        };
    } else {
        throw new BadRequest('Please provie valid email.');
    }
};

exports.getGamificationData = async ({ user }) => {
    user.la = new Date();
    await user.save();
    return {
        name: user.n.f,
        subscription: user.s,
        userRef: user.r,
    };
};

exports.resetPassword = async ({ password, token }) => {
    const decoded = await jwt.validateToken({ token });
    const { email } = decoded.data;
    if (!email) {
        throw new BadRequest('Invalid token.');
    }
    let hashNewPassword = await bcrypt.hash(password, 10);
    const updatedPassword = await Gamification.findOneAndUpdate(
        { e: email },
        { pw: hashNewPassword },
    );
    if (!updatedPassword) {
        throw new InternalServerError();
    }
    return { success: true };
};

exports.setSocial = async ({ ref, social, status }) => {
    let fieldToUpdate = 'tw';
    if (social === 'facebook') fieldToUpdate = 'fb';
    if (social === 'linkedin') fieldToUpdate = 'li';
    const updatedResult = await Gamification.findOneAndUpdate(
        { r: ref },
        { $set: { [`ss.${fieldToUpdate}`]: status } },
    );
    if (updatedResult) return { success: true };
    else {
        throw new BadRequest('BAD REQUEST');
    }
};

const mongoose = require('mongoose');
const C = require('../lib/constants');
const Gamification = mongoose.model(C.MODELS.GAMIFICATION_C);
const Mentor = mongoose.model(C.MODELS.MENTOR_C);
const jwt = require('../lib/jwt');
const emailService = require('../services/sendgrid/index');
const bcrypt = require('bcrypt');
const { BadRequest, InternalServerError } = require('../lib/errors');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const env = require('../config/env');
const logger = require('../config/winston');
const {
    getRegisterYourSelfMail,
    getClaimPlanMail,
    creator_invitation_mail,
    creator_join_friend_mail,
    creator_registration_complete_mail,
    creator_reset_password_mail,
    for_admin_creator_registration_complete_mail,
} = require('../utils/emails');
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

const getPosition = async (id) => {
    const positionOfId = await Gamification.find({ _id: { $lte: id } }).count();
    return positionOfId + 445;
};
// Add reference when user joins through email
const refAdded = async (token, email) => {
    if (token) {
        const afterUpdate = await Gamification.findOneAndUpdate(
            { r: token, 'rc.ij.email': email },
            {
                $inc: {
                    'rc.jc': 1,
                    p: C.GAMIFICATION_GET_PERKS.INVITATION,
                },
                $set: { 'rc.ij.$.joined': true },
            }
        ).select('n e');
        if (afterUpdate) {
            const message = {
                subject: `Congratulations! You have been rewarded with 100 bits.`,
                html: creator_join_friend_mail(afterUpdate.n.f, ''),
            };
            emailService.sendEmail(afterUpdate.e, message, domainMail);
        }
    }
    console.log('REF ADDED');
    return;
};

// Add reference when user joins through social platforms
const addSocialRef = async (token) => {
    const afterUpdate = await Gamification.findOneAndUpdate(
        { r: token },
        {
            $inc: {
                'ss.sjc': 1,
            },
        }
    );
    if (!afterUpdate) throw new BadRequest('INVALID_TOKEN');
    return;
};

const addPerksOnInvitation = async (id, inviteUserCount) => {
    await Gamification.findByIdAndUpdate(id, {
        $inc: { p: C.GAMIFICATION_GET_PERKS.INVITATION * inviteUserCount },
    });
};

exports.addToWishlist = async ({ email, token, social }) => {
    let checkIfexists = await Gamification.findOne({ e: email });
    if (!checkIfexists) {
        const newUser = new Gamification();
        newUser.e = email;
        newUser.a.push({
            activity: C.GAMIFICATION_USER_ACTIVITIES.ADD_TO_WAITLIST,
            triggerBy: C.GAMIFICATION_ACTIVTY_TRIGGER_BY.USER,
        });
        await newUser.save();

        console.log('Schedule Mail', CHRONS.G_NO_REGISTRATION_REMINDER);
        agenda.schedule(
            CHRON_TIME.IN_HOURS_42,
            CHRONS.G_NO_REGISTRATION_REMINDER,
            {
                userId: newUser._id,
                email,
            }
        );

        // If token in URL and social is null. Invitation was from email
        if (token && !social) {
            await refAdded(token, email);
        }
        // If token in URL and social is not null. User clicked Social Platform link
        if (token && social) {
            await addSocialRef(token);
        }

        // Bad Request
        if (!token && social) {
            throw new BadRequest();
        }
        const position = await Gamification.count();
        const userAuthtoken = await jwt.generateToken({
            data: { email, id: newUser._id },
            expiresIn: '1y',
        });
        return { token: userAuthtoken, position: position + 445 };
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
            'iv'
        );
        if (!existedUser.iv) {
            const existedUserPosition = await getPosition(existedUser._id);
            const existedUserAuthtoken = await jwt.generateToken({
                data: { email, id: existedUser._id },
                expiresIn: '1y',
            });
            return {
                token: existedUserAuthtoken,
                position: existedUserPosition,
            };
        } else throw new BadRequest('EMAIL_EXIST');
        // } else throw new BadRequest();
    }
};

// Register new user
exports.registerUser = async ({
    user,
    firstName,
    lastName,
    linkedIn,
    country,
    city,
    creatorType,
    experience,
    designation,
    password,
}) => {
    const regex = /^(http(s)?:\/\/)?([\w]+\.)?linkedin\.com\/(pub|in|profile)/gm;
    if (!regex.test(linkedIn)) {
        throw new BadRequest('Please provide valid linkedIn profile.');
    }
    if (user.r) {
        throw new BadRequest('ALREADY_REGISTERED');
    }
    let hashPassword = await bcrypt.hash(password, 10);
    let ref = uuidv4();
    user.n.f = firstName;
    user.n.l = lastName;
    user.li = linkedIn;
    user.add.c = country;
    user.add.ct = city;
    user.d = designation;
    user.cty = creatorType;
    user.exp = experience;
    user.pw = hashPassword;
    user.r = ref;
    user.p = 100;

    user.lsm = CHRONS.G_NO_VERIFICATION_42;

    // Register Activity
    user.a.push(
        {
            activity: C.GAMIFICATION_USER_ACTIVITIES.REGISTER,
            triggerBy: C.GAMIFICATION_ACTIVTY_TRIGGER_BY.USER,
        },
        {
            activity: C.GAMIFICATION_USER_ACTIVITIES.SEND_VERIFICATION_MAIL,
            triggerBy: C.GAMIFICATION_ACTIVTY_TRIGGER_BY.SYSTEM,
        }
    );

    await user.save();

    const userAuthtoken = await jwt.generateToken({
        data: { email: user.e },
        expiresIn: '1y',
    });

    const updatedUserPosition = await getPosition(user._id);
    const message = {
        subject: 'You have successfully joined the waitlist on passionbits.',
        html: creator_registration_complete_mail(
            firstName,
            updatedUserPosition,
            userAuthtoken
        ),
    };
    emailService.sendEmail(user.e, message, domainMail);

    // ********** For Admin***********
    let msgAdmin = {
        subject: `New Creator registered and is at position ${updatedUserPosition}`,
        html: for_admin_creator_registration_complete_mail(user),
    };
    if (env.NODE_ENV === 'prod') {
        emailService.sendEmail('roshan@whitepanda.in', msgAdmin, domainMail);
    }
    if (env.NODE_ENV === 'dev') {
        emailService.sendEmail('arpitpathak97@gmail.com', msgAdmin, domainMail);
    }
    // *******************************

    console.log('Schedule Mail', CHRONS.G_NO_VERIFICATION_42);
    agenda.schedule(CHRON_TIME.IN_HOURS_42, CHRONS.G_NO_VERIFICATION_42, {
        userId: user._id,
        name: firstName,
        position: updatedUserPosition,
        email: user.e,
        userAuthtoken,
    });

    return { success: true };
};

exports.verify = async ({ token }) => {
    const decoded = await jwt.validateToken({ token });
    const { email } = decoded.data;
    if (!email) throw new BadRequest('Invalid token.');

    const verifiedUser = await Gamification.findOneAndUpdate(
        { e: email },
        { iv: true }
    );
    if (!verifiedUser) throw new BadRequest('Something went wrong.');

    // If Any Scheduled Mail Exist Cancel That
    if (verifiedUser.lsm) {
        await cancelScheduledMail(verifiedUser.lsm, verifiedUser._id);
    }

    verifiedUser.lsm = CHRONS.G_PERK_1_42;

    verifiedUser.a.push({
        activity: C.GAMIFICATION_USER_ACTIVITIES.VERIFY,
        triggerBy: C.GAMIFICATION_ACTIVTY_TRIGGER_BY.USER,
    });
    const verifiedUserPosition = await getPosition(verifiedUser._id);
    await verifiedUser.save();

    console.log('Schedule Mail', CHRONS.G_PERK_1_42);
    agenda.schedule(CHRON_TIME.IN_HOURS_42, CHRONS.G_PERK_1_42, {
        userId: verifiedUser._id,
        email: email,
        name: verifiedUser.n.f,
    });

    return { success: true, verifiedUserPosition };
};

exports.login = async ({ email, password }) => {
    const user = await Gamification.findOne({ e: email });
    if (!user) {
        throw new BadRequest('Wrong Credentials.');
    }
    if (!user.password) {
        throw new BadRequest('PENDING_JOIN');
    }
    if (!user.iv) {
        throw new BadRequest('EMAIL_NOT_VERIFY');
    }
    const isMatch = await bcrypt.compare(password, user.pw);
    if (!isMatch) {
        throw new BadRequest('Wrong Credentials.');
    }
    const loginToken = await jwt.generateToken({
        data: { id: user._id, email },
        expiresIn: '1y',
    });
    return {
        token: loginToken,
        ref: user.r,
    };
};

function isValidEmail(email) {
    var emailRegex = /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/;
    return !!email && typeof email === 'string' && email.match(emailRegex);
}

exports.inviteViaEmails = async ({ user, emails, name, ref }) => {
    let id = user.id;
    // Check if user has invites remaining
    let invitesLeft = C.ACCOUNT_C.INVITE_MAX - user.rc.rc;
    if (emails.length > invitesLeft) {
        throw new BadRequest(
            `${invitesLeft} / ${C.ACCOUNT_C.INVITE_MAX} invites left`
        );
    }

    const validatedEmails = emails.filter((email) => isValidEmail(email));
    if (validatedEmails.length != emails.length) {
        throw new BadRequest('one or more invalid emails');
    }
    // If users are already in wishlist
    const alreadyExistData = await Gamification.find({
        e: { $in: validatedEmails },
    }).select('e');

    // fetch already exist emails
    let alreadyExistEmail = alreadyExistData.map((data) => data.e);
    // remove already exist emails
    let emailToProceed = validatedEmails.filter(
        (email) => !alreadyExistEmail.includes(email)
    );

    // If emails exist in users invitation list but not in wishlist
    // User can not invite same email twice
    const getUserData = await Gamification.findById(id);
    alreadyExistEmail = getUserData.rc.ij.map((data) => data.email);
    emailToProceed = emailToProceed.filter(
        (email) => !alreadyExistEmail.includes(email)
    );

    if (emailToProceed.length > 0) {
        emailToProceed = emailToProceed.map((mail) => {
            const message = {
                subject: `Your friend ${name} invites you to join passionbits early access program.`,
                // text: ' Your friend invited you. You can look join us via given link.',
                html: creator_invitation_mail(name, ref),
            };
            emailService.sendEmail(mail, message, domainMail);
            return { email: mail };
        });
        const updatedInvited = await Gamification.findByIdAndUpdate(
            id,
            {
                $push: {
                    'rc.ij': emailToProceed,
                    a: {
                        activity: C.GAMIFICATION_USER_ACTIVITIES.INVITE,
                        triggerBy: C.GAMIFICATION_ACTIVTY_TRIGGER_BY.USER,
                    },
                },
                $inc: {
                    'rc.rc': emailToProceed.length,
                },
            },
            { new: true }
        );
        if (!updatedInvited) throw "Can't update invitation";
        return {
            inviteCount: updatedInvited.rc.ij.length,
            notProceedEmail: emails.length - emailToProceed.length,
            newEmails: emailToProceed.length,
        };
    }
    return {
        error:
            "Email that you've provided is already present on platform/invitation list.",
        notProceedEmail: emails.length - emailToProceed.length,
        newEmails: emailToProceed.length,
    };
};

exports.getGamificationData = async ({ id, user }) => {
    const gamifiedData = await Gamification.findById(id);
    const position = await Gamification.find({ _id: { $lt: id } }).count();
    user.la = new Date();
    await user.save();
    return {
        data: { ...gamifiedData.toJSON(), position: position + 445 },
    };
};

const mapActionToFields = {
    GAURANTEED_PROJECT: 'gp',
    FAST_GROWTH: 'fg',
    BE_A_LEADER: 'bl',
};

const canUserClaim = (type, gp, fg, bl) => {
    if (type === C.GAMIFICATION_ACTION_TYPE.GAURANTEED_PROJECT) return true;
    if (type === C.GAMIFICATION_ACTION_TYPE.FAST_GROWTH) return gp;
    if (type === C.GAMIFICATION_ACTION_TYPE.BE_A_LEADER) return fg;
};

exports.usePerks = async ({ user, action }) => {
    // const userPerks = await Gamification.findById(id).select('p gp fg bl');
    if (user[mapActionToFields[action]] === true) {
        return {
            error: 'This feature already claimed by you.',
            action: action,
        };
    }
    if (!canUserClaim(action, user.gp, user.fg, user.bl)) {
        return {
            error: "You can't cliam this now.",
            action: action,
        };
    }
    if (user.p < C.GAMIFICATION_USE_PERKS[action])
        return {
            error: 'NO_PERKS',
            action,
        };

    user[mapActionToFields[action]] = true;
    user.p = user.p - C.GAMIFICATION_USE_PERKS[action];

    // Schedule Mail Type
    const mailTypeForSchedule =
        action === C.GAMIFICATION_ACTION_TYPE.GAURANTEED_PROJECT
            ? CHRONS.G_PERK_2_42
            : action === C.GAMIFICATION_ACTION_TYPE.FAST_GROWTH
            ? CHRONS.G_PERK_3_42
            : null;

    const userClaim =
        action === C.GAMIFICATION_ACTION_TYPE.GAURANTEED_PROJECT
            ? C.GAMIFICATION_USER_ACTIVITIES.CLAIM_PERK1
            : action === C.GAMIFICATION_ACTION_TYPE.FAST_GROWTH
            ? C.GAMIFICATION_USER_ACTIVITIES.CLAIM_PERK2
            : C.GAMIFICATION_USER_ACTIVITIES.CLAIM_PERK3;

    // Register User Activity
    user.a.push({
        activity: userClaim,
        triggerBy: C.GAMIFICATION_ACTIVTY_TRIGGER_BY.USER,
    });

    // If User Have Any Scheduled Mail Then Cancel It
    if (user.lsm) {
        await cancelScheduledMail(user.lsm, user._id);
    }

    if (mailTypeForSchedule) {
        console.log('Schedule Mail', mailTypeForSchedule);
        // Schedule Mail
        agenda.schedule(CHRON_TIME.IN_HOURS_42, mailTypeForSchedule, {
            userId: user._id,
            email: user.e,
            name: user.n.f,
        });

        // Save Last Scheduled Mail
        user.lsm = mailTypeForSchedule;
    }

    await user.save();

    return {
        success: true,
        action,
        perks: user.p,
    };
};

exports.sentResetPasswordLink = async ({ email }) => {
    const isEmailExist = await Gamification.findOne({ e: email });
    if (!isEmailExist) {
        throw new BadRequest('EMAIL_NOT_EXIST');
    }
    if (!isEmailExist.password) {
        throw new BadRequest('PENDING_JOIN');
    }
    console.log('Password exist', isEmailExist.password);
    if (!isEmailExist.iv) {
        throw new BadRequest('EMAIL_NOT_VERIFY');
    }
    console.log('User Verify', isEmailExist.iv);
    const emailResetToken = await jwt.generateToken({
        data: { email },
        expiresIn: '1y',
    });
    const message = {
        subject: `Reset password - PassionBits`,
        // text: ' Your friend invited you. You can look join us via given link.',
        html: creator_reset_password_mail(emailResetToken),
    };
    emailService.sendEmail(email, message, domainMail);
    return { success: true };
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
        { pw: hashNewPassword }
    );
    if (!updatedPassword) {
        throw new InternalServerError();
    }
    return { success: true };
};

exports.mailedUs = async ({ emails, perks }) => {
    const updatedMailedResult = await Gamification.updateMany(
        { e: { $in: emails }, mu: false },
        { $set: { mu: true } }
    );
    if (!updatedMailedResult) {
        throw new InternalServerError();
    }
    return {
        users: updatedMailedResult,
    };
};

const fetchMailByType = (type) => {
    return type === 'REGISTER' ? getRegisterYourSelfMail() : getClaimPlanMail();
};

// Add mentor on Form Submit Event

exports.addMentor = async ({
    fullName,
    curJobTitleAndCompany,
    interests,
    linkedIn,
    img,
    email,
    calendly,
    otherLang,
}) => {
    try {
        let newMentor = new Mentor();
        newMentor.n = fullName;
        newMentor.cjc = curJobTitleAndCompany;
        newMentor.w = interests;
        newMentor.l = linkedIn;
        newMentor.iu = img;
        newMentor.em = email;
        newMentor.cl = calendly;
        await newMentor.save();
        return {
            success: true,
        };
    } catch (err) {
        if (err.code === 11000 && err.name === 'MongoError') {
            let existingMentor = await Mentor.findOne({ em: email });
            existingMentor.n = fullName;
            existingMentor.cjc = curJobTitleAndCompany;
            existingMentor.w = interests;
            existingMentor.l = linkedIn;
            existingMentor.iu = img;
            existingMentor.cl = calendly;
            await existingMentor.save();
            return {
                success: true,
            };
        } else {
            throw new BadRequest();
        }
    }
};

// Get mentors list. Documents per page = 8

exports.getMentors = async ({ page, limit, filter }) => {
    let query = {};
    if (typeof filter === 'string') {
        query = { w: { $regex: `${filter}`, $options: 'i' } };
    }
    // logger.debug(JSON.stringify(query));
    const mentors = await Mentor.find(query)
        .sort({ createdAt: 1 })
        .limit(limit * 1)
        .skip((page - 1) * limit)
        .exec();
    const count = await Mentor.countDocuments();
    return {
        mentors,
        totalPages: Math.ceil(count / limit),
        currentPage: page,
    };
};

// Update perks when Survey taken by user

exports.takenSurvey = async ({ email }) => {
    const updatedResult = await Gamification.findOneAndUpdate(
        { e: email, ts: false },
        { $set: { ts: true }, $inc: { p: 100 } }
    );
    if (!updatedResult) {
        throw new BadRequest('INVALID EMAIL OR SURVEY ALREADY TAKEN');
    }
    return {
        success: true,
    };
};

// When users clicks on social share buttons

exports.setSocial = async ({ ref, social, status }) => {
    let fieldToUpdate = 'tw';
    if (social === 'facebook') fieldToUpdate = 'fb';
    if (social === 'linkedin') fieldToUpdate = 'li';
    const updatedResult = await Gamification.findOneAndUpdate(
        { r: ref },
        { $set: { [`ss.${fieldToUpdate}`]: status } }
    );
    if (updatedResult) return { success: true };
    else {
        throw new BadRequest('BAD REQUEST');
    }
};

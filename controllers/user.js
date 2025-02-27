/*
 * Module dependecies
 */

const mongoose = require('mongoose');
const _ = require('lodash');
const { validate: uuidValidate, v4: uuidv4 } = require('uuid');
const C = require('../lib/constants');
const jwt = require('../lib/jwt');
const env = require('../config/env');
const ROLES_ENUMS = Object.values(C.ROLES);
const { JOB_BOARD_REPORT_TYPE } = C;

const {
    BadRequest,
    NotFound,
    InternalServerError,
    NotAuthorized,
} = require('../lib/errors');

const linkGen = require('../lib/link-generator');

/**
 * Models
 */

const JobBoard = mongoose.model(C.MODELS.JOB_BOARD_C);
const Report = mongoose.model(C.MODELS.JOB_BOARD_REPORTING_C);
const GU = mongoose.model(C.MODELS.GU_C);
const User = mongoose.model(C.MODELS.USER_C);
const ExtClient = mongoose.model(C.MODELS.EXT_CLIENT);
const Conversation = mongoose.model(C.MODELS.CONVERSATION);
const ConversationClient = mongoose.model(C.MODELS.CONVERSATION_CLIENT);
const ConversationExt = mongoose.model(C.MODELS.CONVERSATION_EXT);
const GroupConversation = mongoose.model(C.MODELS.GROUP_CONVERSATION);
const UserWaitlist = require('../models/users/userWaitlist');
const InfoText = mongoose.model(C.MODELS.INFO_TEXT);

// ***************For admin (roshan)********************
const emailService = require('../services/sendgrid/index');
const domainMail = 'service@passionbits.io';
const {
    for_admin_creator_registration_complete_mail,
    for_admin_client_after_registration_mail,
} = require('../utils/emails');
// **************************************

/**
 * Services
 */
const userService = require('../services/db/user');
// const notificationService = require('../services/notification');
// const msg91Service = require("../services/msg91");
const { notification } = require('../messaging/index');
const {
    updateConverstionInCacheGroup,
} = require('../services/redis/operations');

const { createSignupNotifications } = require('./notification');

/**
 *
 *	Helpers
 */
const {
    client_reported_creator,
    creator_reported_post,
    addReference,
    addSocialReference,
    onWriterSignupOperations,
    writerSignupEmails,
    onWriterOnboardOperations,
    validatePhoneNumber,
    emailForAdminOnSignUp,
} = require('./helpers/userHelper');
/**
 * Helper Functions
 */
const { createMultipleInfoTextGroup } = require('./helpers/pmHelper');

/**
 * Utility functions
 */
const { deleteMultiple } = require('../utils/s3-operations');
const { createEmailFindRegex } = require('../services/db/user');

// Other Controllers
const { updateStateAndPersist, deleteFilesByKey } = require('./fileStore');
const { createPagesFromTemplate } = require('./helpers/writerHelper');

/**
 * @version 2.1
 * Invite only signup/login APIs
 */

exports.joinWaitlist = async ({ email, refId, social }) => {
    // Check if creator already has a verified account
    const user = await userService.getUserByEmail({ email });
    if (user) throw new BadRequest('You are already registered on Passionbits');
    let findUser = await UserWaitlist.findOne({
        email: createEmailFindRegex({ email }),
    }).exec();
    if (!findUser) {
        findUser = new UserWaitlist({
            email,
            refId,
            social,
        });
        await findUser.save();
    }
    return {
        msg: 'Added to waitlist for approval',
    };
};

exports.userAuthCheck = async ({ user }) => {
    let userDetails = {};
    if (user.__t === C.ROLES.CLIENT_C) {
        userDetails = { country: user.adr.co };
    } else if (user.__t == C.ROLES.WRITER_C) {
        userDetails = {
            firstName: user.name ? user.name.first : null,
            lastName: user.name ? user.name.last : null,
            penname: user.pn ? user.pn : null,
            level: user.lv,
            country: user.adr.co,
            onboardState: user.obs,
        };
    } else if (user.__t == C.ROLES.PM_C) {
        userDetails = {
            firstName: user.name ? user.name.first : null,
            lastName: user.name ? user.name.last : null,
            studioId: user.studioId ? user.studioId : null,
            country: user.adr.co,
        };
    }
    return {
        msg: 'Verification success',
        id: user.id,
        email: user.email,
        ...userDetails,
        role: user.__t,
        status: user.accountStatus,
        image: user.image,
    };
};

async function userDataForLoginSession(user) {
    // Generate token for login
    const role = user.__t;
    const body = { id: user.id, email: user.email, role };
    // Sign the JWT token and populate the payload with the user email and id
    const loginToken = await jwt.generateToken({
        data: body,
        expiresIn: C.SIGNIN_TOKEN_EXPIRESIN,
    });
    const refreshToken = await jwt.generateToken({
        data: body,
        expiresIn: C.SIGNIN_REFRESH_TOKEN_EXPIRESIN,
    });
    // Get fields for local storage on browser
    let userDetails = {
        email: user.email,
        firstName: user.name ? user.name.first : null,
        lastName: user.name ? user.name.last : null,
        country: user.adr.co,
        status: user.accountStatus,
        image: user.image,
    };
    if (role === C.ROLES.CLIENT_C) {
    } else if (role == C.ROLES.WRITER_C) {
        userDetails = {
            ...userDetails,
            penname: user.pn ? user.pn : null,
            level: user.lv,
            onboardState: user.obs,
        };
    } else if (role == C.ROLES.PM_C) {
        userDetails = {
            ...userDetails,
            studioId: user.studioId ? user.studioId : null,
        };
    }
    return {
        msg: 'Login/Signup Successfull!',
        token: loginToken,
        id: user.id,
        ...userDetails,
        role,
        jwtForCookie: loginToken,
        refreshJwtForCookie: refreshToken,
    };
}

exports.commonLoginUser = async ({ email, password }) => {
    const user = await userService.getUserByEmail({ email });
    if (!user) {
        throw new BadRequest('no user exists with that email');
    }
    if (user.__t == C.MODELS.EXT_CLIENT) {
        throw new BadRequest(
            'Email is of an ExtClient user. Please use the link received on email to access platform',
        );
    }
    // * If signup was using google, throw error
    if (user.signupMode == C.ACCOUNT_SIGNUP_MODE.GOOGLE)
        throw new BadRequest('Please login using google', 'GL108');

    const userNotAllowedAccountStatus = [
        C.ACCOUNT_STATUS.BAN,
        C.ACCOUNT_STATUS.INACTIVE,
    ];
    if (userNotAllowedAccountStatus.includes(user.accountStatus)) {
        /*   if (!user.isEmailVerified) {
            throw new BadRequest('email is not verified yet', 'GL106');
        } */
        throw new BadRequest(
            `You are ${user.accountStatus}. Not allowed to signin`,
        );
    }

    const isMatch = await user.isValidPassword(password);
    if (!isMatch) {
        throw new BadRequest('incorrect password');
    }
    user.logc += 1;
    await user.save();
    return await userDataForLoginSession(user);
};

exports.getEmailFromToken = async ({ token }) => {
    const decoded = await jwt.validateToken({ token });
    const { email, userRole } = decoded.data;
    let accountExists = false;
    // check if user has already signed up
    const user = await userService.getUserByEmail({ email });
    if (user) {
        accountExists = true;
    }
    return { email, userRole, accountExists };
};

// ! TO be deprecated
exports.v2SignupUser = async ({
    role,
    firstName,
    lastName,
    password,
    mobile,
    country,
    city,
    creatorType,
    designation,
    token,
}) => {
    // allowed roles
    const allowedRoles = [C.ROLES.WRITER_C, C.ROLES.CLIENT_C];
    if (!allowedRoles.includes(role)) {
        throw new NotFound(`${String(role).toUpperCase()} Signup not found`);
    }
    const decoded = await jwt.validateToken({ token });
    const { email, refId, social, userRole } = decoded.data;
    if (userRole != role) throw new BadRequest('Invalid role in token');
    const exists = await userService.userExists({ email, mobile });
    if (exists) {
        throw new BadRequest(
            `user with the email${!mobile ? '' : '/mobile'} already exists`,
        );
    }
    // Create User
    const user = await userService.createUser({
        role,
        email,
        firstName,
        lastName,
        password,
        mobile,
        country,
        city,
        creatorType,
        designation,
        // Setting this field to make it compatible with original signup flow
        medium: '',
    });

    // Update reference for client
    // Invite option currently only for creator
    if (uuidValidate(refId)) {
        if (!social) {
            await addReference(refId, user.e);
        } else {
            await addSocialReference(refId, social);
        }
    }
    // Update fields that are required for a verified email address
    user.accountStatus = C.ACCOUNT_STATUS.ACTIVE;
    user.emailVerificationToken = '';
    user.verifiedAt = Date.now();
    user.isEmailVerified = true;
    await user.save();
    // Create welcome notifications
    await createSignupNotifications({ user });
    // ***********For Admin (roshan) ****************
    let msgAdmin;
    if (role == 'Writer') {
        msgAdmin = {
            subject: `Creator Registered`,
            html: for_admin_creator_registration_complete_mail(user),
        };
    } else {
        msgAdmin = {
            subject: `New Client Registered`,
            html: for_admin_client_after_registration_mail(user),
        };
    }
    if (env.NODE_ENV === 'prod') {
        emailService.sendEmail(
            [
                'roshan@passionbits.io',
                // 'sruthi@passionbits.io',
                // 'pavan@whitepanda.in',
                // 'arpit@whitepanda.in',
            ],
            msgAdmin,
            domainMail,
        );
    }
    if (env.NODE_ENV === 'dev') {
        emailService.sendEmail('arpitpathak97@gmail.com', msgAdmin, domainMail);
    }
    // ************************************
    // Generate token for login
    const body = { id: user.id, email: user.email, role: user.__t };
    // Sign the JWT token and populate the payload with the user email and id
    const loginToken = await jwt.generateToken({
        data: body,
        expiresIn: C.SIGNIN_TOKEN_EXPIRESIN,
    });
    const refreshToken = await jwt.generateToken({
        data: body,
        expiresIn: C.SIGNIN_REFRESH_TOKEN_EXPIRESIN,
    });
    // Get fields for local storage on browser
    let userDetails = {};
    if (role === C.ROLES.CLIENT_C) {
        userDetails = { country: user.adr.co };
    } else if (role == C.ROLES.WRITER_C) {
        userDetails = {
            firstName: user.name ? user.name.first : null,
            lastName: user.name ? user.name.last : null,
            penname: user.pn ? user.pn : null,
            level: user.lv,
            country: user.adr.co,
        };
    } else if (user.__t == C.ROLES.PM_C) {
        userDetails = {
            firstName: user.name ? user.name.first : null,
            lastName: user.name ? user.name.last : null,
            studioId: user.studioId ? user.studioId : null,
            country: user.adr.co,
        };
    }

    return {
        msg: 'Signup Successfull!',
        token: loginToken,
        id: user.id,
        email: user.email,
        ...userDetails,
        role: user.__t,
        status: user.accountStatus,
        image: user.image,
        jwtForCookie: loginToken,
        refreshJwtForCookie: refreshToken,
    };
};

/**
 * @version 3.1
 */

exports.v3SendSignupLink = async ({ email }) => {
    // Check if creator has already signed up
    const user = await userService.getUserByEmail({ email });
    if (user) throw new BadRequest('You are already registered on Passionbits');
    // Send email to user with sign up link
    const tokenData = {
        email,
        userRole: C.ROLES.WRITER_C,
    };
    const token = await jwt.generateToken({
        data: tokenData,
    });
    const link = `${env.FRONTEND_URL}/signup/${token}`;
    await notification.send({
        usecase: 'invite-v3',
        role: C.ROLES.WRITER_C,
        email: {
            email,
            link,
            emailId: email,
        },
    });
    return { link };
};

/**
 * @version main
 * Main signup/login APIs
 */

/**
 * @Note : Signup is only allowed for `writer`, `client`, 'pm' as of now
 */

/* function emailForAdminOnSignUp(role, user) {
    // ***********For Admin (roshan) ****************
    if (role == C.ROLES.WRITER_C || role == C.ROLES.CLIENT_C) {
        let msgAdmin;
        if (role == C.ROLES.WRITER_C) {
            msgAdmin = {
                subject: `New Creator Registered`,
                html: for_admin_creator_registration_complete_mail(user),
            };
        } else {
            msgAdmin = {
                subject: `New Client Registered`,
                html: for_admin_client_after_registration_mail(user),
            };
        }
        if (env.NODE_ENV === 'prod') {
            emailService.sendEmail(
                'roshan@passionbits.io',
                msgAdmin,
                domainMail,
            );
        }
        if (env.NODE_ENV === 'dev') {
            emailService.sendEmail(
                'arpitpathak97@gmail.com',
                msgAdmin,
                domainMail,
            );
        }
    }

    // ****************************************************
} */

exports.checkMobileAvailability = async ({ mobile, mobileCountry }) => {
    let valid = true,
        exists = true;
    const validateMobile = validatePhoneNumber({ mobile, mobileCountry });
    if (!validateMobile) {
        valid = false;
    }
    if (valid) {
        exists = await userService.mobileExists({
            mobileCountry,
            mobile,
        });
    }
    return {
        valid,
        exists,
    };
};

exports.checkUserName = async ({ penname }) => {
    /* let exists = await User.exists({
        pn: penname,
    }); */
    const exists = await userService.pennameExists({ penname });
    return {
        exists,
    };
};

exports.signupUser = async ({
    role,
    email,
    password,
    firstName,
    lastName,
    country,
    penname,
    city,
    mobile,
    designation,
    medium,
    studioQA,
    company,
    industry,
    website,
    clientRole,
    refId,
    social,
    referrer,
    signupMedium,
}) => {
    // allowed roles
    const allowedRoles = [C.ROLES.WRITER_C, C.ROLES.CLIENT_C, C.ROLES.PM_C];
    if (!allowedRoles.includes(role)) {
        throw new NotFound(`${String(role).toUpperCase()} Signup not found`);
    }
    const exists = await userService.userExists({ email, mobile });
    if (exists) {
        throw new BadRequest(
            `user with the email${!mobile ? '' : '/mobile'} already exists`,
        );
    }
    const user = await userService.createUser({
        role,
        email,
        password,
        firstName,
        lastName,
        penname,
        country,
        city,
        company,
        studioQA,
        designation,
        medium,
        industry,
        website,
        clientRole,
    });
    user.referrer = referrer;
    user.signupMedium = signupMedium;

    // Update reference
    if (uuidValidate(refId)) {
        if (!social) {
            await addReference(refId, user.e);
        } else {
            await addSocialReference(refId, social);
        }
    }

    // Make account active
    user.accountStatus = C.ACCOUNT_STATUS.ACTIVE;

    // For roles other than writer, send email verification
    // ! This affects both invite based and normal signups
    if (user.__t == C.ROLES.WRITER_C) {
        user.emailVerificationToken = '';
        user.verifiedAt = Date.now();
        user.isEmailVerified = true;
    } else {
        // Send email verification link
        // Users can now login even if their email is not verified
        // generate jwt
        const token = await jwt.generateToken({
            data: { id: user.id, email: user.email },
            expiresIn: C.DEFAULT_TOKEN_EXPIRESIN,
        });
        user.emailVerificationToken = token;
        const link = linkGen.verifyEmail({ role, token });
        await notification.send({
            usecase: C.NOTIF_USECASES[role].VERIFY_EMAIL,
            role,
            email: {
                email,
                link,
                name: user.n.f,
            },
        });
    }
    await user.save();
    if (role == C.ROLES.WRITER_C) {
        await onWriterSignupOperations({ user });
    }
    // Create Welcome notifications
    await createSignupNotifications({ user });
    // For Admin
    // Email to writer sent when they complete portfolio
    emailForAdminOnSignUp(user.__t, user);
    return await userDataForLoginSession(user);
};

exports.signupUserWriterTemplate = async ({ role, data }) => {
    const allowedRoles = [C.ROLES.WRITER_C];
    if (!allowedRoles.includes(role)) {
        throw new NotFound(`${String(role).toUpperCase()} Signup not found`);
    }

    // * Check if user exists with same email and/or mobile
    const { email, mobileCountry, mobile } = data;

    const exists = await userService.userExists({ email });
    if (exists) {
        throw new BadRequest(`user with the email already exists`);
    }

    // Check validity of mobile number
    const validateMobile = validatePhoneNumber({ mobile, mobileCountry });
    if (!validateMobile) throw new BadRequest('Invalid mobile number');

    const mobileExists = await userService.mobileExists({
        mobileCountry,
        mobile,
    });
    if (mobileExists) throw new BadRequest('User with mobile already exists');

    // * Creat user
    const { password, penname, referrer, signupMedium, signupMode } = data;

    const user = await userService.createUser({
        role,
        email,
        password,
        penname,
    });

    user.referrer = referrer;
    user.signupMedium = signupMedium;

    // Make account active
    user.signupMode = signupMode;
    user.accountStatus = C.ACCOUNT_STATUS.ACTIVE;
    user.emailVerificationToken = '';
    user.verifiedAt = Date.now();
    user.isEmailVerified = true;

    // * Set form fields

    const {
        fullname,
        medium,
        country,
        city,
        role: workRole,
        skills,
        experience,
        niche,
    } = data;

    user.n = { f: fullname, l: '' };
    user.adr.co = country;
    user.adr.ci = city;
    // for designation
    // In user schema use first value from workRole
    user.pdg = workRole[0];
    user.mo = mobile;
    user.moc = mobileCountry;
    // Other data points
    // Not shown to user
    user.othd = {
        medium,
        experience,
        niche,
        roles: workRole,
        skills,
    };

    user.obs = C.V3_CREATOR_ONBOARDING_STATES.STEP_NEW;

    await user.save();

    // * Create pages and blocks from template id
    const { templateId } = data;
    await createPagesFromTemplate({
        user,
        templateId,
        firstPagePos: 'n',
        publicPages: true,
    });

    // * Emailers

    await writerSignupEmails({ user });

    await onWriterOnboardOperations({ user });

    // Create Welcome notifications
    await createSignupNotifications({ user });

    // For Admin
    // Email to writer sent when they complete portfolio
    emailForAdminOnSignUp(user.__t, user);

    return await userDataForLoginSession(user);
};

exports.sendEmailVerificationLink = async ({ email }) => {
    const user = await userService.getUserByEmail({ email });
    if (!user) {
        throw new BadRequest('no such user with the email');
    }
    const role = user.__t;
    if (role == C.ROLES.EXT_CLIENT || user.isEmailVerified) {
        throw new BadRequest('email is already verified');
    }

    // generate jwt
    const token = await jwt.generateToken({
        data: { id: user.id, email: user.email },
        expiresIn: C.DEFAULT_TOKEN_EXPIRESIN,
    });

    user.emailVerificationToken = token;
    await user.save();

    const link = linkGen.verifyEmail({ role, token });

    await notification.send({
        usecase: C.NOTIF_USECASES[role].VERIFY_EMAIL,
        role,
        email: {
            email,
            link,
            name: user.n.f,
        },
    });
    return { msg: 'verification email sent' };
};

exports.verfiyEmail = async ({ token }) => {
    const decoded = await jwt.validateToken({ token });
    const { id, email } = decoded.data;
    // verify user
    const user = await userService.getUserByEmail({ email });
    const role = user.__t;
    if (!user || !user.id) {
        throw new BadRequest('no one with such email');
    }
    if (user.isEmailVerified) {
        return await userDataForLoginSession(user);
    }
    if (user.emailVerificationToken !== token) {
        throw new BadRequest('tokens do not match');
    }

    user.accountStatus = C.ACCOUNT_STATUS.ACTIVE;

    user.emailVerificationToken = '';
    user.verifiedAt = Date.now();
    user.isEmailVerified = true;
    await user.save();

    // Send Welcome Email
    if (role !== C.ROLES.WRITER_C) {
        let link = env.FRONTEND_URL;
        if (role == C.MODELS.CLIENT_C) {
            link = `${env.CLIENT_PROFILE}`;
        } else if (role == C.MODELS.PM_C) {
            link = `${env.PM_PORTFOLIO}/${user.stid}`;
        }
        // Send welcome email
        await notification.send({
            usecase: C.NOTIF_USECASES[role].VERIFED_EMAIL,
            role,
            email: {
                email,
                name: user.n.f,
                link,
            },
        });
    } else {
    }

    return await userDataForLoginSession(user);
    /* // Generate token for login
    const body = { id: user.id, email: user.email, role: user.__t };
    // Sign the JWT token and populate the payload with the user email and id
    const loginToken = await jwt.generateToken({
        data: body,
        expiresIn: C.SIGNIN_TOKEN_EXPIRESIN,
    });
    const refreshToken = await jwt.generateToken({
        data: body,
        expiresIn: C.SIGNIN_REFRESH_TOKEN_EXPIRESIN,
    });
    // Get fields for local storage on browser
    let userDetails = {};
    if (role === C.ROLES.CLIENT_C) {
        userDetails = {
            country: user.adr.co,
        };
    } else if (role == C.ROLES.WRITER_C) {
        userDetails = {
            firstName: user.name ? user.name.first : null,
            lastName: user.name ? user.name.last : null,
            penname: user.pn ? user.pn : null,
            level: user.lv,
            country: user.adr.co,
            onboardState: user.obs,
        };
    } else if (user.__t == C.ROLES.PM_C) {
        userDetails = {
            firstName: user.name ? user.name.first : null,
            lastName: user.name ? user.name.last : null,
            studioId: user.studioId ? user.studioId : null,
            country: user.adr.co,
        };
    }

    return {
        msg: 'verified successfully!',
        token: loginToken,
        id: user.id,
        email: user.email,
        ...userDetails,
        role: user.__t,
        status: user.accountStatus,
        image: user.image,
        jwtForCookie: loginToken,
        refreshJwtForCookie: refreshToken,
    }; */
};

exports.sendPasswordResetLink = async ({ email }) => {
    const user = await User.findOne({ e: createEmailFindRegex({ email }) });
    if (!user) {
        throw new BadRequest('no such user with the email');
    }
    if (user.__t == C.ROLES.EXT_CLIENT)
        throw new BadRequest('Not allowed for Ext Client user');
    // * If signup was using google, throw error
    if (user.signupMode == C.ACCOUNT_SIGNUP_MODE.GOOGLE)
        throw new BadRequest(
            'Password update not allowed. Signed up with google',
        );
    const { __t: role } = user;

    /*    if (!user.isEmailVerified) {
        throw new BadRequest('email is not verified');
    } */
    const { passwordVersion } = user;
    // generate jwt
    const token = await jwt.generateToken({
        data: {
            id: user.id,
            email: user.email,
            passwordVersion,
            role,
        },
        expiresIn: C.DEFAULT_TOKEN_EXPIRESIN,
    });
    const link = linkGen.pwdReset({ token, role });

    await notification.send({
        usecase: C.NOTIF_USECASES[role].RESET_PASSWORD,
        role,
        email: {
            email,
            link,
            name: user.fullname,
        },
    });
    return { msg: 'please check your email!' };
};

exports.verifyPasswordReset = async ({ id, email, passwordVersion }) => {
    // verify user
    const user = await User.findOne({
        e: createEmailFindRegex({ email }),
        _id: id,
    });
    if (!user || !user.id) {
        throw new BadRequest('no one with such email');
    }
    if (user.passwordVersion !== passwordVersion) {
        throw new BadRequest('password version doesnot match');
    }
    const { __t: role } = user;
    const token = await jwt.generateToken({
        data: {
            id: user.id,
            email: user.email,
            passwordVersion,
            role,
        },
        expiresIn: C.DEFAULT_TOKEN_EXPIRESIN,
    });

    return { msg: 'verified successfully!' };
};

exports.updatePassword = async ({ password, token }) => {
    // decode token
    const decoded = await jwt.validateToken({ token });
    const { id, email, passwordVersion } = decoded.data;

    // verify user
    const user = await User.findOne({
        e: createEmailFindRegex({ email }),
        _id: id,
    });
    if (!user || !user.id) {
        throw new BadRequest('no one with such email');
    }
    if (user.passwordVersion !== passwordVersion) {
        throw new BadRequest('password version doesnot match');
    }

    const { __t: role } = user;
    user.password = password;
    user.passwordVersion += 1;
    await user.save();
    await notification.send({
        usecase: C.NOTIF_USECASES[role].CHANGED_PASSWORD,
        role,
        email: {
            email,
            name: user.fullname,
        },
    });
    return { msg: 'password updated successfully!' };
};

exports.sendMobileOtp = async ({ user, mobile }) => {
    // check if mobile no. is already taken by a diffrent user
    const mobileExists = await userService.mobileExists({ mobile });
    if (mobileExists && user.mobile !== mobile) {
        throw new BadRequest('Mobile already exists');
    }
    // if (user.mobile === mobile && user.isMobileVerified) {
    //   return { msg: 'mobile already verified' };
    // }
    user.mobile = mobile;
    user.isMobileVerified = false;
    await user.save();
    /*
  await notification.send({
    usecase: C.NOTIF_USECASES[user.__t].SEND_OTP,
    role: user.__t,
    sms: {
      mobile: user.mobile,
    },
  });
  */
    return { msg: 'otp is sent to the given mobile number' };
};

exports.resendMobileOtp = async ({ user }) => {
    const { mobile } = user;
    if (!mobile) {
        throw new BadRequest('No Mobile Number registered');
    }
    // if (isMobileVerified) {
    //   return { msg: 'mobile already verified' };
    // }
    /*
  await notification.send({
    usecase: C.NOTIF_USECASES[user.__t].RESEND_OTP,
    role: user.__t,
    sms: {
      mobile: user.mobile,
    },
  });
  */
    return { msg: 'otp is re-sent to the given mobile number' };
};

exports.verfiyMobile = async ({ user, otp }) => {
    if (user.isMobileVerified) {
        return { msg: 'mobile already verified' };
    }
    const { mobile } = user;
    /*
  const result = await msg91Service.verifyOTP({ mobile, otp });
  if (!result) {
    throw new BadRequest("incorrect otp, retry");
  }
  */
    user.isMobileVerified = true;
    await user.save();

    return { msg: 'mobile verified successfully!' };
};

exports.getUser = async ({ id, role }) => {
    if (!ROLES_ENUMS.includes(role)) {
        throw new NotAuthorized('invalid role from token');
    }

    const UserModel = mongoose.model(role);
    if (!UserModel) {
        throw new InternalServerError(`no such model for the role: ${role}`);
    }
    /**
     *  * Find User document. Update user lac (last access) time to current time
     *
     */
    const user = await UserModel.findByIdAndUpdate(id, {
        lac: Date.now(),
    }).exec();
    if (!user) {
        throw new NotAuthorized('no such user');
    }
    return user;
};

// Login based on role
exports.loginUser = async ({ role, email, password }) => {
    const user = await userService.getUser({ role, email });
    if (!user) {
        throw new BadRequest('no user exist with that email');
    }
    // * If signup was using google, throw error
    if (user.signupMode == 'google')
        throw new BadRequest('Please login using google');
    // user not allowed account status
    const userNotAllowedAccountStatus = [
        C.ACCOUNT_STATUS.BAN,
        C.ACCOUNT_STATUS.INACTIVE,
    ];
    if (userNotAllowedAccountStatus.includes(user.accountStatus)) {
        if (!user.isEmailVerified) {
            throw new BadRequest('email is not verified yet');
        }
        throw new BadRequest('not allowed to signin');
    }
    const isMatch = await user.isValidPassword(password);
    if (!isMatch) {
        throw new BadRequest('incorrect password');
    }
    // user.lastActive = Date.now();
    // await user.save();

    return await userDataForLoginSession(user);
};

exports.updateProfileImage = async ({ user, fileId }) => {
    // First remove older image files
    if (user.img) {
        let oldImgOriginal = user.img.replace(
            env.S3_BUCKET_WEBSITE_URL + '/',
            '',
        );
        oldImgOriginal = oldImgOriginal.replace('-150x150.webp', '');
        const filesToRemove = [];
        // This condition is checked for backwards compatibility
        // Old Image path: userId/profile
        if (oldImgOriginal.includes(env.S3_BUCKET_FILE_FOLDER)) {
            filesToRemove.push(oldImgOriginal);
            // Remove resized versions of older image
            const versions = Object.values(C.PORTFOLIO_IMAGE_VERSIONS);
            for (let vr of versions) {
                filesToRemove.push(`${oldImgOriginal}-${vr}.webp`);
            }
        }
        if (filesToRemove.length > 0) {
            // Remove from s3 (tortoise); delete documents
            await deleteMultiple(env.S3_BUCKET_USER_DATA, filesToRemove);
            await deleteFilesByKey({ keys: filesToRemove });
        }
        // also update in db, so that if for some reason setting new image files fails, we are not left with the case where -
        // image was deleted in s3 but its url is set in database
        user.img = '';
        await user.save();
    }
    // Now save new image using new fileId
    const fileIds = [fileId];
    // Create Image sub documents
    // Update state of files in db and move objects from 'mayfly' to 'tortoise' directory
    const fileKeys = await updateStateAndPersist({
        fileIds,
        allowedTypes: ['image'],
    });
    _.forEach(fileKeys, (file) => {
        const originalPath = `${env.S3_BUCKET_WEBSITE_URL}/${file.key}`;
        user.img = `${originalPath}-150x150.webp`;
    });
    await user.save();
    return {
        location: user.img,
    };
};

exports.removePortfolioImage = async ({ user }) => {
    // First remove older image files
    if (user.img) {
        let oldImgOriginal = user.img.replace(
            env.S3_BUCKET_WEBSITE_URL + '/',
            '',
        );
        oldImgOriginal = oldImgOriginal.replace('-150x150.webp', '');
        const filesToRemove = [];
        // This condition is checked for backwards compatibility
        if (oldImgOriginal.includes(env.S3_BUCKET_FILE_FOLDER)) {
            filesToRemove.push(oldImgOriginal);
            // Remove resized versions of older image
            const versions = Object.values(C.PORTFOLIO_IMAGE_VERSIONS);
            for (let vr of versions) {
                filesToRemove.push(`${oldImgOriginal}-${vr}.webp`);
            }
        }
        if (filesToRemove.length > 0) {
            // Remove from s3 (tortoise); delete documents
            await deleteMultiple(env.S3_BUCKET_USER_DATA, filesToRemove);
            await deleteFilesByKey({ keys: filesToRemove });
        }
        user.img = '';
        await user.save();
    }
    return {
        msg: 'image removed',
    };
};

exports.createUserProfileByEmail = async ({ model, email, profile }) => {
    if (!model && !email && !profile) {
        throw new Error('missing required data');
    }
    await userService.createUserProfileByEmail(model, email, profile);
};

exports.getUserProfileByEmail = async ({ model, email }) => {
    if (!email && !model) {
        throw new Error('no email/model');
    }
    const user = await userService.getUserByEmail({ model, email });
    if (!user) {
        throw new Error('no such user');
    }
    return user;
};

exports.updateUserProfileByEmail = async ({ model, email, profile }) => {
    if (!model && !email && !profile) {
        throw new Error('missing required data');
    }
    await userService.updateUserProfileByEmail(model, email, profile);
};
// Report User
// Admin Module, Reports Page
exports.addReport = async ({ user, against, reason, report_type, postId }) => {
    let reportedUser = null;
    // If postId is available then we don't need to have userId for against
    // We can find details of user who is connected with opportunity
    if (postId && report_type === JOB_BOARD_REPORT_TYPE.POST) {
        const postData = await JobBoard.findOne({ _id: postId })
            .populate({
                path: 'client',
                select: ['n', 'e', 'id'],
            })
            .select('client');
        if (!postData) {
            throw BadRequest('No such opportunity found.');
        }
        reportedUser = postData.client;
    } else
        reportedUser = await User.findOne({
            _id: against,
        }).exec();
    if (reportedUser.__t === C.MODELS.WRITER_C) {
        await client_reported_creator({ client: user, writer: reportedUser });
    }

    if (!reportedUser) {
        throw new BadRequest(`Can't find user.`);
    }

    var againstDetails = {
        uid: reportedUser._id,
        first: reportedUser.n.f,
        last: reportedUser.n.l,
    };

    var byDetails = {
        uid: user._id,
        first: user.n.f,
        last: user.n.l,
    };

    var reportDetails = {
        against: againstDetails,
        by: byDetails,
        reason: reason,
        report_type: report_type,
    };

    if (postId) {
        reportDetails['postId'] = postId;
        if (user.__t === C.MODELS.WRITER_C) {
            await creator_reported_post({ writer: user, postId });
        }
    }

    const createdReport = await Report.create(reportDetails);
    if (!createdReport) {
        throw new InternalServerError("Report couldn't be created");
    } else {
        return { success: true };
    }
};

/**
 * GU controllers
 */

exports.verifyAcceptToJoin = async ({ token }) => {
    const decoded = await jwt.validateToken({ token });
    const { email, admin, gid, uc } = decoded.data;
    if (uc !== 'add-to-group') throw new BadRequest('Wrong token usecase');
    const user = await userService.getUserByEmail({ email });
    if (user) {
        if (user.__t !== C.MODELS.GU_C)
            throw new BadRequest(
                'User with email exists and is not a group user',
            );
        const group = await GroupConversation.findById(gid).exec();
        if (!group) throw new BadRequest('Group not found');
        const members = _.map(group.part, (member) => {
            return member.usr.toString();
        });
        if (members.includes(user.id))
            throw new BadRequest('User is already a member of the group');
        group.part.push({
            usr: user.id,
            ad: admin,
        });
        await group.save();
        // Create InfoText messages for the user added to group
        const senders = new Map();
        senders.set(user.id.toString(), user);
        await createMultipleInfoTextGroup({
            convoId: group.id,
            usecase: 'new-member',
            senders,
            userIds: [user.id.toString()],
            ownerId: group.own,
        });
        throw new BadRequest('User added to group. Redirect to login.');
    }
    // throw new BadRequest('Signup required');
    return { msg: 'Signup required', email };
};

exports.createGUandAddToGroup = async ({ token, password }) => {
    const decoded = await jwt.validateToken({ token });
    const { email, firstName, lastName, memberType, admin, gid, uc } =
        decoded.data;
    if (uc !== 'add-to-group') throw new BadRequest('Wrong token usecase');
    const user = await userService.getUserByEmail({ email });
    if (user) throw new BadRequest('User already exists');

    // Create a new GU
    const newGu = await userService.createUser({
        role: C.ROLES.GU_C,
        email,
        firstName,
        lastName,
        password,
    });
    newGu.accountStatus = C.ACCOUNT_STATUS.ACTIVE;
    newGu.emailVerificationToken = '';
    newGu.verifiedAt = Date.now();
    newGu.isEmailVerified = true;
    newGu.signupMode = C.ACCOUNT_SIGNUP_MODE.EMAIL;

    // Add GU to the group requested
    const group = await GroupConversation.findById(gid).exec();
    if (!group) throw new BadRequest('Group not found');
    const members = _.map(group.part, (member) => {
        return member.usr.toString();
    });
    if (members.includes(newGu.id))
        throw new BadRequest('User is already a member of the group');
    group.part.push({
        usr: newGu.id,
        ad: admin,
    });
    await newGu.save();
    await group.save();
    // Create InfoText messages for the user added to group
    const senders = new Map();
    senders.set(newGu.id.toString(), newGu);
    await createMultipleInfoTextGroup({
        convoId: group.id,
        usecase: 'new-member',
        senders,
        userIds: [newGu.id.toString()],
        ownerId: group.own,
    });
    // Update cache with latest data
    await updateConverstionInCacheGroup({
        conversation: group,
    });
    return {
        msg: 'Signed up and added to group',
    };
};

// ! Deprecated
exports.signupExtClient = async ({ token }) => {
    const decoded = await jwt.validateToken({ token });
    const { email, userId, uc } = decoded.data;
    if (uc !== 'creator-chat-invite')
        throw new BadRequest('Invalid token usecase');
    const user = await userService.findUserById({ id: userId });
    if (!user) throw new BadRequest('Invalid userId from token');
    let invitee = await userService.getUserByEmail({ email });
    let convo;
    if (invitee) {
        convo = await Conversation.findOne({
            $or: [
                {
                    u1: invitee.id,
                    u2: user.id,
                },
                {
                    u2: invitee.id,
                    u1: user.id,
                },
            ],
        }).exec();
        if (convo) {
            // ?? Can we remove created/init states
            if (convo.st == C.CONVERSATION_STATUS.CREATED)
                throw new BadRequest(
                    'You are already in conversation with this user',
                );
            else {
                convo.st = C.CONVERSATION_STATUS.CREATED;
            }
        }
    } else {
        invitee = new ExtClient({
            sgm: C.ACCOUNT_SIGNUP_MODE.EMAIL,
            n: { f: email, l: '' },
            e: email,
            // ?? In future when ExtClient wants to become a Client below fields should be set accordingly
            // Until then ExtClient can only access chat using a special link and token
            evt: undefined,
            iev: true,
            p: '',
            acst: C.ACCOUNT_STATUS.ACTIVE,
            refId: uuidv4(),
        });
    }
    if (!convo) {
        if (
            !(
                invitee.__t === C.ROLES.CLIENT_C ||
                invitee.__t === C.ROLES.EXT_CLIENT
            )
        ) {
            throw new BadRequest(
                'Email in token belongs to a role not from [client, extclient]',
            );
        }
        if (invitee.__t == C.ROLES.CLIENT_C) {
            convo = new ConversationClient({
                u1: invitee.id,
                u2: user.id,
                st: C.CONVERSATION_STATUS.CREATED,
                ctw: C.CONVERSATION_CLIENT_U2.CREATOR,
                sta: C.CONVERSATION_STATE.ACTIVE,
            });
        } else {
            convo = new ConversationExt({
                u1: invitee.id,
                u2: user.id,
                st: C.CONVERSATION_STATUS.CREATED,
            });
        }
    }
    await invitee.save();
    let createInfo = convo.isNew;
    await convo.save();
    if (createInfo) {
        const infoText = new InfoText({
            convoId: convo.id,
            usecase: 'convo-start',
            dtxt: 'This is the beginning of conversation',
            d: {},
            sd: invitee.id,
        });
        await infoText.save();
    }
    // TODO: send access token in email
    return {
        msg: 'Invite accepted from creator',
    };
};

const axios = require('axios');

// Config
const env = require('../config/env');
const C = require('../lib/constants');

// Services
// ***************For admin (roshan)********************
const emailService = require('../services/sendgrid/index');
const domainMail = 'service@passionbits.io';
const {
    for_admin_creator_registration_complete_mail,
    for_admin_client_after_registration_mail,
} = require('../utils/emails');
// **************************************
const { notification } = require('../messaging/index');
const { createSignupNotifications } = require('./notification');
const jwt = require('../lib/jwt');
const userService = require('../services/db/user');

// helpers

const { onWriterSignupOperations } = require('./helpers/userHelper');

// Errors
const { BadRequest } = require('../lib/errors');

async function getAccessTokenFromCode(code, redirect_uri) {
    try {
        const response = await axios({
            url: `https://oauth2.googleapis.com/token`,
            method: 'post',
            data: {
                // Manish > Changes
                // client_id: env.GOOGLE_CLIENT_ID,
                // client_secret: env.GOOGLE_CLIENT_SECRET,
                client_id: process.env.GOOGLE_CLIENT_ID,
                client_secret: process.env.GOOGLE_CLIENT_SECRET,
                redirect_uri,
                grant_type: 'authorization_code',
                code,
            },
        });
        return response.data.access_token;
    } catch (err) {
        throw new BadRequest('Failed to get access code from Google');
    }
}

async function getGoogleUserInfo(access_token) {
    const { data } = await axios({
        url: 'https://www.googleapis.com/oauth2/v2/userinfo',
        method: 'get',
        headers: {
            Authorization: `Bearer ${access_token}`,
        },
    });
    return data;
}

async function userDataForLoginSession(user, newUser = false) {
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
        newUser,
    };
}

function emailForAdmin(user) {
    const role = user.__t;
    // ***********For Admin (roshan) ****************
    if (role == C.ROLES.WRITER_C || role == C.ROLES.CLIENT_C) {
        let msgAdmin;
        if (role == 'Writer') {
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
    // ************************************
}

const userNotAllowedAccountStatus = [
    C.ACCOUNT_STATUS.BAN,
    C.ACCOUNT_STATUS.INACTIVE,
];

exports.confirmLogin = async ({ code }) => {
    const redirect_uri = `${env.GAUTH_FRONTEND_URL}/g-auth-login`;
    const access_token = await getAccessTokenFromCode(
        decodeURIComponent(code),
        redirect_uri,
    );
    const user_data = await getGoogleUserInfo(access_token);
    const user = await userService.getUserByEmail({ email: user_data.email });
    if (!user) {
        throw new BadRequest('User not found');
    }
    if (user.signupMode == C.ACCOUNT_SIGNUP_MODE.EMAIL)
        throw new BadRequest(
            'Signup was using email. Use email/password to login',
            'GL107',
        );

    if (userNotAllowedAccountStatus.includes(user.accountStatus)) {
        throw new BadRequest('Not allowed to signin');
    }
    return await userDataForLoginSession(user);
};

// splits name into firstName and lastName
function splitName(name) {
    const wordsInName = name.split(' ');
    let firstName = '';
    let lastName = '';
    if (wordsInName.length == 0) {
        throw new BadRequest('Name not found from google data');
    }
    if (wordsInName.length > 0) {
        firstName = wordsInName[0];
    }
    if (wordsInName.length > 1) {
        wordsInName.splice(0, 1);
        lastName = wordsInName.join(' ');
    }
    return { firstName, lastName };
}

exports.confirmSignup = async ({ code, role, referrer, signupMedium }) => {
    const redirect_uri = `${
        env.GAUTH_FRONTEND_URL
    }/g-auth-success-${role.toLowerCase()}`;
    const access_token = await getAccessTokenFromCode(
        decodeURIComponent(code),
        redirect_uri,
    );
    const user_data = await getGoogleUserInfo(access_token);
    const { email, name } = user_data;

    let user = await userService.getUserByEmail({ email });
    if (user) {
        if (user.signupMode == C.ACCOUNT_SIGNUP_MODE.EMAIL)
            throw new BadRequest(
                'User already signed up using email. Please use email/pass to login',
            );
        else {
            if (userNotAllowedAccountStatus.includes(user.accountStatus)) {
                throw new BadRequest('Not allowed to signin');
            }
            return await userDataForLoginSession(user);
        }
    }

    /*  const wordsInName = name.split(' ');
    let firstName = '';
    let lastName = '';
    if (wordsInName.length == 0) {
        throw new BadRequest('Name not found from google data');
    }
    if (wordsInName.length > 0) {
        firstName = wordsInName[0];
    }
    if (wordsInName.length > 1) {
        wordsInName.splice(0, 1);
        lastName = wordsInName.join(' ');
    } */

    let { firstName, lastName } = splitName(name);
    // Create user with acount status = new
    user = await userService.googleCreateUser({
        role,
        email,
        firstName,
        lastName,
    });
    user.isEmailVerified = true;
    user.verifiedAt = Date.now();
    user.signupMode = C.ACCOUNT_SIGNUP_MODE.GOOGLE;
    user.referrer = referrer;
    user.signupMedium = signupMedium;
    if (user.__t == C.MODELS.WRITER_C) {
        // Writer can directly become active
        // Clients need to provide other details to become
        user.accountStatus = C.ACCOUNT_STATUS.ACTIVE;
    }
    await user.save();
    // Create welcome notifications
    await createSignupNotifications({ user });
    // Send Welcome Email
    if (role !== C.ROLES.WRITER_C) {
        if (role == C.MODELS.CLIENT_C) {
            link = `${env.CLIENT_PROFILE}`;
        } else if (role == C.MODELS.PM_C) {
            link = `${env.PM_PORTFOLIO}/${user.stid}`;
        }
        await notification.send({
            usecase: C.NOTIF_USECASES[role].VERIFED_EMAIL,
            role,
            email: {
                email,
                name: user.fullname,
                link,
            },
        });
    } else {
        await onWriterSignupOperations({ user });
    }
    return await userDataForLoginSession(user, true);
};

exports.getDetailsFromCode = async ({ code }) => {
    const redirect_uri = `${env.GAUTH_FRONTEND_URL}/g-auth-success-template-writer`;

    const access_token = await getAccessTokenFromCode(
        decodeURIComponent(code),
        redirect_uri,
    );
    const user_data = await getGoogleUserInfo(access_token);
    const { email, name } = user_data;
    let { firstName, lastName } = splitName(name);

    const penname = await userService.generatePenname({ firstName, lastName });
    return {
        email,
        fullname: name,
        penname,
    };
};

exports.completeUserDetails = async ({
    user,
    role,
    city,
    country,
    creatorType,
    designation,
    industry,
    company,
    website,
    clientRole,
    firstName,
    lastName,
    medium,
    studioQA,
}) => {
    if (user.__t !== role) {
        throw new BadRequest('Invalid role from token');
    }
    if (
        user.signupMode == C.ACCOUNT_SIGNUP_MODE.GOOGLE &&
        user.accountStatus == C.ACCOUNT_STATUS.NEW
    ) {
        user.n = { f: firstName, l: lastName };
        if (role == C.ROLES.WRITER_C) {
            user.adr.ci = city;
            user.adr.co = country;
            user.cty = creatorType;
            user.pdg = designation;
        } else if (role == C.ROLES.CLIENT_C) {
            user.adr.co = country;
            user.ind = industry;
            user.cn = company;
            user.wbs = website;
            user.crl = clientRole;
        } else if (role == C.ROLES.PM_C) {
            user.adr.co = country;
            user.adr.ci = city;
            user.dsg = designation;
            user.m = medium;
            user.stq = studioQA;
            user.stdd.nm = `${firstName}'s Studio`;
        } else throw new BadRequest('unhandled role');
        user.accountStatus = C.ACCOUNT_STATUS.ACTIVE;
        await user.save();
        emailForAdmin(user);
        const responseData = await userDataForLoginSession(user);
        return {
            ...responseData,
            msg: 'Details submitted successfully. Account is now active',
        };
    } else {
        throw new BadRequest(
            'Not allowed for this signup mode or account status',
        );
    }
};

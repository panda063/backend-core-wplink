const {
    FRONTEND_URL,
    SERVICE_URL,
    PUBLIC_PROFILE_URL,
} = require('../config/env');
const { ROLES } = require('./constants');

function getFeUrlRoles({ role }) {
    switch (role) {
        case ROLES.WRITER_C:
            return 'writer';
        case ROLES.VE_C:
            return 'veditor';
        case ROLES.ME_C:
            return 'meditor';
        case ROLES.CSM_C:
            return 'csm';
        case ROLES.SA_C:
            return 'sadmin';
        case ROLES.CLIENT_C:
            return 'client';
        default:
            throw new Error('Link Generator Invalid role');
    }
}

function generateSubPath(role) {
    let subPath = role === ROLES.CLIENT_C ? 'client' : 'user-creator';
    return subPath;
}

function verifyEmail({ role, token }) {
    // role = String(role).toLowerCase();
    // const link = `${FRONTEND_URL}/${generateSubPath(role)}/verify/${token}`;
    const link = `${FRONTEND_URL}/verify/${token}`;
    return link;
}
function verifyEmailSuccess() {
    // role = getFeUrlRoles({ role });
    /* const link = `${FRONTEND_URL}/${generateSubPath(
        role
    )}/success/email-verified`; */
    const link = `${FRONTEND_URL}/success/email-verified`;
    return link;
}
function verifyEmailFailure() {
    // role = getFeUrlRoles({ role });
    /* const link = `${FRONTEND_URL}/${generateSubPath(
        role
    )}/success/link-expired`; */
    const link = `${FRONTEND_URL}/success/link-expired`;
    return link;
}

function pwdReset({ token, role }) {
    const link = `${FRONTEND_URL}/reset-password/${token}`;
    // const link = `${SERVICE_URL}/${role}/password-reset/${token}`;
    //const link = `${FRONTEND_URL}/${generateSubPath(
    //role;
    //)}/password-reset/${token}`;
    return link;
}
function pwdResetSuccess({ role, token }) {
    // role = getFeUrlRoles({ role });

    const link = `${FRONTEND_URL}/${generateSubPath(
        role,
    )}/${token}/change-password`;
    return link;
}
function pwdResetFailure({ role }) {
    // role = getFeUrlRoles({ role });
    const link = `${FRONTEND_URL}/${generateSubPath(
        role,
    )}/success/link-expired`;
    return link;
}

function publicProfileUrl({ penname }) {
    const link = `${PUBLIC_PROFILE_URL}/${penname}`;
    return link;
}

module.exports = {
    verifyEmail,
    verifyEmailSuccess,
    verifyEmailFailure,
    pwdReset,
    pwdResetSuccess,
    pwdResetFailure,
    publicProfileUrl,
};

/**
 * Web notification action constants
 */
const C = require('../lib/constants');
const WEB_NOTIF = {
    [C.ROLES.WRITER_C]: {
        VIEW_APPLICATION: 'View Application',
        VIEW_INVOICE: 'View Invoice',
    },
    [C.ROLES.CLIENT_C]: {
        VIEW_NEW_APPLICATIONS: 'View new Applications',
        VIEW_JOB: 'view-job',
    },
};

const WEB_NOTIF_ACTION_DATA = {
    VIEW_APPLICATION: ['applicationId'],
    VIEW_INVOICE: ['messageId', 'conversationId', 'fullname', 'type', 'status'],
    VIEW_NEW_APPLICATIONS: ['jobId'],
    VIEW_JOB: ['jobId'],
};

module.exports = {
    WEB_NOTIF,
};

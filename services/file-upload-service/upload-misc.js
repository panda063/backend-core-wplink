/**
 * Miscelleneous Upload
 */

/**
 * Module Dependencies
 */

const multer = require('multer');
const multerS3 = require('multer-s3-transform');
const sharp = require('sharp');
const path = require('path');
const { s3 } = require('../../config/aws');
// Bucket Name and Url
const {
    S3_BUCKET_USER_DATA_URL,
    S3_BUCKET_USER_DATA,
    S3_BUCKET_WEBSITE_URL,
} = require('../../config/env');
const C = require('../../lib/constants');
const jwt = require('../../lib/jwt');
const env = require('../../config/env');
// Maximum allowed image size in bytes
const FILE_SIZE_LIMIT = 5 * 1024 * 1024; // 5 MB

// Logo Size limit
const LOGO_SIZE_LIMIT = 1 * 1024 * 1024; // 1 MB

// Maximum allowed image size in bytes
const BRIEF_SIZE_LIMIT = 2 * 1024 * 1024; // 5 MB

const testimonialLogoUpload = multer({
    storage: multerS3({
        s3: s3,
        bucket: S3_BUCKET_USER_DATA,
        acl: 'public-read',
        contentDisposition: 'inline',
        contentType: multerS3.AUTO_CONTENT_TYPE,
        metadata: async function (req, file, cb) {
            const decoded = await jwt.validateToken({ token: req.body.token });
            const {
                creatorId,
                email,
                client_type,
                testimonialId,
            } = decoded.data;
            // metadata to be stored with each object in s3
            cb(null, {
                testimonialId: testimonialId,
            });
        },
        key: async function (req, file, cb) {
            const decoded = await jwt.validateToken({ token: req.body.token });
            const {
                creatorId,
                email,
                client_type,
                testimonialId,
            } = decoded.data;
            cb(
                null,
                `testimonialData/${testimonialId}${path.extname(
                    file.originalname,
                )}`,
            );
        },
    }),
    limits: {
        fileSize: LOGO_SIZE_LIMIT,
    },
    // Only jpeg, png and gif files are allowed
    fileFilter: (req, file, cb) => {
        if (/^image/i.test(file.mimetype)) {
            cb(null, true);
        } else cb(new Error('Only images are allowed'));
    },
});

const experienceLogoUpload = multer({
    storage: multerS3({
        s3: s3,
        bucket: S3_BUCKET_USER_DATA,
        acl: 'public-read',
        contentDisposition: 'inline',
        contentType: multerS3.AUTO_CONTENT_TYPE,
        metadata: function (req, file, cb) {
            // metadata to be stored with each object in s3
            cb(null, {
                experienceId: req.exp._id.toString(),
            });
        },
        key: function (req, file, cb) {
            cb(
                null,
                `${req.user.id}/experience/${req.exp._id.toString()}/logo`,
            );
        },
    }),
    limits: {
        fileSize: LOGO_SIZE_LIMIT,
    },
    // Only jpeg, png and gif files are allowed
    fileFilter: (req, file, cb) => {
        if (/^image/i.test(file.mimetype)) {
            cb(null, true);
        } else cb(new Error('Only images are allowed'));
    },
});

const brandLogoUpload = multer({
    storage: multerS3({
        s3: s3,
        bucket: S3_BUCKET_USER_DATA,
        acl: 'public-read',
        contentDisposition: 'inline',
        contentType: multerS3.AUTO_CONTENT_TYPE,
        metadata: function (req, file, cb) {
            // metadata to be stored with each object in s3
            cb(null, {
                brandLogoId: req.logo_testimonaial._id.toString(),
            });
        },
        key: function (req, file, cb) {
            cb(
                null,
                `${
                    req.user.id
                }/brandLogo/${req.logo_testimonaial._id.toString()}/logo`,
            );
        },
    }),
    limits: {
        fileSize: LOGO_SIZE_LIMIT,
    },
    // Only jpeg, png and gif files are allowed
    fileFilter: (req, file, cb) => {
        if (/^image/i.test(file.mimetype)) {
            cb(null, true);
        } else cb(new Error('Only images are allowed'));
    },
});

/**
 * Upload cover for the proposal template
 * * This is not used to upload cover when sending a proposal from chat
 */
const proposalCoverUpload = multer({
    storage: multerS3({
        s3: s3,
        bucket: S3_BUCKET_USER_DATA,
        acl: 'public-read',
        contentDisposition: 'inline',
        contentType: multerS3.AUTO_CONTENT_TYPE,
        metadata: function (req, file, cb) {
            // metadata to be stored with each object in s3
            cb(null, {
                proposalId: req.proposal.id,
            });
        },
        key: function (req, file, cb) {
            const prefix = `templates/${req.user.id}/${Date.now().toString()}-${
                req.proposal.id
            }-cover`;
            req.proposal.cover = `${S3_BUCKET_WEBSITE_URL}/${prefix}`;
            cb(null, prefix);
        },
    }),
    limits: {
        fileSize: FILE_SIZE_LIMIT,
    },
    // Only jpeg, png and gif files are allowed
    fileFilter: (req, file, cb) => {
        if (/^image/i.test(file.mimetype)) {
            cb(null, true);
        } else cb(new Error('Only images are allowed'));
    },
});

/**
 * Invite: reference and brief upload multer-s3 objects
 */
const inviteBriefUpload = multer({
    storage: multerS3({
        s3: s3,
        bucket: S3_BUCKET_USER_DATA,
        acl: 'public-read',
        contentDisposition: 'attachment',
        contentType: multerS3.AUTO_CONTENT_TYPE,
        metadata: function (req, file, cb) {
            // metadata to be stored with each object in s3
            cb(null, {
                conversationId: req.conversation.id,
            });
        },
        key: function (req, file, cb) {
            const prefix = `conversations/${req.conversation.id}/invite/brief-${file.originalname}`;
            cb(null, prefix);
        },
    }),
    limits: {
        fileSize: BRIEF_SIZE_LIMIT,
    },
    // Only pdf files are allowed
    fileFilter: (req, file, cb) => {
        let ext = path.extname(file.originalname);
        let mimeTypePdf = /^pdf/i.test(file.mimetype);
        if (ext !== '.pdf' && mimeTypePdf == false) {
            cb(new Error('Only pdfs are allowed'));
        } else cb(null, true);
    },
});

const inviteReferenceUpload = multer({
    storage: multerS3({
        s3: s3,
        bucket: S3_BUCKET_USER_DATA,
        acl: 'public-read',
        contentDisposition: 'attachment',
        contentType: multerS3.AUTO_CONTENT_TYPE,
        metadata: function (req, file, cb) {
            // metadata to be stored with each object in s3
            cb(null, {
                conversationId: req.conversation.id,
            });
        },
        key: function (req, file, cb) {
            const prefix = `conversations/${req.conversation.id}/invite/ref-${file.originalname}`;
            cb(null, prefix);
        },
    }),
    limits: {
        fileSize: BRIEF_SIZE_LIMIT,
    },
    fileFilter: (req, file, cb) => {
        let ext = path.extname(file.originalname);
        let mimeTypeImagePdf =
            /^image/i.test(file.mimetype) || /^pdf/i.test(file.mimetype);
        if (ext !== '.pdf' && mimeTypeImagePdf == false) {
            cb(new Error('Only images/pdfs are allowed'));
        } else cb(null, true);
    },
});

/**
 * Proposal cover upload on sending proposal in chat
 */
const sendProposalCoverUpload = multer({
    storage: multerS3({
        s3: s3,
        bucket: S3_BUCKET_USER_DATA,
        acl: 'public-read',
        contentDisposition: 'inline',
        contentType: multerS3.AUTO_CONTENT_TYPE,
        metadata: function (req, file, cb) {
            // metadata to be stored with each object in s3
            cb(null, {
                conversationId: req.conversation.id,
            });
        },
        key: function (req, file, cb) {
            const prefix = `conversations/${req.conversation.id}/${req.user.id}/${req.proposal.id}/cover`;
            cb(null, prefix);
        },
    }),
    limits: {
        fileSize: FILE_SIZE_LIMIT,
    },
    // Only jpeg, png and gif files are allowed
    fileFilter: (req, file, cb) => {
        if (/^image/i.test(file.mimetype)) {
            cb(null, true);
        } else cb(new Error('Only images are allowed'));
    },
});

/**
 * To upload files(images or other) in a message
 */
const sendFileUpload = multer({
    storage: multerS3({
        s3: s3,
        bucket: S3_BUCKET_USER_DATA,
        acl: 'public-read',
        contentDisposition: function (req, file, cb) {
            // Dynamically set up contentDisposition based on mimetype
            // image = inline, others = attachment
            if (/^image/i.test(file.mimetype)) {
                cb(null, 'inline');
            } else {
                cb(null, 'attachment');
            }
        },
        contentType: multerS3.AUTO_CONTENT_TYPE,
        metadata: function (req, file, cb) {
            // metadata to be stored with each object in s3
            cb(null, {
                conversationId: req.message.convoId.toString(),
            });
        },
        key: function (req, file, cb) {
            let newDoc;
            if (/^image/i.test(file.mimetype)) {
                newDoc = req.message.imgs.create({
                    ogn: file.originalname,
                });
            } else {
                newDoc = req.message.fuls.create({
                    ogn: file.originalname,
                });
            }
            let prefix;
            if (req.group) {
                prefix = `groupConversations/${req.message.convoId}/${req.user.id}/${req.message.id}/${newDoc.id}`;
            } else {
                prefix = `conversations/${req.message.convoId}/${req.user.id}/${req.message.id}/${newDoc.id}`;
            }

            newDoc.ul = `${env.S3_BUCKET_WEBSITE_URL}/${prefix}`;
            if (/^image/i.test(file.mimetype)) {
                req.message.imgs.push(newDoc);
            } else {
                req.message.fuls.push(newDoc);
            }
            cb(null, prefix);
        },
    }),
});

// Upload group conversation image
const groupImageUpload = multer({
    storage: multerS3({
        s3: s3,
        bucket: S3_BUCKET_USER_DATA,
        acl: 'public-read',
        contentDisposition: 'inline',
        contentType: multerS3.AUTO_CONTENT_TYPE,
        metadata: function (req, file, cb) {
            // metadata to be stored with each object in s3
            cb(null, {
                conversationId: req.group.id,
            });
        },
        key: function (req, file, cb) {
            cb(null, `groupConversations/${req.group.id}/logo`);
        },
    }),
});

module.exports = {
    testimonialLogoUpload,
    experienceLogoUpload,
    brandLogoUpload,
    proposalCoverUpload,
    inviteBriefUpload,
    inviteReferenceUpload,
    sendProposalCoverUpload,
    sendFileUpload,
    groupImageUpload,
};

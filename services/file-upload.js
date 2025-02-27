/*
 * Module Dependencies
 */
const multer = require('multer');
const multerS3 = require('multer-s3');
const path = require('path');
const { S3_BUCKET_USER_DATA } = require('../config/env');

const { s3 } = require('../config/aws');

const pmStudioImageUpload = multer({
    storage: multerS3({
        s3,
        bucket: `${S3_BUCKET_USER_DATA}`,
        contentDisposition: 'inline',
        acl: 'public-read',
        contentType(req, file, cb) {
            cb(null, file.mimetype);
        },
        metadata(req, file, cb) {
            cb(null, { fieldName: file.fieldname });
        },
        key(req, file, cb) {
            const { id } = req.user;
            cb(null, `${id.toString()}/studio`);
            // cb(null, `${id.toString()}/${Date.now().toString()}${ext}`);
        },
    }),
});

const portfolioImgUpload = multer({
    storage: multerS3({
        s3,
        bucket: `${S3_BUCKET_USER_DATA}`,
        contentDisposition: 'inline',
        acl: 'public-read',
        contentType(req, file, cb) {
            cb(null, file.mimetype);
        },
        metadata(req, file, cb) {
            cb(null, { fieldName: file.fieldname });
        },
        key(req, file, cb) {
            const { id } = req.user;
            cb(null, `${id.toString()}/profile`);
            // cb(null, `${id.toString()}/${Date.now().toString()}${ext}`);
        },
    }),
});

module.exports = {
    portfolioImgUpload,
    pmStudioImageUpload,
};

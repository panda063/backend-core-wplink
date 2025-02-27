const mongoose = require('mongoose');
const env = require('../../config/env');
const {
    emptyS3Directory,
    deleteMultiple,
} = require('../../utils/s3-operations');
const jwt = require('../../lib/jwt');

const preUploadMiddleware = async (req, res, next) => {
    const token = req.body.token;
    console.log(req);

    const decoded = await jwt.validateToken({ token });
    const { testimonialId } = decoded.data;

    req.testimonialId = testimonialId;
    return next();
};

const logoUploadErrorHandler = async (err, req, res, next) => {
    if (err) {
        if (Array.isArray(req.files) && req.files.length > 0) {
            const files = [req.files[0].key];
            await deleteMultiple(env.S3_BUCKET_USER_DATA, files);
        }
        return next(err);
    }
    return next();
};

module.exports = { preUploadMiddleware, logoUploadErrorHandler };

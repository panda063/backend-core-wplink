/**
 * Upload Images for 'Design Project and Long Form' to s3
 */

// TODO: Create Separate Microservice (File Upload Microservice)

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

// Maximum allowed image size in bytes
const FILE_SIZE_LIMIT = 10 * 1024 * 1024; // 10 MB

const upload = multer({
    storage: multerS3({
        s3: s3,
        bucket: S3_BUCKET_USER_DATA,
        acl: 'public-read',
        contentDisposition: 'inline',
        contentType: multerS3.AUTO_CONTENT_TYPE,
        metadata: function (req, file, cb) {
            // metadata to be stored with each object in s3
            cb(null, {
                fieldName: file.fieldname,
                originalName: file.originalname,
                encoding: file.encoding,
                mimetype: file.mimetype,
                creatorId: req.user.id,
                projectId: req.project.id,
                project_type: req.project.__t,
            });
        },
        /**
         * TODO: Optimization: Store webp version on upload. Use this to create other versions. This saves space by not storing the original image
         *
         */
        key: function (req, file, cb) {
            // Create new Image Subdocument in project
            req.project.img.push({ fty: 'webp' });
            // Get Subdoc
            const ImgSubDoc = req.project.img[req.project.img.length - 1];
            let ImgSubDocId = ImgSubDoc._id.toString();
            // Create Public Url of image
            const original = `${S3_BUCKET_WEBSITE_URL}/${req.user.id}/${req.project.__t}/${req.project.id}/${ImgSubDocId}`;
            // Compressed form in webp
            const imageURL = `${original}-webp.webp`;
            // Thumbnail
            const thumbnail = `${original}-thumb.webp`;
            ImgSubDoc.iurl = imageURL;
            ImgSubDoc.tbn = thumbnail;
            ImgSubDoc.og = original;
            cb(
                null,
                `${req.user.id}/${req.project.__t}/${req.project.id}/${ImgSubDocId}`
            );
        },
    }),
    limits: {
        fileSize: FILE_SIZE_LIMIT,
    },
    // Only jpeg, png and gif files are allowed
    fileFilter: (req, file, cb) => {
        let ext = path.extname(file.originalname);
        if (ext !== '.png' && ext !== '.jpg' && ext !== '.jpeg') {
            cb(new Error('Only images are allowed'));
        } else cb(null, true);
    },
});

module.exports = { upload };

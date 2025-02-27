// Dependencies
const mongoose = require('mongoose');
const _ = require('lodash');
const axios = require('axios');

const env = require('../config/env');
const C = require('../lib/constants');
const { BadRequest } = require('../lib/errors');

const logger = require('../lib/logger');

// Models
const FileUpload = mongoose.model(C.MODELS.FILE_UPLOAD);

// Services
const { s3OpsFUS } = require('../services/file-upload-service');

// s3 utilities
const { copyMultilple, deleteMultiple } = require('../utils/s3-operations');

// Constants
const SIGNED_URL_EXPIRATION = 60 * 60 * 4; // in seconds

const createFileUploads = async ({
    userId,
    contentType,
    original,
    count = 0,
}) => {
    if (!count || typeof count !== 'number' || count <= 0) {
        throw new BadRequest('Count should be a number and greater than 0');
    }
    let docs = [];
    for (let i = 0; i < count; i++) {
        const id = mongoose.Types.ObjectId().toHexString();
        const timestamp = new Date();
        let doc = {
            _id: id,
            us: 'started',
            u: userId,
            st: timestamp,
            key: `file-upload-mayfly/${id}_${timestamp.getTime()}`,
            cty: contentType,
            ogn: original[i],
        };
        docs.push(doc);
    }
    await FileUpload.create(docs);

    const returnDocs = _.map(docs, (doc) => {
        return {
            id: doc._id,
            key: doc.key,
        };
    });
    return returnDocs;
};

const getUploadUrl = async ({ user, contentType, original }) => {
    // Create a new document to initiate file upload process
    // ? Should we also store usecase
    // ? If we also store usecase, should we include it in s3 object key
    const newFileUpload = new FileUpload({
        u: user.id,
        cty: contentType,
        original,
    });
    let timestamp = newFileUpload.st.getTime();

    // we do this so that
    // presigned url contains info to allow content-disposition header to be sent
    // content-disposition header needs to be added in upload request from browser
    let contentDisposition = '';
    if (/^image/i.test(contentType)) {
        contentDisposition = 'inline';
    } else {
        contentDisposition = 'attachment';
    }
    // The operation that can be performed using this signed url is - putObject
    const { uploadUrl, key } = await s3OpsFUS.createS3presignedUrl({
        bucket: env.S3_BUCKET_USER_DATA,
        key: `file-upload-mayfly/${newFileUpload.id}_${timestamp}`,
        expires: SIGNED_URL_EXPIRATION, // in seconds
        contentType,
        contentDisposition,
    });
    newFileUpload.k = key;
    await newFileUpload.save();
    return { uploadUrl, key, id: newFileUpload.id };
};

/**
 * @fileIds FileId from file stored that will be moved to tortoise folder and persisted
 * @allowedTypes Before persisting verifying that each of the fileId type is from the allowedType
 */

const updateStateAndPersist = async ({ fileIds, allowedTypes }) => {
    // ?? In query include userId
    const files = await FileUpload.find({
        _id: { $in: fileIds },
        us: 'started',
    })
        .select('k cty ogn')
        .exec();
    if (files.length !== fileIds.length) {
        throw new BadRequest(
            'One or more fileIds not in started state or invalid',
        );
    }
    // First check if files have contentType in allowedType
    if (Array.isArray(allowedTypes) && allowedTypes.length > 0) {
        for (let file of files) {
            let isValid = false;
            for (let type of allowedTypes) {
                let typeRx = new RegExp(`${type}`);
                if (typeRx.test(file.contentType)) {
                    isValid = true;
                }
            }
            if (!isValid)
                throw new BadRequest(
                    'One or more file type not allowed to be uploaded',
                );
        }
    }
    const fileIdToKey = new Map();
    const transfers = [];
    _.forEach(files, (file) => {
        const newKey = file.k.replace('mayfly', 'tortoise');
        transfers.push({ source: file.k, destination: newKey });
        fileIdToKey.set(file.id, {
            key: newKey,
            contentType: file.cty,
            original: file.ogn,
        });
    });
    const orderedKeys = [];
    _.forEach(fileIds, (fileId) => {
        orderedKeys.push(fileIdToKey.get(fileId));
    });
    // console.log(transfers);
    // Move from 'mayfly' to 'tortoise'
    await copyMultilple(env.S3_BUCKET_USER_DATA, transfers);
    // Update state of files
    await FileUpload.updateMany(
        {
            _id: { $in: fileIds },
            us: 'started',
        },
        { us: 'finished' },
    ).exec();

    // We make an asynchronous requests to invoke lambda function through API Gateway to create compressed and resized version of images
    const imageRequestsUrls = [];

    for (let value of fileIdToKey.values()) {
        if (/^image/i.test(value.contentType)) {
            imageRequestsUrls.push(
                env.FILE_API_GATEWAY_PATH + value.key + '-webp.webp',
            );
        }
    }
    Promise.all(_.map(imageRequestsUrls, (url) => axios.head(url)))
        .then((values) => {})
        .catch((err) => {
            logger.error(err);
        });

    // Order of fileIds and orderedKeys is same
    return orderedKeys;
};

/**
 *
 * @param [keys] Array of s3 keys from the tortoise directory whose copy will be created
 * @returns Object with mapping of old key to new Key {oldKey: newKey}
 */

const copyFiles = async ({ keys }) => {
    const idFromKeys = _.map(keys, (key) => {
        return key.split('/')[1].split('_')[0];
    });
    const files = await FileUpload.find({
        _id: {
            $in: idFromKeys,
        },
        us: 'finished',
    }).exec();
    const transfers = [];
    const newFilesObjects = [];
    const result = {};
    _.forEach(files, (file) => {
        file = file.toJSON();
        const oldKey = file.key.replace('mayfly', 'tortoise');
        delete file['id'];
        delete file['startTime'];
        delete file['key'];
        delete file['createdAt'];
        delete file['updatedAt'];
        file._id = mongoose.Types.ObjectId();
        file.startTime = new Date();
        file.key = `file-upload-mayfly/${file._id.toString()}_${file.startTime.getTime()}`;
        transfers.push({
            source: oldKey,
            destination: file.key.replace('mayfly', 'tortoise'),
        });
        newFilesObjects.push(file);
        result[oldKey] = file.key.replace('mayfly', 'tortoise');
    });
    // console.log(transfers, newFilesObjects);

    await copyMultilple(env.S3_BUCKET_USER_DATA, transfers);
    await FileUpload.create(newFilesObjects);

    return result;
};

const deleteFilesByKey = async ({ keys }) => {
    if (keys.length <= 0) return;
    // Get ids from keys
    const fileIds = _.map(keys, (key) => {
        key = key.replace(`${env.S3_BUCKET_WEBSITE_URL}/`, '');
        const filename = key.split('/')[1];
        const fileId = filename.split('_')[0];
        return fileId;
    });

    await FileUpload.deleteMany({ _id: { $in: fileIds }, us: 'finished' });
};

const deleteSingleFileVersions = async ({ key, keys }) => {
    const keysToDelete = [];
    if (key) {
        keysToDelete.push(key);
    }
    if (Array.isArray(keys)) {
        keysToDelete.push(...keys);
    }
    const filesToRemove = [];
    _.forEach(keysToDelete, (key) => {
        // This condition is checked for backwards compatibility
        if (key.includes(env.S3_BUCKET_FILE_FOLDER)) {
            filesToRemove.push(key);
            // If file is image extra operation to remove resized versions
            // Note that if this is not an image and no resized files are present no error will be thrown
            // Remove resized versions of image
            const versions = Object.values(C.PORTFOLIO_IMAGE_VERSIONS);
            for (let vr of versions) {
                filesToRemove.push(`${key}-${vr}.webp`);
            }
        }
    });
    if (filesToRemove.length > 0) {
        // Remove from s3 (tortoise); delete documents
        await deleteMultiple(env.S3_BUCKET_USER_DATA, filesToRemove);
        await deleteFilesByKey({ keys: filesToRemove });
    }
};

module.exports = {
    createFileUploads,
    getUploadUrl,
    updateStateAndPersist,
    deleteFilesByKey,
    deleteSingleFileVersions,
    copyFiles,
};

const async = require('async');

const env = require('../config/env');

const { s3 } = require('../config/aws');

// Delete s3 object (Single file or directory)
// Takes Bucket and s3 directory(prefix) as parameters
async function emptyS3Directory(bucket, dir) {
    const listParams = {
        Bucket: bucket,
        Prefix: dir,
    };

    const listedObjects = await s3.listObjectsV2(listParams).promise();

    if (listedObjects.Contents.length === 0) {
        return;
    }

    const deleteParams = {
        Bucket: bucket,
        Delete: { Objects: [] },
    };

    listedObjects.Contents.forEach(({ Key }) => {
        deleteParams.Delete.Objects.push({ Key });
    });

    await s3.deleteObjects(deleteParams).promise();

    // listObjects is limited by 1000. So call function again recursively to delete more objects
    if (listedObjects.IsTruncated) await emptyS3Directory(bucket, dir);
}

// Delete Multiple Files
// files is array of prefixes
// Deleting non-existing files does not produce any error
async function deleteMultiple(bucket, files) {
    files = files.map((fl) => {
        return {
            Key: fl.replace(`${env.S3_BUCKET_WEBSITE_URL}/`, ''),
        };
    });
    const deleteParams = {
        Bucket: bucket,
        Delete: { Objects: files },
    };
    await s3.deleteObjects(deleteParams).promise();
}

// Upload File
async function uploadFile(bucket, fileName, data) {
    const params = {
        Bucket: bucket,
        ContentDisposition: 'inline',
        ACL: 'public-read',
        Key: fileName,
        Body: data,
    };
    await s3.upload(params).promise();
}

// Use for reading text files only
async function getObject(bucket, fileName) {
    const params = { Bucket: bucket, Key: fileName };
    const response = await s3.getObject(params).promise();
    return response.Body.toString();
}

async function headObject(bucket, key) {
    const params = {
        Bucket: bucket,
        Key: key,
    };
    await s3.headObject(params).promise();
}

async function copyObject(sourceBucket, destBucket, sourceKey, destinationKey) {
    const params = {
        Bucket: destBucket, // destination bucket
        CopySource: `${sourceBucket}/${sourceKey}`, // "/sourcebucket/HappyFacejpg",
        Key: destinationKey, // destination key
        ACL: 'public-read',
    };
    await s3.copyObject(params).promise();
}

/**
 * Copy files within same bucket
 */

async function copyMultilple(bucket, transfers) {
    // console.log(bucket, transfers);
    // First confirm if objects in transfer sources exits in bucket
    try {
        await async.each(transfers, async (transfer) => {
            await headObject(bucket, transfer.source);
        });
        await async.each(transfers, async (transfer) => {
            await copyObject(
                bucket,
                bucket,
                transfer.source,
                transfer.destination,
            );
        });
    } catch (err) {
        if (err.message.includes('NotFound')) {
            throw new Error('Source object not found in mayfly');
        } else {
            throw new Error(err);
        }
    }
}

async function copyMultilpleInterBucket(sourceBucket, destBucket, transfers) {
    // First confirm if objects in transfer sources exits in bucket
    try {
        await async.each(transfers, async (transfer) => {
            await headObject(sourceBucket, transfer.source);
        });
        await async.each(transfers, async (transfer) => {
            await copyObject(
                sourceBucket,
                destBucket,
                transfer.source,
                transfer.destination,
            );
        });
    } catch (err) {
        if (err.message.includes('NotFound')) {
            throw new Error('Source object not found in mayfly');
        } else {
            throw new Error(err);
        }
    }
}

module.exports = {
    emptyS3Directory,
    deleteMultiple,
    uploadFile,
    getObject,
    copyObject,
    copyMultilple,
    copyMultilpleInterBucket,
};

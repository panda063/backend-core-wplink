// s3
const { s3 } = require('../../config/aws');

exports.createS3presignedUrl = async ({
    bucket,
    key,
    expires,
    contentType,
    contentDisposition,
}) => {
    const s3Params = {
        Bucket: bucket,
        Key: key,
        Expires: expires, // in seconds
        ContentType: contentType,
        ACL: 'public-read',
        ContentDisposition: contentDisposition,
    };
    const uploadUrl = await s3.getSignedUrlPromise('putObject', s3Params);
    return { uploadUrl, key };
};

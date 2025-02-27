const { upload } = require('./image-upload');
const miscUpload = require('./upload-misc');
const s3OpsFUS = require('./aws-ops-fus');

module.exports = { upload, miscUpload, s3OpsFUS };

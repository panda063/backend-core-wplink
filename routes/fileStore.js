const router = require('express').Router();
const { celebrate, Joi } = require('celebrate');
Joi.objectId = require('joi-objectid')(Joi);
const c = require('./helper');

// Controllers
const fileStoreController = require('../controllers/fileStore');

router.post(
    '/get-upload-url',
    celebrate({
        body: Joi.object().keys({
            contentType: Joi.string().required(),
            original: Joi.string().trim().required(),
        }),
    }),
    c((req) => {
        const user = req.user;
        const { contentType, original } = req.body;
        return { user, contentType, original };
    }, fileStoreController.getUploadUrl),
);

module.exports = router;

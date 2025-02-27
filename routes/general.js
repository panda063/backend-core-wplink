const axios = require('axios');
const router = require('express').Router();
const { celebrate, Joi } = require('celebrate');
Joi.objectId = require('joi-objectid')(Joi);

const c = require('./helper');
const generalController = require('../controllers/general');

router.get(
    '/industries',
    c(() => {}, generalController.getIndustries),
);
/*
router.get(
  '/levels',
  c(() => {}, generalController.getLevels)
);
*/

router.get(
    '/countries',
    c(() => {}, generalController.getCountries),
);

router.post(
    '/city',
    celebrate({
        body: Joi.object().keys({
            country: Joi.string().required(),
        }),
    }),
    c((req) => {
        const country = req.body.country;
        return { country };
    }, generalController.getCityFromCountry),
);

router.post(
    '/skills',
    celebrate({
        body: Joi.object().keys({
            text: Joi.string().required(),
        }),
    }),
    c((req) => {
        const text = req.body.text;
        return { text };
    }, generalController.getSkill),
);

router.post(
    '/link-metadata',
    celebrate({
        body: Joi.object().keys({
            link: Joi.string()
                .regex(
                    /[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/,
                )
                .required(),
            fetchError: Joi.boolean().default(false),
        }),
    }),
    c((req) => {
        const { link, fetchError } = req.body;
        return { link, fetchError };
    }, generalController.getLinkMetadata),
);

router.get(
    '/company-search/:name',
    celebrate({
        params: Joi.object().keys({
            name: Joi.string()
                .min(1)
                .max(20)
                .required()
                .error(
                    new Joi.ValidationError('Invalid string length or type'),
                ),
        }),
    }),
    c((req) => {
        const { name } = req.params;
        return { name };
    }, generalController.searchCompanyByName),
);

router.get(
    '/company-logo/:domain',
    celebrate({
        params: Joi.object().keys({
            domain: Joi.string().required(),
        }),
    }),
    async (req, res, next) => {
        try {
            const domain = req.params.domain;
            // Input stream
            const clearbitRes = await axios({
                url: `https://logo.clearbit.com/${domain}`,
                responseType: 'stream',
                headers: {
                    Accept: 'image/avif,image/webp,*/*',
                    Host: 'logo.clearbit.com',
                    Referer: 'logo.clearbit.com',
                    'User-Agent':
                        'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:96.0) Gecko/20100101 Firefox/96.0',
                },
            });
            // Out put stream
            clearbitRes.data.pipe(res);
        } catch (err) {
            return res.json('Failed');
        }
    },
);

router.get(
    '/templates',
    c((req) => {}, generalController.getAllTemplates),
);

module.exports = router;

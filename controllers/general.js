/*
 * Module Dependencies
 */
const mongoose = require('mongoose');
const axios = require('axios');
const _ = require('lodash');
const countryData = require('../assets/countries.min.json');
const skillsData = require('../assets/skills.json');

const C = require('../lib/constants');
const env = require('../config/env');
const { InternalServerError, BadRequest } = require('../lib/errors');

const Industry = mongoose.model(C.MODELS.INDUSTRY_C);
// const Level = mongoose.model(C.MODELS.LEVEL_C);

// Services
const scraperService = require('../services/scraper');

// Misc
const templateData = require('../assets/templates/templates.json')[
    env.NODE_ENV
];

exports.getIndustries = async () => {
    let indList = await Industry.find({ st: C.INDUSTRY_STATUS.ACTIVE })
        .select('n v')
        .exec();
    if (!indList) {
        indList = [];
    }
    return indList;
};

exports.getCountries = async () => {
    let countryNames = Object.keys(countryData);
    return countryNames;
};

exports.getCityFromCountry = async ({ country }) => {
    let cities = [];
    if (countryData[country]) cities = countryData[country];
    return {
        cities,
    };
};

exports.getSkill = async ({ text }) => {
    text = text.toLowerCase();
    let skills = [];
    let count = 0;
    for (let skill of skillsData) {
        count += 1;
        if (skill.value.toLowerCase().startsWith(text)) {
            skills.push(skill.value);
        }
    }

    return {
        skills,
    };
};

exports.getLinkMetadata = async ({ link, fetchError }) => {
    try {
        const data = await scraperService.scrapeArticle({ targetUrl: link });
        return { ...data };
    } catch (err) {
        if (fetchError) {
            return {
                description: '',
                image: '',
                title: '',
                url: link,
                publisher: '',
                logo: '',
            };
        }
        throw new BadRequest('Error fetch url metadata');
    }
};

exports.searchCompanyByName = async ({ name }) => {
    const response = await axios({
        url: `https://autocomplete.clearbit.com/v1/companies/suggest?query=${name}`,
    });
    const clearbitRes = response.data;
    _.forEach(clearbitRes, (possible) => {
        possible.logo = possible.logo.replace(
            'https://logo.clearbit.com/',
            `${env.SERVICE_URL}company-logo/`,
        );
    });
    return {
        results: clearbitRes,
    };
};

/*
exports.getLevels = async () => {
  const levels = await Level.find().exec();
  if (!levels && levels.length === 0) {
    throw new InternalServerError('something went wrong');
  }
  return levels;
};
*/

exports.getAllTemplates = async () => {
    const templates = Object.values(templateData);
    const roles = new Set();
    for (let template of templates) {
        roles.add(template.role);
    }
    return { roles: Array.from(roles), templates: Object.values(templateData) };
};

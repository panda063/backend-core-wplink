const mongoose = require('mongoose');
const C = require('../lib/constants');
const GamificationAdmin = mongoose.model(C.MODELS.GAMIFICATION_AD);
const Gamification = mongoose.model(C.MODELS.GAMIFICATION_C);
const ClientGamification = mongoose.model(C.MODELS.C_GAMIFICATION_C);
const JobBoard = mongoose.model(C.MODELS.JOB_BOARD_C);
const Mentor = mongoose.model(C.MODELS.MENTOR_C);
const jwt = require('../lib/jwt');
const emailService = require('../services/sendgrid/index');
const bcrypt = require('bcrypt');
const { BadRequest, InternalServerError } = require('../lib/errors');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const mapToDbForSort = {
    PERKS: 'p',
    INVITATION: 'rc.rc',
    SUCCESS_INVITATION: 'rc.jc',
    LAST_ACTIVE: 'la',
};

// Register Gamification Admin
exports.register = async ({ email, password }) => {
    let hashPassword = await bcrypt.hash(password, 10);
    try {
        const newUser = new GamificationAdmin();
        newUser.e = email;
        newUser.pw = hashPassword;
        newUser.save();
        return {
            success: true,
        };
    } catch (err) {
        if (err.code === 11000 && err.name === 'MongoError') {
            return new BadRequest('EMAIL_EXISTS');
        } else {
            return new BadRequest();
        }
    }
};

// Login Gamification Admin
exports.login = async ({ email, password }) => {
    const user = await GamificationAdmin.findOne({ e: email });
    if (!user) {
        throw new BadRequest('Wrong Credentials.');
    }
    const isMatch = await bcrypt.compare(password, user.pw);
    if (!isMatch) {
        throw new BadRequest('Wrong Credentials');
    }
    const loginToken = await jwt.generateToken({
        data: { id: user._id, email },
        expiresIn: '1y',
    });
    return {
        token: loginToken,
    };
};

// Get list of Clients/Writes with filters
exports.getList = async ({ filter, sortBy, sortDirection, userType }) => {
    let filteredResult =
        userType === 'BUSINESS'
            ? await ClientGamification.find(filter)
            : await Gamification.find(filter).sort({
                  [mapToDbForSort[sortBy]]: sortDirection,
              });
    if (!filteredResult) {
        throw new InternalServerError();
    }
    const result =
        userType === 'BUSINESS'
            ? filteredResult.map((item) => ({
                  id: item._id,
                  subscription: item.s,
                  email: item.email,
                  name: item.n.f + ' ' + item.n.l,
                  isVerified: item.isVerified,
                  country: item.country,
                  work: item.work,
                  refCount: item.rc.rc,
                  joinCount: item.rc.jc,
                  lastActive: item.lastActive,
                  activity: item.activity,
              }))
            : filteredResult.map((item) => ({
                  id: item._id,
                  email: item.email,
                  name: item.n.f + ' ' + item.n.l,
                  isVerified: item.isVerified,
                  linkedIn: item.linkedIn,
                  country: item.add.c,
                  city: item.add.ct,
                  work: item.d,
                  perks: item.perks,
                  gauranteedProject: item.gauranteedProject,
                  fastGrowth: item.fastGrowth,
                  beLeader: item.beLeader,
                  tookSurvey: item.tookSurvey,
                  mailedUs: item.mailedUs,
                  refCount: item.rc.refCount,
                  joinCount: item.rc.joinCount,
                  lastActive: item.lastActive,
                  activity: item.activity,
              }));
    return {
        users: result,
    };
};

// Update Perks By 100 If and Only if User had not fill form previously
exports.setTakeSurvey = async ({}) => {
    const docForSurvey = new GoogleSpreadsheet(
        '1PXovi5sQ7npkeT9truNYsmAr6rB16swg-m6MHEz7BKs'
    );
    await docForSurvey.useServiceAccountAuth(
        require('../config/sheets_credentials.json')
    );
    await docForSurvey.loadInfo(); // loads document properties and worksheets
    const sheet = docForSurvey.sheetsByIndex[0];
    const rows = await sheet.getRows(); // can pass in { limit, offset }
    console.log(rows);
    const emails = rows.map((data) => {
        return data['Your Email?'];
    });
    const updatedResult = await Gamification.updateMany(
        { e: { $in: emails }, ts: false },
        { $set: { ts: true }, $inc: { p: 100 } }
    );
    if (!updatedResult) {
        throw new InternalServerError();
    }
    return {
        success: true,
        updatedResult,
    };
};

// Add perks to array of emails
exports.addPerks = async ({ emails, perks }) => {
    const updatedResult = await Gamification.updateMany(
        { e: { $in: emails } },
        { $inc: { p: perks } }
    );
    if (!updatedResult) {
        throw new InternalServerError();
    }
    return {
        users: updatedResult,
    };
};

// Send Bulk emails
exports.sendMailToMultipleUser = ({ emails, type }) => {
    const editedEmails = emails.map((email) => ({
        email: email,
    }));
    const message = {
        subject: `Testing Bulk Email`,
        // text: ' Your friend invited you. You can look join us via given link.',
        html: fetchMailByType(type),
    };
    console.log(editedEmails, message);
    emailService.sendBulkEmail(editedEmails, message, domainMail);
    return {
        success: true,
    };
};

// Add mentors from Google Sheet
exports.addMentorsFromSheet = async ({}) => {
    const doc = new GoogleSpreadsheet(
        '1lhZ_WXEXy0TAQTwRblUeitKZnZR6-rhvfu__fK_ZDXY'
    );
    await doc.useServiceAccountAuth(
        require('../config/sheets_credentials.json')
    );
    await doc.loadInfo(); // loads document properties and worksheets
    const sheet = doc.sheetsByIndex[1];
    const rows = await sheet.getRows(); // can pass in { limit, offset }
    const fetchedRow = rows.map((data) => {
        console.log(data._rawData);
        return {
            n: data._rawData[1],
            c: data._rawData[2],
            j: data._rawData[3],
            w: data._rawData[4],
            l: data._rawData[5],
            iu: data._rawData[6],
            em: data._rawData[9],
            cjc: data._rawData[8],
            cl: data._rawData[10],
        };
    });
    // console.log(fetchedRow);
    await Mentor.insertMany(fetchedRow);
    return {
        success: true,
    };
};

/*
 * Module Dependencies
 */
const _ = require('lodash');
const mongoose = require('mongoose');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const C = require('../../lib/constants');

const { InternalServerError, BadRequest } = require('../../lib/errors');
/*
 * Models
 */
const User = mongoose.model(C.MODELS.USER_C);
const Writer = require('../../models/users/writer');
const Client = require('../../models/users/client');
const PM = require('../../models/users/pm');
const GU = require('../../models/users/gu');
const ExtClient = require('../../models/users/extclient');

const {
    userRolesToModelNames,
    userModels: Users,
} = require('../../models/users');

const BaseUser = mongoose.model('User');

// validate user model
const validUserModel = (model) => {
    const User = Users[model];
    if (!User) {
        throw new Error('Wrong/Missing User Model');
    }
    return User;
};

/*
 * queries related to UserSchema part of Users
 */
exports.userExists = async ({ email, mobile }) => {
    let query = { e: createEmailRegex({ email }) };
    if (mobile) {
        query = {
            $or: [{ e: createEmailRegex({ email }) }, { mo: mobile }],
        };
    }
    const exists = await User.exists(query);
    return exists;
};
exports.mobileExists = async ({ mobileCountry = '+91', mobile }) => {
    const query = { moc: mobileCountry, mo: mobile };
    // console.log(query);
    const exists = await User.exists(query);
    return exists;
};

async function pennameExists({ penname }) {
    let exists = await User.exists({
        pn: { $regex: penname, $options: '-i' },
    });
    exists = exists || C.EXCLUDE_USERNAMES.includes(penname.toLowerCase());
    return exists;
}

exports.pennameExists = pennameExists;

/** Philosophy
 *
    Store emails with case sensitivity
    Send emails with case sensitivity
    Perform internal searches with case insensitivity
*/
exports.getUser = async ({ role, id, email }) => {
    if (!role) {
        throw new Error({
            name: 'USER_SERVICE',
            method: 'getUser',
            message: 'role is required',
        });
    }
    let query;
    if (id || email) {
        query = query || {};
        query = { __t: role };
    }
    if (id) {
        query = { ...query, _id: id };
    }
    if (email) {
        query = { ...query, e: createEmailRegex({ email }) };
    }
    const user = await User.findOne(query).exec();
    return user;
};

exports.findUserById = async ({ id }) => {
    const user = await User.findById(id).exec();
    return user;
};

exports.getUserById = ({ model, id }) => {
    const User = validUserModel(model);
    return User.findById(id).exec();
};

exports.getUserByUserName = ({ model, userName }) => {
    const User = validUserModel(model);
    return User.findOne({ userName }).exec();
};

exports.getUserByEmail = async ({ email }) => {
    const user = await User.findOne({
        e: createEmailRegex({ email }),
    }).exec();
    return user;
};

exports.getAllUsers = async ({ role }) => {
    let cond;
    const model = userRolesToModelNames[role];
    // let User;
    if (role === 'all') {
        cond = {};
        // User = BaseUser;
    } else if (model) {
        cond = { __t: model };
    } else {
        throw new InternalServerError('invalid role');
    }
    // const selStr = BaseUser.translateAliases({
    //   id: 1,
    //   'name.first': 1,
    //   'name.last': 1,
    //   email: 1,
    //   accountStatus: 1,
    //   createdAt: 1,
    //   updatedAt: 1,
    //   mobile: 1,
    //   // company: 1,
    // });
    // console.log(selStr);
    let users = await BaseUser.find(cond)
        // .select(selStr)
        .exec();
    // TODO: so inefficient
    users = _.map(users, (user) => {
        const {
            id,
            name,
            email,
            accountStatus: status,
            createdAt,
            updatedAt,
            mobile,
            company,
            __t: role,
        } = user;
        let firstName;
        let lastName;
        if (name) {
            firstName = name.first;
            lastName = name.last;
        }
        return {
            id,
            firstName,
            lastName,
            role,
            email,
            accountStatus: status,
            createdAt,
            updatedAt,
            mobile,
            company,
        };
    });
    return users;
};

// * User creation
const generatePenname = async ({ firstName, lastName, studio }) => {
    let fullName = firstName.trim() + ' ' + lastName.trim();
    fullName = fullName.trim();
    let penname = fullName.replace(/\W+/g, '-').toLowerCase();
    let random = crypto
        .randomBytes(6)
        .toString('base64')
        .replace(/\//g, '_') // Make url safe: replace / and + with _ and -
        .replace(/\+/g, '-');
    // * React router causes issues with trailing '-'
    penname = penname + '-' + random + 'z';
    // For studios / pm signup
    if (studio) {
        penname = 'studio' + '-' + penname + '-' + random + 'z';
    }
    return penname;
};

exports.generatePenname = generatePenname;

async function checkPenname(penname) {
    /*  let exists = await User.exists({
        pn: penname,
    });
    exists = exists || C.EXCLUDE_USERNAMES.includes(penname); */
    const exists = await pennameExists({ penname });
    if (exists) throw new BadRequest('Penname is not avaiable');
}

/**
 * Create User via signup with email/password
 */
const createWriter = async ({ email, password, penname }) => {
    const writer = new Writer();
    writer.refId = uuidv4();
    writer.email = email;
    writer.password = password;
    // writer.name = { first: firstName, last: lastName };
    /* writer.adr.ci = city;
    writer.adr.co = country;
    writer.cty = creatorType;
    writer.pdg = designation;
    writer.m = medium; */
    // Create Penname for user
    await checkPenname(penname);
    writer.pn = penname;
    writer.lac = Date.now();
    return writer;
};
function createClient({
    firstName,
    lastName,
    email,
    country,
    password,
    company,
    industry,
    website,
    clientRole,
}) {
    const client = new Client();
    client.refId = uuidv4();
    client.email = email;
    client.password = password;
    client.n = { f: firstName, l: lastName };
    client.wbs = website;
    client.adr.co = country;
    client.cn = company;
    client.ind = industry;
    client.crl = clientRole;
    client.lac = Date.now();
    return client;
}

async function createPM({
    email,
    firstName,
    lastName,
    password,
    country,
    city,
    designation,
    medium,
    studioQA,
}) {
    const pm = new PM();
    pm.refId = uuidv4();
    pm.email = email;
    pm.password = password;
    pm.name = { first: firstName, last: lastName };
    pm.adr.co = country;
    pm.adr.ci = city;
    pm.dsg = designation;
    pm.stq = studioQA;
    pm.stid = await generatePenname({ firstName, lastName, studio: true });
    pm.stdd.nm = `${firstName}'s Studio`;
    pm.m = medium;
    pm.lac = Date.now();
    return pm;
}

function createGU({ email, firstName, lastName, password }) {
    const gu = new GU({});
    gu.refId = uuidv4();
    gu.email = email;
    gu.password = password;
    gu.name = { first: firstName, last: lastName };
    gu.lac = Date.now();
    return gu;
}

function createExtClient({ firstName, email }) {
    const user = new ExtClient({
        sgm: C.ACCOUNT_SIGNUP_MODE.EMAIL,
        n: { f: firstName, l: '' },
        e: email,
        // ?? In future when ExtClient wants to become a Client below fields should be set accordingly
        // Until then ExtClient can only access chat using a special link and token
        evt: undefined,
        iev: true,
        p: '',
        acst: C.ACCOUNT_STATUS.ACTIVE,
        refId: uuidv4(),
    });
    return user;
}

exports.createUser = ({
    role,
    email,
    firstName,
    lastName,
    penname,
    password,
    mobile,
    country,
    city,
    medium,
    studioQA,
    designation,
    industry,
    company,
    website,
    clientRole,
    referrer,
    signupMedium,
}) => {
    // console.log(role);
    if (role === C.ROLES.WRITER_C) {
        return createWriter({
            email,
            password,
            penname,
        });
    }
    if (role === C.ROLES.CLIENT_C) {
        // add firstname and lastname
        // but temporory disabled
        return createClient({
            firstName,
            lastName,
            email,
            password,
            mobile,
            country,
            company,
            industry,
            website,
            clientRole,
        });
    }
    if (role == C.ROLES.PM_C) {
        return createPM({
            email,
            firstName,
            lastName,
            password,
            country,
            city,
            designation,
            medium,
            studioQA,
        });
    }
    if (role == C.MODELS.GU_C) {
        return createGU({
            email,
            firstName,
            lastName,
            password,
        });
    }
    if (role == C.MODELS.EXT_CLIENT) {
        return createExtClient({
            firstName,
            email,
        });
    }
    throw new Error('user creation unhandled role');
};

/**
 * Create user when signup is with google
 */

const googleCreateWriter = async ({ email, firstName, lastName }) => {
    const writer = new Writer();
    writer.refId = uuidv4();
    writer.email = email;
    writer.name = { first: firstName, last: lastName };
    // Create Penname for user
    writer.pn = await generatePenname({ firstName, lastName });
    writer.lac = Date.now();
    return writer;
};

function googleCreateClient({ firstName, lastName, email }) {
    const client = new Client();
    client.refId = uuidv4();
    client.email = email;
    client.n = { f: firstName, l: lastName };
    client.lac = Date.now();
    return client;
}

const googleCreatePM = async ({ email, firstName, lastName }) => {
    const pm = new PM();
    pm.refId = uuidv4();
    pm.email = email;
    pm.name = { first: firstName, last: lastName };
    // Create Penname for user
    pm.stid = await generatePenname({ firstName, lastName, studio: true });
    pm.stdd.nm = `${firstName}'s Studio`;
    pm.lac = Date.now();
    return pm;
};

exports.googleCreateUser = ({ role, email, firstName, lastName }) => {
    if (role === C.ROLES.WRITER_C) {
        return googleCreateWriter({
            email,
            firstName,
            lastName,
        });
    }
    if (role === C.ROLES.CLIENT_C) {
        return googleCreateClient({
            firstName,
            lastName,
            email,
        });
    }
    if (role == C.ROLES.PM_C) {
        return googleCreatePM({
            firstName,
            lastName,
            email,
        });
    }
    throw new Error('user creation unhandled role');
};

exports.updateUserByEmail = ({ model, email, data }) => {
    const User = validUserModel(model);
    return User.findOneAndUpdate(
        { e: createEmailRegex({ email }) },
        data,
    ).exec();
};

exports.deleteUserByEmail = ({ model, email }) => {
    const User = validUserModel(model);
    return User.findOneAndDelete({ e: createEmailRegex({ email }) }).exec();
};

function createEmailRegex({ email }) {
    return new RegExp(
        '^' + `${email}`.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + '$',
        'i',
    );
}

exports.createEmailFindRegex = createEmailRegex;

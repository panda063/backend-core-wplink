/*
 * Module Dependencies
 */
const _ = require('lodash');
const mongoose = require('mongoose');
const C = require('../../lib/constants');

const { InternalServerError } = require('../../lib/errors');

const User = mongoose.model(C.MODELS.USER_C);
const Writer = require('../../models/users/writer');
// const VE = require('../../models/users/ve');
// const ME = require('../../models/users/me');
const Client = require('../../models/users/client');
// const CSM = require('../../models/users/csm');

// const Writer = mongoose.model('Writer');
// const VE = mongoose.model('VE');
// const ME = mongoose.model('ME');
// const Client = mongoose.model('Client');
// const CSM = mongoose.model('CSM');
// const SA = mongoose.model('SA');
/*
 * Models
 */
const { userRolesToModelNames, userModels: Users } = require('../../models/users');

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
  let query = { e: email };
  if (mobile) {
    query = { $or: [{ e: email }, { mo: mobile }] };
  }
  const exists = await User.exists(query);
  return exists;
};
exports.mobileExists = async ({ mobile }) => {
  const query = { mo: mobile };
  const exists = await User.exists(query);
  return exists;
};

exports.getUser = ({ role, id, email }) => {
  if (!role) {
    throw new Error({ name: 'USER_SERVICE', method: 'getUser', message: 'role is required' });
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
    query = { ...query, e: email };
  }
  return User.findOne(query).exec();
};

exports.getUserById = ({ model, id }) => {
  const User = validUserModel(model);
  return User.findById(id).exec();
};

exports.getUserByUserName = ({ model, userName }) => {
  const User = validUserModel(model);
  return User.findOne({ userName }).exec();
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
const createWriter = ({
  email, password, firstName, lastName,
}) => {
  const writer = new Writer();
  writer.email = email;
  writer.password = password;
  writer.name = { first: firstName, last: lastName };
  // exam related
  writer.voexam = writer.voexam || {};
  writer.subexam = writer.subexam || {};
  writer.voexam.attemptsLeft = C.WRITER_EXAM_MAX_ATTEMPTS.VOEXAM;
  writer.subexam.attemptsLeft = C.WRITER_EXAM_MAX_ATTEMPTS.SUBEXAM;
  return writer;
};
function createClient({
  email, password, company, mobile,
}) {
  const client = new Client();
  client.email = email;
  client.password = password;
  client.company = company;
  client.mobile = mobile;
  return client;
}

exports.createUser = ({
  role, email, password, firstName, lastName, mobile, company,
}) => {
  if (role === C.ROLES.WRITER_C) {
    return createWriter({
      email,
      password,
      firstName,
      lastName,
    });
  }
  if (role === C.ROLES.CLIENT_C) {
    return createClient({
      email,
      password,
      company,
      mobile,
    });
  }
  throw new Error('user creation unhandled role');
  // const User = validUserModel(role);
  // let data = {
  //   email,
  //   password,
  //   'name.first': firstName,
  //   'name.last': lastName,
  //   accountStatus: 'new',
  // };
  // if (model === C.MODELS.WRITER_C) {
  //   data = {
  //     ...data,
  //     voexam: { attemptsLeft: C.WRITER_EXAM_MAX_ATTEMPTS.VOEXAM },
  //     subexam: { attemptsLeft: C.WRITER_EXAM_MAX_ATTEMPTS.SUBEXAM },
  //   };
  // }
  // if (model === 'Client') {
  //   data = { ...data, mobile, company };
  // }
  // if (model === 'VE') {
  //   data = { ...data, mobile };
  // }
  // const transData = User.translateAliases(data);
  // const user = await User.create(transData);
  // return user;
};

exports.updateUserByEmail = ({ model, email, data }) => {
  const User = validUserModel(model);
  return User.findOneAndUpdate({ email }, data);
};

exports.deleteUserByEmail = ({ model, email }) => {
  const User = validUserModel(model);
  return User.findOneAndDelete({ email }).exec();
};

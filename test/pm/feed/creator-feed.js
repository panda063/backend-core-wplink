// Dependencies

const request = require('supertest');
const expect = require('chai').expect;
const app = require('../../../index');
let mongoose = require('mongoose');
const _ = require('lodash');
let PM = mongoose.model('PM');
const Project = mongoose.model('Project');
const { token, email } = require('../../../config-test');

const cookie = `jwt=${token};`;

// Describe tests

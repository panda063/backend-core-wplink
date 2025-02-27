// Dependencies

const request = require('supertest');
const expect = require('chai').expect;
const app = require('../../../index');
let mongoose = require('mongoose');
const moment = require('moment');
let PM = mongoose.model('PM');
const JobBoard = mongoose.model('JobBoard');
const Application = mongoose.model('Application');
const { token, email } = require('../../../config-test');

const cookie = `jwt=${token};`;

// Describe tests

let pm,
    jobId = 'abc';

describe('get job details', () => {
    before(async () => {
        pm = await PM.find({ e: email }).exec();
        expect(pm.length).to.equal(1);
        pm = pm[0];
    });
    it('should give 400 as jobId is invalid', async () => {
        const res = await request(app)
            .get(`/pm/job-board/${jobId}`)
            .set('Cookie', cookie)
            .set('Content-type', 'application/json');
        expect(res.status).to.equal(400);
    });
    it('should give 200 and res has a field applied=applId', async () => {
        const appl = await Application.findOne({
            writer: pm.id,
        }).exec();
        if (appl) {
            jobId = appl.job;
            const res = await request(app)
                .get(`/pm/job-board/${jobId}`)
                .set('Cookie', cookie)
                .set('Content-type', 'application/json');
            expect(res.status).to.equal(200);
            expect(res.body.data.applied).to.be.a('string');
            expect(res.body.data.applied).to.equal(appl.id);
        }
    });
    it('should give 200 and res has a field applied=null', async () => {
        const appl = await Application.findOne({
            writer: { $ne: pm.id },
        }).exec();
        if (appl) {
            jobId = appl.job;
            const res = await request(app)
                .get(`/pm/job-board/${jobId}`)
                .set('Cookie', cookie)
                .set('Content-type', 'application/json');
            expect(res.status).to.equal(200);
            expect(res.body.data.applied).to.be.null;
        }
    });
});

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

describe('get applications from job', () => {
    before(async () => {
        pm = await PM.find({ e: email }).exec();
        expect(pm.length).to.equal(1);
        pm = pm[0];
    });
    it('should give 400 as jobId is invalid', async () => {
        let body = {};
        const res = await request(app)
            .get(`/pm/job-board/studio/${jobId}/applications`)
            .set('Cookie', cookie)
            .set('Content-type', 'application/json');
        expect(res.status).to.equal(400);
    });
    it('should give 200 and match applications', async () => {
        jobId = pm.opportunities[
            Math.floor(Math.random() * pm.opportunities.length)
        ].toString();
        let body = {};
        const res = await request(app)
            .get(`/pm/job-board/studio/${jobId}/applications`)
            .set('Cookie', cookie)
            .set('Content-type', 'application/json');
        expect(res.status).to.equal(200);
        const applications = res.body.data.applications.map((app) => {
            return app.id;
        });
        const appl = await Application.find({
            client: pm._id,
            job: jobId,
            _id: { $in: applications },
        }).exec();
        expect(appl.length).to.equal(applications.length);
    });
});

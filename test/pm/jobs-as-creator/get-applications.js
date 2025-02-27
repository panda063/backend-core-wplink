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

describe('get pm applications', () => {
    before(async () => {
        pm = await PM.find({ e: email }).exec();
        expect(pm.length).to.equal(1);
        pm = pm[0];
    });
    it('should give 200', async () => {
        const res = await request(app)
            .post(`/pm/job-board/applications`)
            .set('Cookie', cookie)
            .set('Content-type', 'application/json');
        expect(res.status).to.equal(200);
    });
    it('should give 200 and match application ids', async () => {
        const res = await request(app)
            .post(`/pm/job-board/applications`)
            .set('Cookie', cookie)
            .set('Content-type', 'application/json');
        expect(res.status).to.equal(200);
        const appIds = res.body.data.applications.map((appl) => {
            return appl.id;
        });
        const applications = await Application.find({
            writer: pm.id,
            _id: { $in: appIds },
        });
        // console.log(appIds, applications);
        expect(applications.length).to.equal(appIds.length);
    });
});

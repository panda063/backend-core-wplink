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
    jobId = 'abc',
    appId = 'abc';

describe('get studio jobs from PM', () => {
    before(async () => {
        pm = await PM.find({ e: email }).exec();
        expect(pm.length).to.equal(1);
        pm = pm[0];
    });
    it('should give 400 as jobId is not present', async () => {
        let body = {};
        const res = await request(app)
            .put(`/pm/job-board/studio/${jobId}/applications`)
            .send(body)
            .set('Cookie', cookie)
            .set('Content-type', 'application/json');
        expect(res.status).to.equal(400);
    });
    it('should give 400 as applId is not valid', async () => {
        let body = { applId: 'abc' };
        const res = await request(app)
            .put(`/pm/job-board/studio/${jobId}/applications`)
            .send(body)
            .set('Cookie', cookie)
            .set('Content-type', 'application/json');
        expect(res.status).to.equal(400);
    });
    it('should give 200 and match application status', async () => {
        jobId = pm.opportunities[
            Math.floor(Math.random() * pm.opportunities.length)
        ].toString();
        let getJob = await JobBoard.findOne({ _id: jobId }).exec();
        if (getJob.applications.length > 0) {
            appId = getJob.applications[
                Math.floor(Math.random() * getJob.applications.length)
            ].toString();
            // console.log(getJob, appId);
            let status = ['hired', 'shortlisted'];
            let body = {
                applId: appId,
                status: status[Math.floor(Math.random() * 2)],
            };
            const res = await request(app)
                .put(`/pm/job-board/studio/${jobId}/applications`)
                .send(body)
                .set('Cookie', cookie)
                .set('Content-type', 'application/json');
            expect(res.status).to.equal(200);
            const realApp = await Application.findOne({
                _id: appId,
            }).exec();
            expect(realApp.status).to.equal(body.status);
            // console.log(realApp);
        }
    });
});

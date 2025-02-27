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
    it('should give 400', async () => {
        const res = await request(app)
            .post(`/pm/job-board/${jobId}/applications`)
            .set('Cookie', cookie)
            .set('Content-type', 'application/json');
        expect(res.status).to.equal(400);
    });
    it('should give 400 as answer1 is required', async () => {
        const appl = await Application.findOne({
            writer: pm.id,
        }).exec();
        if (appl) {
            let jobId = appl.job;
            let body = {};
            const res = await request(app)
                .post(`/pm/job-board/${jobId}/applications`)
                .set('Cookie', cookie)
                .set('Content-type', 'application/json');
            expect(res.status).to.equal(400);
        }
    });
    it('should give 400 when pm already applied to job', async () => {
        const appl = await Application.findOne({
            writer: pm.id,
        }).exec();
        if (appl) {
            let jobId = appl.job;
            let body = { answer1: 'a1', answer2: 'a2' };
            const res = await request(app)
                .post(`/pm/job-board/${jobId}/applications`)
                .send(body)
                .set('Cookie', cookie)
                .set('Content-type', 'application/json');
            expect(res.status).to.equal(400);
            expect(res.body.errorCode).to.equal('CRJB103');
        }
    });
    it('should give 400 when pm already applied to job and 200 otherwise', async () => {
        const jobs = await JobBoard.find({
            status: 'active',
            clr: { $ne: 'PM' },
        }).exec();
        for (let i = 0; i < jobs.length; i++) {
            let jobId = jobs[i].id;
            const appl = await Application.findOne({
                job: jobId,
                writer: pm.id,
            }).exec();
            let body = { answer1: 'a1', answer2: 'a2' };
            const res = await request(app)
                .post(`/pm/job-board/${jobId}/applications`)
                .send(body)
                .set('Cookie', cookie)
                .set('Content-type', 'application/json');
            // console.log(jobId, appl);
            if (appl) {
                expect(res.status).to.equal(400);
                expect(res.body.errorCode).to.equal('CRJB103');
            } else {
                expect(res.status).to.equal(200);
            }
        }
    });
});

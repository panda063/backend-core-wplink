// Dependencies

const request = require('supertest');
const expect = require('chai').expect;
const app = require('../../../index');
let mongoose = require('mongoose');
const moment = require('moment');
let PM = mongoose.model('PM');
const JobBoard = mongoose.model('JobBoard');
const { token, email } = require('../../../config-test');

const cookie = `jwt=${token};`;

// Describe tests

let pm;

describe('get studio jobs from PM', () => {
    before(async () => {
        pm = await PM.find({ e: email }).exec();
        expect(pm.length).to.equal(1);
        pm = pm[0];
    });
    it('should give 200', async () => {
        let body = {};
        const res = await request(app)
            .post('/pm/job-board/studio/opportunitites')
            .send(body)
            .set('Cookie', cookie)
            .set('Content-type', 'application/json');
        expect(res.status).to.equal(200);
    });
    it('should give 200 and returns opportunities by PM', async () => {
        let body = {};
        const res = await request(app)
            .post('/pm/job-board/studio/opportunitites')
            .send(body)
            .set('Cookie', cookie)
            .set('Content-type', 'application/json');
        expect(res.status).to.equal(200);
        const opportunities = res.body.data.opportunities.map((job) => {
            return job.id;
        });
        const jobs = await JobBoard.find({
            client: pm._id,
            _id: { $in: opportunities },
        }).exec();
        expect(jobs.length).to.equal(opportunities.length);
    });
    it('should give 200 and returns active opportunities by PM', async () => {
        let body = {
            status: 'active',
        };
        const res = await request(app)
            .post('/pm/job-board/studio/opportunitites')
            .send(body)
            .set('Cookie', cookie)
            .set('Content-type', 'application/json');
        expect(res.status).to.equal(200);
        const opportunities = res.body.data.opportunities.map((job) => {
            return job.id;
        });
        const jobs = await JobBoard.find({
            client: pm._id,
            _id: { $in: opportunities },
            status: 'active',
        }).exec();
        expect(jobs.length).to.equal(opportunities.length);
    });
    it('should give 200 and returns under_review opportunities by PM', async () => {
        let body = { status: 'under_review' };
        const res = await request(app)
            .post('/pm/job-board/studio/opportunitites')
            .send(body)
            .set('Cookie', cookie)
            .set('Content-type', 'application/json');
        expect(res.status).to.equal(200);
        const opportunities = res.body.data.opportunities.map((job) => {
            return job.id;
        });
        const jobs = await JobBoard.find({
            client: pm._id,
            _id: { $in: opportunities },
            status: 'under_review',
        }).exec();
        expect(jobs.length).to.equal(opportunities.length);
    });
});

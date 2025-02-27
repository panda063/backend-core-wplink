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

describe('post new opportunity', () => {
    before(async () => {
        pm = await PM.find({ e: email }).exec();
        expect(pm.length).to.equal(1);
        pm = pm[0];
    });
    it('should give 400 as body is empty', async () => {
        let body = {};
        const res = await request(app)
            .post('/pm/job-board/studio')
            .send(body)
            .set('Cookie', cookie)
            .set('Content-type', 'application/json');
        expect(res.status).to.equal(400);
        expect(res.body.errorCode).to.equal('GL100');
    });
    it('should give 400 as contentType is invalid', async () => {
        let body = { contentType: 'abc' };
        const res = await request(app)
            .post('/pm/job-board/studio')
            .send(body)
            .set('Cookie', cookie)
            .set('Content-type', 'application/json');
        expect(res.status).to.equal(400);
        expect(res.body.errorCode).to.equal('GL100');
    });
    it('should give 400 when deadline is not a day more than current time', async () => {
        let body = {
            contentType: 'test',
            category: 'test',
            title: 'Website content pieces',
            description: 'SEO Pages',
            country: 'India',
            remuneration: 5000,
            remunerationUnit: 'total compensation',
            contentPieces: 2,
            deadline: new Date(moment()),
            tags: [],
            question1: 'Why do you want to work for this company?',
            question2: 'Most challenging task you have overcome?',
        };
        const res = await request(app)
            .post('/pm/job-board/studio')
            .send(body)
            .set('Cookie', cookie)
            .set('Content-type', 'application/json');
        expect(res.status).to.equal(400);
        expect(res.body.errorCode).to.equal('GL100');
    });
    it('should give 200 and job is posted and is from studio', async () => {
        let body = {
            contentType: 'Design',
            category: 'test',
            title: 'Website content pieces',
            description: 'SEO Pages',
            country: 'India',
            remuneration: 5000,
            remunerationUnit: 'total compensation',
            contentPieces: 2,
            deadline: new Date(moment().add(2, 'd')),
            tags: [],
            question1: 'Why do you want to work for this company?',
            question2: 'Most challenging task you have overcome?',
        };
        const res = await request(app)
            .post('/pm/job-board/studio')
            .send(body)
            .set('Cookie', cookie)
            .set('Content-type', 'application/json');
        expect(res.status).to.equal(200);
        pm = await PM.find({ e: email }).exec();
        expect(pm.length).to.equal(1);
        pm = pm[0];
        let newJobId = pm.opportunities[pm.opportunities.length - 1];
        let findJob = await JobBoard.find({ _id: newJobId }).exec();
        expect(findJob.length).to.equal(1);
        expect(findJob[0].clientRole).to.equal('PM');
    });
});

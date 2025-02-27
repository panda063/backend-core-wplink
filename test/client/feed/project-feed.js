// Dependencies

const request = require('supertest');
const expect = require('chai').expect;
const app = require('../../../index');
let mongoose = require('mongoose');
const _ = require('lodash');
let Client = mongoose.model('Client');
const Project = mongoose.model('Project');
const { token, email } = require('../../../config-test');

const cookie = `jwt=${token};`;

// Describe tests

let client;

describe('fetch project feed', () => {
    before(async () => {
        client = await Client.find({ e: email }).exec();
        expect(client.length).to.equal(1);
        client = client[0];
    });
    it('should give 200', async () => {
        let body = {};
        const res = await request(app)
            .post('/client/feed')
            .send(body)
            .set('Cookie', cookie)
            .set('Content-type', 'application/json');
        expect(res.status).to.equal(200);
    });
    it('should give 400 when budget range is invalid', async () => {
        let body = { budgetMin: -1, budgetMax: 100001 };
        const res = await request(app)
            .post('/client/feed')
            .send(body)
            .set('Cookie', cookie)
            .set('Content-type', 'application/json');
        expect(res.status).to.equal(400);
    });
    it('should give 400 when budget range is invalid', async () => {
        let body = { budgetMin: 0, budgetMax: 100001 };
        const res = await request(app)
            .post('/client/feed')
            .send(body)
            .set('Cookie', cookie)
            .set('Content-type', 'application/json');
        expect(res.status).to.equal(400);
    });
    it('should give 200 and response is valid', async () => {
        let body = {};
        const res = await request(app)
            .post('/client/feed')
            .send(body)
            .set('Cookie', cookie)
            .set('Content-type', 'application/json');
        expect(res.status).to.equal(200);
        const projects = res.body.data.projects;
        expect(projects).to.be.an('array');
        const pageDetails = res.body.data.pageDetails;
        if (projects.length > 0) {
            expect(projects[projects.length - 1].uniqueId).to.equal(
                pageDetails.next_cursor,
            );
        } else {
            expect(pageDetails.next_cursor).to.equal('');
        }
    });
    it('should give 200 and projects are from studio', async () => {
        let body = { fromTeams: true };
        const res = await request(app)
            .post('/client/feed')
            .send(body)
            .set('Cookie', cookie)
            .set('Content-type', 'application/json');
        expect(res.status).to.equal(200);
        const projects = res.body.data.projects;
        expect(projects).to.be.an('array');
        const pageDetails = res.body.data.pageDetails;
        if (projects.length > 0) {
            expect(projects[projects.length - 1].uniqueId).to.equal(
                pageDetails.next_cursor,
            );
        } else {
            expect(pageDetails.next_cursor).to.equal('');
        }
        let allStudio = true;
        for (let pro of projects) {
            allStudio = allStudio && pro.creatorRole == 'PM';
        }
        expect(allStudio).to.equal(true);
    });
});

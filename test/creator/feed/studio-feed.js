// Dependencies

const request = require('supertest');
const expect = require('chai').expect;
const app = require('../../../index');
let mongoose = require('mongoose');
const _ = require('lodash');
let Creator = mongoose.model('Writer');
const Project = mongoose.model('Project');
const { token, email } = require('../../../config-test');

const cookie = `jwt=${token};`;

// Describe tests

let creator;
describe('fetch studio feed', () => {
    before(async () => {
        creator = await Creator.find({ e: email }).exec();
        expect(creator.length).to.equal(1);
        creator = creator[0];
    });
    it('should give 200', async () => {
        let body = {};
        const res = await request(app)
            .post('/writer/feed/studio')
            .send(body)
            .set('Cookie', cookie)
            .set('Content-type', 'application/json');
        expect(res.status).to.equal(200);
    });
    it('should give 400 when studioProjects is invalid', async () => {
        let body = {
            studioProjects: 2,
        };
        const res = await request(app)
            .post('/writer/feed/studio')
            .send(body)
            .set('Cookie', cookie)
            .set('Content-type', 'application/json');
        expect(res.status).to.equal(400);
    });
    it('should give 400 when pmRating is invalid', async () => {
        let body = {
            pmRating: 6,
            page: 1,
        };
        const res = await request(app)
            .post('/writer/feed/studio')
            .send(body)
            .set('Cookie', cookie)
            .set('Content-type', 'application/json');
        expect(res.status).to.equal(400);
    });
    it('should give 400 when page is invalid', async () => {
        let body = { page: -1 };
        const res = await request(app)
            .post('/writer/feed/studio')
            .send(body)
            .set('Cookie', cookie)
            .set('Content-type', 'application/json');
        expect(res.status).to.equal(400);
    });
    it('should give 200 and response body is valid', async () => {
        let body = { page: 1 };
        const res = await request(app)
            .post('/writer/feed/studio')
            .send(body)
            .set('Cookie', cookie)
            .set('Content-type', 'application/json');
        expect(res.status).to.equal(200);
        const studios = res.body.data.studios;
        expect(studios).to.be.an('array');
        for (let studio of studios) {
            let {
                studioDetails,
                designation,
                studioStats,
                testimonials,
                image,
                fullname,
                samples,
            } = studio;
            expect(studioDetails).to.be.an('object');
            expect(designation).to.be.a('string');
            expect(studioStats).to.be.an('object');
            expect(testimonials).to.be.an('array');
            expect(image).to.be.a('string');
            expect(fullname).to.be.a('string');
            expect(samples).to.be.an('array');
        }

        const pageDetails = res.body.data.pageDetails;
        expect(pageDetails).to.be.an('object');
        expect(pageDetails.page).to.equal(body.page);
    });
});

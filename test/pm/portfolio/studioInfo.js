// Dependencies

const request = require('supertest');
const expect = require('chai').expect;
const app = require('../../../index');
let mongoose = require('mongoose');
let PM = mongoose.model('PM');
const { token, email } = require('../../../config-test');

const cookie = `jwt=${token};`;

// Describe tests

let pm;

describe('update studio info', () => {
    before(async () => {
        pm = await PM.find({ e: email }).exec();
        expect(pm.length).to.equal(1);
    });
    it('should give 400 on empty body', async () => {
        let body = {};
        const res = await request(app)
            .put('/pm/portfolio/studioInfo')
            .send(body)
            .set('Cookie', cookie)
            .set('Content-type', 'application/json');
        expect(res.status).to.equal(400);
        expect(res.body.errorCode).to.equal('GL100');
    });
    it('should give 400 on empty name', async () => {
        let body = {
            // name: "Arpit's Studio",
            description: 'Hey you',
            availability: true,
            creatorRequests: true,
            creatorsAllowed: 'writer',
            expertise: ['a', 'b'],
        };
        const res = await request(app)
            .put('/pm/portfolio/studioInfo')
            .send(body)
            .set('Cookie', cookie)
            .set('Content-type', 'application/json');
        expect(res.status).to.equal(400);
        expect(res.body.errorCode).to.equal('GL100');
    });
    it('should give 400 on empty creatorRequests', async () => {
        let body = {
            name: "Arpit's Studio",
            description: 'Hey you',
            availability: true,
            // creatorRequests: true,
            creatorsAllowed: 'writer',
            expertise: ['a', 'b'],
        };
        const res = await request(app)
            .put('/pm/portfolio/studioInfo')
            .send(body)
            .set('Cookie', cookie)
            .set('Content-type', 'application/json');
        expect(res.status).to.equal(400);
        expect(res.body.errorCode).to.equal('GL100');
    });
    it('should give 400 when creatorRequests is true and creatorAllowed is empty', async () => {
        let body = {
            name: "Arpit's Studio",
            description: 'Hey you',
            availability: true,
            creatorRequests: true,
            // creatorsAllowed: 'writer',
            expertise: ['a', 'b'],
        };
        const res = await request(app)
            .put('/pm/portfolio/studioInfo')
            .send(body)
            .set('Cookie', cookie)
            .set('Content-type', 'application/json');
        expect(res.status).to.equal(400);
        expect(res.body.errorCode).to.equal('GL100');
    });
    it('should give 400 when expertise is out of bounds', async () => {
        let body = {
            name: "Arpit's Studio",
            description: 'Hey you',
            availability: true,
            creatorRequests: true,
            creatorsAllowed: 'writer',
            expertise: ['a', 'b', 'c', 'd'],
        };
        const res = await request(app)
            .put('/pm/portfolio/studioInfo')
            .send(body)
            .set('Cookie', cookie)
            .set('Content-type', 'application/json');
        expect(res.status).to.equal(400);
        expect(res.body.errorCode).to.equal('GL100');
    });
    it('should give 200 and fields should match in db', async () => {
        let body = {
            name: "Arpit's Studio",
            description: 'Hey you',
            availability: true,
            creatorRequests: true,
            creatorsAllowed: 'writer',
            expertise: ['a', 'b', 'c'],
        };
        const res = await request(app)
            .put('/pm/portfolio/studioInfo')
            .send(body)
            .set('Cookie', cookie)
            .set('Content-type', 'application/json');
        expect(res.status).to.equal(200);
        pm = await PM.find({ e: email }).exec();
        expect(pm.length).to.equal(1);
        pm = pm[0];
        expect(pm.stdd.name).to.equal(body.name);
        expect(pm.stdd.description).to.equal(body.description);
        expect(pm.stdd.availability).to.equal(body.availability);
        expect(pm.stdd.creatorRequests).to.equal(body.creatorRequests);
        expect(pm.stdd.creatorsAllowed).to.equal(body.creatorsAllowed);
        let allMatch = true;
        for (let i = 0; i < pm.stdd.exp.length; i++) {
            allMatch = allMatch && pm.stdd.exp[i] == body.expertise[i];
        }
        expect(allMatch).to.equal(true);
    });
});

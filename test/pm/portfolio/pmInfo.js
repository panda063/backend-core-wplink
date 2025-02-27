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

describe('update pm info', () => {
    before(async () => {
        pm = await PM.find({ e: email }).exec();
        expect(pm.length).to.equal(1);
    });
    it('should give 400 on empty body', async () => {
        let body = {};
        const res = await request(app)
            .put('/pm/portfolio/pmInfo')
            .send(body)
            .set('Cookie', cookie)
            .set('Content-type', 'application/json');
        expect(res.status).to.equal(400);
        expect(res.body.errorCode).to.equal('GL100');
    });
    it('should give 400 on empty firstName', async () => {
        let body = {
            // firstName: 'Arpit',
            lastName: 'Pathak',
            designation: 'studio manager',
        };
        const res = await request(app)
            .put('/pm/portfolio/pmInfo')
            .send(body)
            .set('Cookie', cookie)
            .set('Content-type', 'application/json');
        expect(res.status).to.equal(400);
        expect(res.body.errorCode).to.equal('GL100');
    });
    it('should give 400 on empty designation', async () => {
        let body = {
            firstName: 'Arpit',
            lastName: 'Pathak',
            // designation: 'studio manager',
        };
        const res = await request(app)
            .put('/pm/portfolio/pmInfo')
            .send(body)
            .set('Cookie', cookie)
            .set('Content-type', 'application/json');
        expect(res.status).to.equal(400);
        expect(res.body.errorCode).to.equal('GL100');
    });
    it('should give 200 and fields should match in db', async () => {
        let body = {
            firstName: 'Arpit',
            lastName: 'Pathak',
            designation: 'studio manager',
        };
        const res = await request(app)
            .put('/pm/portfolio/pmInfo')
            .send(body)
            .set('Cookie', cookie)
            .set('Content-type', 'application/json');
        expect(res.status).to.equal(200);
        pm = await PM.find({ e: email }).exec();
        expect(pm.length).to.equal(1);
        pm = pm[0];
        expect(pm.n.f).to.equal(body.firstName);
        expect(pm.n.l).to.equal(body.lastName);
        expect(pm.dsg).to.equal(body.designation);
    });
});

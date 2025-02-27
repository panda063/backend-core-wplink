const request = require('supertest');
const expect = require('chai').expect;
const app = require('../../../../index');
let mongoose = require('mongoose');
let Creator = mongoose.model('Writer');
const { token, email } = require('../../../../config-test');
let creator;
describe('request testimonial via email', () => {
    before(async () => {
        creator = await Creator.find({ e: email }).exec();
        expect(creator.length).to.equal(1);
        creator = creator[0];
    });
    it('should give 400 and GL100', async () => {
        let body = {};
        const res = await request(app)
            .post('/writer/portfolio/testimonials/request-via-email')
            .send(body)
            .set('Authorization', `Bearer ${token}`)
            .set('Content-type', 'application/json');
        expect(res.status).to.equal(400);
        expect(res.body.errorCode).to.equal('GL100');
    });
    it('should give 400 and GL100 on missing reqMessage', async () => {
        // missing reqMessage
        let body = {
            email: 'aaa@gmail.com',
        };
        const res = await request(app)
            .post('/writer/portfolio/testimonials/request-via-email')
            .send(body)
            .set('Authorization', `Bearer ${token}`)
            .set('Content-type', 'application/json');
        expect(res.status).to.equal(400);
        expect(res.body.errorCode).to.equal('GL100');
    });
    it('should give 400 and GL100 on missing email', async () => {
        // missing email
        let body = {
            reqMessage: 'i want a testimonial',
        };
        const res = await request(app)
            .post('/writer/portfolio/testimonials/request-via-email')
            .send(body)
            .set('Authorization', `Bearer ${token}`)
            .set('Content-type', 'application/json');
        expect(res.status).to.equal(400);
        expect(res.body.errorCode).to.equal('GL100');
    });
    it('should give 400 or 200 depending upon if already invited', async () => {
        let body = {
            email: 'aaa@gmail.com',
            reqMessage: 'i want a testimonial',
        };
        const res = await request(app)
            .post('/writer/portfolio/testimonials/request-via-email')
            .send(body)
            .set('Authorization', `Bearer ${token}`)
            .set('Content-type', 'application/json');
        let found = false;
        for (let ts of creator.rtstm) {
            if (ts.cemail === body.email) found = true;
        }
        if (found) {
            expect(res.status).to.equal(400);
            expect(res.body.errorCode).to.equal('CRPL107');
        } else {
            expect(res.status).to.equal(200);
            creator = await Creator.find({ e: email }).exec();
            expect(creator.length).to.equal(1);
            creator = creator[0];
            for (let ts of creator.rtstm) {
                if (ts.cemail === body.email) found = true;
            }
            expect(found).to.equal(true);
        }
    });
    it('should give 400 or 200 depending upon if already invited', async () => {
        let body = {
            email: 'aaa@gmail.com',
            reqMessage: 'i want a testimonial',
        };
        const res = await request(app)
            .post('/writer/portfolio/testimonials/request-via-email')
            .send(body)
            .set('Authorization', `Bearer ${token}`)
            .set('Content-type', 'application/json');
        let found = false;
        for (let ts of creator.rtstm) {
            if (ts.cemail === body.email) found = true;
        }
        if (found) {
            expect(res.status).to.equal(400);
            expect(res.body.errorCode).to.equal('CRPL107');
        } else {
            expect(res.status).to.equal(200);
            creator = await Creator.find({ e: email }).exec();
            expect(creator.length).to.equal(1);
            creator = creator[0];
            for (let ts of creator.rtstm) {
                if (ts.cemail === body.email) found = true;
            }
            expect(found).to.equal(true);
        }
    });
});

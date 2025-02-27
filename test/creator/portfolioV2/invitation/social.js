const request = require('supertest');
const expect = require('chai').expect;
const app = require('../../../../index');
let mongoose = require('mongoose');
let Creator = mongoose.model('Writer');
const { token, email } = require('../../../../config-test');
let creator;
describe('invite via social', () => {
    before(async () => {
        creator = await Creator.find({ e: email }).exec();
        expect(creator.length).to.equal(1);
        creator = creator[0].toObject();
    });
    it('should give 400 and GL100', async () => {
        // empty body
        let body = {};
        const res = await request(app)
            .put('/writer/social-share')
            .send(body)
            .set('Authorization', `Bearer ${token}`)
            .set('Content-type', 'application/json');
        expect(res.status).to.equal(400);
        expect(res.body.errorCode).to.equal('GL100');
    });
    it('should give 400 and GL100', async () => {
        // missing status
        let body = {
            social: 'facebook',
        };
        const res = await request(app)
            .put('/writer/social-share')
            .send(body)
            .set('Authorization', `Bearer ${token}`)
            .set('Content-type', 'application/json');
        expect(res.status).to.equal(400);
        expect(res.body.errorCode).to.equal('GL100');
    });
    it('should give 400 and GL100', async () => {
        // missing social
        let body = {
            status: 'clicked',
        };
        const res = await request(app)
            .put('/writer/social-share')
            .send(body)
            .set('Authorization', `Bearer ${token}`)
            .set('Content-type', 'application/json');
        expect(res.status).to.equal(400);
        expect(res.body.errorCode).to.equal('GL100');
    });
    it('should give 400 and GL100', async () => {
        // invalid social
        let body = {
            social: 'faceboo',
            status: 'clicked',
        };
        const res = await request(app)
            .put('/writer/social-share')
            .send(body)
            .set('Authorization', `Bearer ${token}`)
            .set('Content-type', 'application/json');
        expect(res.status).to.equal(400);
        expect(res.body.errorCode).to.equal('GL100');
    });
    it('should give 400 and GL100', async () => {
        // invalid status
        let body = {
            social: 'facebook',
            status: 'posted',
        };
        const res = await request(app)
            .put('/writer/social-share')
            .send(body)
            .set('Authorization', `Bearer ${token}`)
            .set('Content-type', 'application/json');
        expect(res.status).to.equal(400);
        expect(res.body.errorCode).to.equal('GL100');
    });
    it('should give 200', async () => {
        // invalid status
        let body = {
            social: 'facebook',
            status: 'clicked',
        };
        const res = await request(app)
            .put('/writer/social-share')
            .send(body)
            .set('Authorization', `Bearer ${token}`)
            .set('Content-type', 'application/json');
        expect(res.status).to.equal(200);
    });
});

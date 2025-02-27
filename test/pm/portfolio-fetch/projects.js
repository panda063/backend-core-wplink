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

describe('fetch projects', () => {
    before(async () => {
        pm = await PM.find({ e: email }).exec();
        expect(pm.length).to.equal(1);
        pm = pm[0];
    });

    // Cards
    it('should give error on missing username', async () => {
        const res = await request(app)
            .post(`/common/studio/portfolio/Cards/`)
            .set('Content-type', 'application/json');
        expect(res.body.errorCode).to.equal('CND');
    });
    it('should give invalid username', async () => {
        const res = await request(app)
            .post(`/common/studio/portfolio/Cards/abc`)
            .set('Content-type', 'application/json');
        expect(res.status).to.equal(400);
        expect(res.body.errorCode).to.equal('CRGN100');
    });
    it('should give 200 and portfolio_owner is false', async () => {
        const res = await request(app)
            .post(`/common/studio/portfolio/Cards/${pm.stid}`)
            .set('Content-type', 'application/json');
        expect(res.status).to.equal(200);
        expect(res.body.data.portfolio_owner).to.equal(false);
    });
    it('should give 200 and portfolio_owner is true', async () => {
        const res = await request(app)
            .post(`/common/studio/portfolio/Cards/${pm.stid}`)
            .set('Cookie', cookie)
            .set('Content-type', 'application/json');
        expect(res.status).to.equal(200);
        expect(res.body.data.portfolio_owner).to.equal(true);
    });

    // LongForm
    it('should give error on missing username', async () => {
        const res = await request(app)
            .post(`/common/studio/portfolio/LongForm/`)
            .set('Content-type', 'application/json');
        expect(res.body.errorCode).to.equal('CND');
    });
    it('should give invalid username', async () => {
        const res = await request(app)
            .post(`/common/studio/portfolio/LongForm/abc`)
            .set('Content-type', 'application/json');
        expect(res.status).to.equal(400);
        expect(res.body.errorCode).to.equal('CRGN100');
    });
    it('should give 200 and portfolio_owner is false', async () => {
        const res = await request(app)
            .post(`/common/studio/portfolio/LongForm/${pm.stid}`)
            .set('Content-type', 'application/json');
        expect(res.status).to.equal(200);
        expect(res.body.data.portfolio_owner).to.equal(false);
    });
    it('should give 200 and portfolio_owner is true', async () => {
        const res = await request(app)
            .post(`/common/studio/portfolio/LongForm/${pm.stid}`)
            .set('Cookie', cookie)
            .set('Content-type', 'application/json');
        expect(res.status).to.equal(200);
        expect(res.body.data.portfolio_owner).to.equal(true);
    });
    // First Page of all projects
    it('should give error on missing username', async () => {
        const res = await request(app)
            .post(`/common/studio/portfolio/projects-first`)
            .set('Content-type', 'application/json');
        expect(res.body.errorCode).to.equal('CND');
    });
    it('should give invalid username', async () => {
        const res = await request(app)
            .post(`/common/studio/portfolio/projects-first/abc`)
            .set('Content-type', 'application/json');
        expect(res.status).to.equal(400);
        expect(res.body.errorCode).to.equal('CRGN100');
    });
    it('should give 200 and portfolio_owner is false', async () => {
        const res = await request(app)
            .post(`/common/studio/portfolio/projects-first/${pm.stid}`)
            .set('Content-type', 'application/json');
        expect(res.status).to.equal(200);
        expect(res.body.data.portfolio_owner).to.equal(false);
        expect(res.body.data.cards.posts).to.be.an('array');
        expect(res.body.data.cardsImported.posts).to.be.an('array');
        expect(res.body.data.longForm.posts).to.be.an('array');
        expect(res.body.data.longFormImported.posts).to.be.an('array');
    });
    it('should give 200 and portfolio_owner is true', async () => {
        const res = await request(app)
            .post(`/common/studio/portfolio/projects-first/${pm.stid}`)
            .set('Cookie', cookie)
            .set('Content-type', 'application/json');
        expect(res.status).to.equal(200);
        expect(res.body.data.portfolio_owner).to.equal(true);
        expect(res.body.data.cards.posts).to.be.an('array');
        expect(res.body.data.cardsImported.posts).to.be.an('array');
        expect(res.body.data.longForm.posts).to.be.an('array');
        expect(res.body.data.longFormImported.posts).to.be.an('array');
    });
});

const request = require('supertest');
const expect = require('chai').expect;
const app = require('../../../../index');
let mongoose = require('mongoose');
let Creator = mongoose.model('Writer');
const { token, email } = require('../../../../config-test');
let creator;
describe('update personal info', () => {
    before(async () => {
        creator = await Creator.find({ e: email }).exec();
        expect(creator.length).to.equal(1);
    });
    it('should give 400 and GL100 on empty body', async () => {
        // empty body
        let body = {};
        const res = await request(app)
            .put('/writer/portfolio/personalinfo')
            .send(body)
            .set('Authorization', `Bearer ${token}`)
            .set('Content-type', 'application/json');
        expect(res.status).to.equal(400);
        expect(res.body.errorCode).to.equal('GL100');
    });
    it('should give 400 and GL100 on missing country', async () => {
        // missing country
        let body = {
            firstName: 'arpit',
            lastName: 'pathak',
        };
        const res = await request(app)
            .put('/writer/portfolio/personalinfo')
            .send(body)
            .set('Authorization', `Bearer ${token}`)
            .set('Content-type', 'application/json');
        expect(res.status).to.equal(400);
        expect(res.body.errorCode).to.equal('GL100');
    });
    it('should give 400 and GL100 on missing lastName', async () => {
        // missing lastName
        let body = {
            firstName: 'arpit',
            country: 'usa',
        };
        const res = await request(app)
            .put('/writer/portfolio/personalinfo')
            .send(body)
            .set('Authorization', `Bearer ${token}`)
            .set('Content-type', 'application/json');
        expect(res.status).to.equal(400);
        expect(res.body.errorCode).to.equal('GL100');
    });
    it('should give 400 and GL100 on missing firstName', async () => {
        // missing firstName
        let body = {
            country: 'india',
            lastName: 'pathak',
        };
        const res = await request(app)
            .put('/writer/portfolio/personalinfo')
            .send(body)
            .set('Authorization', `Bearer ${token}`)
            .set('Content-type', 'application/json');
        expect(res.status).to.equal(400);
        expect(res.body.errorCode).to.equal('GL100');
    });
    it('should give 200 with correct body', async () => {
        let body = {
            firstName: 'arpit',
            country: 'india',
            lastName: 'pathak',
            city: 'lko',
            professionalDesignation: 'designer',
            linkedin: 'https://abc.com',
            instagram: 'https://abc.com',
            twitter: 'https://abc.com',
            medium: 'https://abc.com',
            dribbble: 'https://abc.com',
        };
        const res = await request(app)
            .put('/writer/portfolio/personalinfo')
            .send(body)
            .set('Authorization', `Bearer ${token}`)
            .set('Content-type', 'application/json');
        expect(res.status).to.equal(200);
        creator = await Creator.find({ e: email }).exec();
        expect(creator.length).to.equal(1);
        creator = creator[0];
        expect(creator.n.f).to.equal(body.firstName);
        expect(creator.n.l).to.equal(body.lastName);
        expect(creator.adr.country).to.equal(body.country);
        expect(creator.adr.city).to.equal(body.city);
        expect(creator.professionalDesignation).to.equal(
            body.professionalDesignation
        );
        expect(creator.sml.linkedin).to.equal(body.linkedin);
        expect(creator.sml.instagram).to.equal(body.instagram);
        expect(creator.sml.twitter).to.equal(body.twitter);
        expect(creator.sml.medium).to.equal(body.medium);
        expect(creator.sml.dribbble).to.equal(body.dribbble);
    });
    it('should give 200 with correct body when skills is updated', async () => {
        let body = {
            firstName: 'arpit',
            country: 'india',
            lastName: 'pathak',
            skills: ['abc', 'pqr'],
        };
        const res = await request(app)
            .put('/writer/portfolio/personalinfo')
            .send(body)
            .set('Authorization', `Bearer ${token}`)
            .set('Content-type', 'application/json');
        expect(res.status).to.equal(200);
        creator = await Creator.find({ e: email }).exec();
        expect(creator.length).to.equal(1);
        creator = creator[0];
        expect(creator.n.f).to.equal(body.firstName);
        expect(creator.n.l).to.equal(body.lastName);
        expect(creator.adr.country).to.equal(body.country);
        let allMatch = true;
        for (let i = 0; i < body.skills.length; i++) {
            if (body.skills[i] != creator.sls[i]) {
                allMatch = false;
            }
        }
        expect(allMatch).to.equal(true);
    });
});

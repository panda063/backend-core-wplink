// Dependencies

const request = require('supertest');
const expect = require('chai').expect;
const app = require('../../../index');
let mongoose = require('mongoose');
let PM = mongoose.model('PM');
const { token, email } = require('../../../config-test');

const cookie = `jwt=${token};`;

// Describe tests

let pm, members;

describe('studio members', () => {
    before(async () => {
        pm = await PM.find({ e: email }).exec();
        expect(pm.length).to.equal(1);
    });
    it('should give 200 and return members of studio', async () => {
        let body = {};
        const res = await request(app)
            .get('/pm/portfolio/studio-members')
            .set('Cookie', cookie);
        expect(res.status).to.equal(200);
        let allMatch = true;
        pm = pm[0];
        // console.log(pm.mmb, res.body.data);
        for (let i = 0; i < pm.mmb.length; i++) {
            allMatch =
                allMatch && pm.mmb[i].id == res.body.data.studioMembers[i].id;
        }
        expect(allMatch).to.equal(true);
        members = pm.mmb;
    });
    it('should give 400 when memberId is empty', async () => {
        let body = { /* memberId: 'abc' */ availability: true };
        const res = await request(app)
            .put('/pm/portfolio/set-availability')
            .send(body)
            .set('Cookie', cookie)
            .set('Content-type', 'application/json');
        expect(res.status).to.equal(400);
    });
    it('should give 400 when availability is empty', async () => {
        let body = { memberId: 'abc' /*availability: true*/ };
        const res = await request(app)
            .put('/pm/portfolio/set-availability')
            .send(body)
            .set('Cookie', cookie)
            .set('Content-type', 'application/json');
        expect(res.status).to.equal(400);
    });
    it('should give 400 when memberId is invalid', async () => {
        let body = { memberId: 'abc', availability: true };
        const res = await request(app)
            .put('/pm/portfolio/set-availability')
            .send(body)
            .set('Cookie', cookie)
            .set('Content-type', 'application/json');
        expect(res.status).to.equal(400);
    });
    it('should give 200 and correctly set member availability', async () => {
        if (members.length > 0) {
            let body = { memberId: members[0].id, availability: false };
            const res = await request(app)
                .put('/pm/portfolio/set-availability')
                .send(body)
                .set('Cookie', cookie)
                .set('Content-type', 'application/json');
            expect(res.status).to.equal(200);
            pm = await PM.find({ e: email }).exec();
            expect(pm.length).to.equal(1);
            pm = pm[0];
            let doc = pm.mmb.id(members[0].id);
            console.log('done');
            expect(doc).to.be.an('object');
            expect(doc.availability).to.equal(body.availability);
        }
    });
});

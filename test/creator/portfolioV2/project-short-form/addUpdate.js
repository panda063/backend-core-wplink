const request = require('supertest');
const expect = require('chai').expect;
const app = require('../../../../index');
let mongoose = require('mongoose');
let Creator = mongoose.model('Writer');
let Cards = mongoose.model('Cards');
const { token, email } = require('../../../../config-test');
let creator;
let sid;
describe('add/update short-form card', () => {
    before(async () => {
        creator = await Creator.find({ e: email }).exec();
        expect(creator.length).to.equal(1);
        creator = creator[0];
    });
    it('should give 400 and GL100 on empty body', async () => {
        let body = {};
        const res = await request(app)
            .post('/writer/portfolio/project/short-form')
            .send(body)
            .set('Authorization', `Bearer ${token}`)
            .set('Content-type', 'application/json');
        expect(res.status).to.equal(400);
        expect(res.body.errorCode).to.equal('GL100');
    });
    it('should give 200 and fields should match', async () => {
        let body = {
            title: 'story of my life',
            description: 'my journey',
            tags: ['progess'],
            txtCards: ['12 in 2016', 'cs in 2020'],
        };
        const res = await request(app)
            .post('/writer/portfolio/project/short-form')
            .send(body)
            .set('Authorization', `Bearer ${token}`)
            .set('Content-type', 'application/json');
        expect(res.status).to.equal(200);
        const findP = await Cards.findOne({
            t: body.title,
            desc: body.description,
            cty: 'short-form',
            cid: creator._id,
        });
        let found = false;
        if (findP) found = true;
        expect(found).to.equal(true);
        sid = findP._id;
    });
    it('should give 200 and fields should match on update', async () => {
        let body = {
            title: 'story of my life',
            description: 'my journey through time',
            tags: ['progess', 'life'],
            txtCards: ['10 in 2013', '12 in 2016', 'cs in 2020'],
        };
        const res = await request(app)
            .put(`/writer/portfolio/project/short-form/`)
            .send(body)
            .set('Authorization', `Bearer ${token}`)
            .set('Content-type', 'application/json');
        expect(res.status).to.equal(404);
    });
    it('should give 200 and fields should match on update', async () => {
        let body = {
            title: 'story of my life',
            description: 'my journey through time',
            tags: ['progess', 'life'],
            txtCards: ['10 in 2013', '12 in 2016', 'cs in 2020'],
        };
        const res = await request(app)
            .put(`/writer/portfolio/project/short-form/${sid}`)
            .send(body)
            .set('Authorization', `Bearer ${token}`)
            .set('Content-type', 'application/json');
        expect(res.status).to.equal(200);
        const findP = await Cards.findOne({
            t: body.title,
            desc: body.description,
            cty: 'short-form',
            _id: sid,
            cid: creator._id,
        });
        let found = false;
        if (findP) found = true;
        expect(found).to.equal(true);
    });
});

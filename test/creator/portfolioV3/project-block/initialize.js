const request = require('supertest');
const expect = require('chai').expect;
const app = require('../../../../index');
let mongoose = require('mongoose');
let Creator = mongoose.model('Writer');
const ProjectBlock = mongoose.model('ProjectBlock');

const { token, email } = require('../../../../config-test');

const cookie = `jwt=${token};`;

let creator;

describe('initialize project block', () => {
    before(async () => {
        creator = await Creator.find({ e: email }).exec();
        expect(creator.length).to.equal(1);
        creator = creator[0];
    });
    it('should give 400 if position is absent', async () => {
        let body = {};
        const res = await request(app)
            .post('/writer/v3.1/portfolio/block/project/init')
            .send(body)
            .set('Cookie', cookie)
            .set('Content-type', 'application/json');
        expect(res.status).to.equal(400);
    });
    it('should give 200', async () => {
        let body = {
            position: 'aa',
        };
        const res = await request(app)
            .post('/writer/v3.1/portfolio/block/project/init')
            .send(body)
            .set('Cookie', cookie)
            .set('Content-type', 'application/json');
        expect(res.status).to.equal(200);
        const block = await ProjectBlock.findOne({
            uid: creator.id,
            pst: 'init',
        }).exec();
        let found = block ? true : false;
        expect(found).to.equal(true);
    });
});

const request = require('supertest');
const expect = require('chai').expect;
const app = require('../../../../index');
let mongoose = require('mongoose');
let Creator = mongoose.model('Writer');

let ExperienceBlock = mongoose.model('ExperienceBlock');

const { token, email } = require('../../../../config-test');

const cookie = `jwt=${token};`;

let creator,
    eid = 'dne';

describe('Update experience block position', () => {
    before(async () => {
        creator = await Creator.find({ e: email }).exec();
        expect(creator.length).to.equal(1);
        creator = creator[0];
        const block = await ExperienceBlock.findOne({
            uid: creator.id,
        }).exec();
        if (block && block.exps.length > 0) {
            const randPos = Math.floor(Math.random() * block.exps.length) + 1;
            eid = block.exps[randPos - 1].id;
        }
    });
    it('should give 400 on empty body', async () => {
        if (eid !== 'dne') {
            let body = {};
            const res = await request(app)
                .put(`/writer/v3.1/portfolio/block/experience/position/${eid}`)
                .send(body)
                .set('Cookie', cookie)
                .set('Content-type', 'application/json');
            console.log(res.error.text);
            expect(res.status).to.equal(400);
        }
    });
    it('should give 200', async () => {
        if (eid !== 'dne') {
            let body = {
                position: 'abc',
            };
            const res = await request(app)
                .put(`/writer/v3.1/portfolio/block/experience/position/${eid}`)
                .send(body)
                .set('Cookie', cookie)
                .set('Content-type', 'application/json');
            console.log(res.error.text);
            expect(res.status).to.equal(200);
        }
    });
});

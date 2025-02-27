const request = require('supertest');
const expect = require('chai').expect;
const app = require('../../../../index');
let mongoose = require('mongoose');
let Creator = mongoose.model('Writer');
let Block = mongoose.model('Block');

const { token, email } = require('../../../../config-test');

const cookie = `jwt=${token};`;

let creator,
    bid = 'dne';

describe('update block position', () => {
    before(async () => {
        creator = await Creator.find({ e: email }).exec();
        expect(creator.length).to.equal(1);
        creator = creator[0];
        const blocks = await Block.find({
            uid: creator.id,
        }).exec();
        if (blocks.length > 0) {
            const randPos = Math.floor(Math.random() * blocks.length) + 1;
            bid = blocks[randPos].id;
            console.log(bid);
        }
    });
    it('should give 400 on empty body', async () => {
        if (bid !== 'dne') {
            let body = {};
            const res = await request(app)
                .put(`/writer/v3.1/portfolio/block/position/${bid}`)
                .send(body)
                .set('Cookie', cookie)
                .set('Content-type', 'application/json');
            expect(res.status).to.equal(400);
        }
    });
    it('should give 200', async () => {
        if (bid !== 'dne') {
            let body = {
                position: 'bbb',
            };
            const res = await request(app)
                .put(`/writer/v3.1/portfolio/block/position/${bid}`)
                .send(body)
                .set('Cookie', cookie)
                .set('Content-type', 'application/json');
            expect(res.status).to.equal(200);
        }
    });
});

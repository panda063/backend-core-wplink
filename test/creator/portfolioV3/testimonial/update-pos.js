const request = require('supertest');
const expect = require('chai').expect;
const app = require('../../../../index');
let mongoose = require('mongoose');
let Creator = mongoose.model('Writer');
let TestimonialBlock = mongoose.model('TestimonialBlock');

const { token, email } = require('../../../../config-test');

const cookie = `jwt=${token};`;

let creator,
    tid = 'dne';

describe('update testimonial position', () => {
    before(async () => {
        creator = await Creator.find({ e: email }).exec();
        expect(creator.length).to.equal(1);
        creator = creator[0];
        const block = await TestimonialBlock.findOne({
            uid: creator.id,
        }).exec();
        // console.log(block.tstm);
        if (block && block.tstm.length > 0) {
            const randPos = Math.floor(Math.random() * block.tstm.length) + 1;
            tid = block.tstm[randPos - 1].id;
        }
    });
    it('should give 400 if body is empty', async () => {
        let body = {};
        const res = await request(app)
            .post(`/writer/v3.1/portfolio/testimonial/position/${tid}`)
            .send(body)
            .set('Cookie', cookie)
            .set('Content-type', 'application/json');
        expect(res.status).to.equal(400);
    });
    it('should give 400 if tid=dne else 200', async () => {
        let body = {
            position: 'bbb',
        };
        const res = await request(app)
            .post(`/writer/v3.1/portfolio/testimonial/position/${tid}`)
            .send(body)
            .set('Cookie', cookie)
            .set('Content-type', 'application/json');
        if (tid == 'dne') expect(res.status).to.equal(400);
        else {
            expect(res.status).to.equal(200);
            const block = await TestimonialBlock.findOne({
                uid: creator.id,
            }).exec();
            const doc = block.tstm.id(tid);
            expect(doc.pos).to.equal(body.position);
        }
    });
});

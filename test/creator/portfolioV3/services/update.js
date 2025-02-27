const request = require('supertest');
const expect = require('chai').expect;
const app = require('../../../../index');
let mongoose = require('mongoose');
let Creator = mongoose.model('Writer');

let ServiceBlock = mongoose.model('ServiceBlock');

const { token, email } = require('../../../../config-test');

const cookie = `jwt=${token};`;

let creator,
    sid = 'dne';

describe('Add service block', () => {
    before(async () => {
        creator = await Creator.find({ e: email }).exec();
        expect(creator.length).to.equal(1);
        creator = creator[0];
        const blocks = await ServiceBlock.find({
            uid: creator.id,
        }).exec();
        if (blocks && blocks.length > 0) {
            const randPos = Math.floor(Math.random() * blocks.length) + 1;
            sid = blocks[randPos - 1].id;
        }
    });
    it('should give 400 on empty body', async () => {
        if (sid !== 'dne') {
            let body = {};
            const res = await request(app)
                .put(`/writer/v3.1/portfolio/block/service/${sid}`)
                .send(body)
                .set('Cookie', cookie)
                .set('Content-type', 'application/json');
            console.log(res.error.text);

            expect(res.status).to.equal(400);
        }
    });
    it('should give 400 on missing title', async () => {
        if (sid !== 'dne') {
            let body = {
                description: 'this is a test case',
                tags: ['a', 'b'],
                feesType: 'fixed',
                currency: 'inr',
                price: 200,
                rateUnit: 'day',
                deliveryTime: '5 days',
            };
            const res = await request(app)
                .put(`/writer/v3.1/portfolio/block/service/${sid}`)
                .send(body)
                .set('Cookie', cookie)
                .set('Content-type', 'application/json');
            console.log(res.error.text);

            expect(res.status).to.equal(400);
        }
    });
    it('should give 400 on missing description', async () => {
        if (sid !== 'dne') {
            let body = {
                title: 'test case',
                tags: ['a', 'b'],
                feesType: 'fixed',
                currency: 'inr',
                price: 200,
                rateUnit: 'day',
                deliveryTime: '5 days',
            };
            const res = await request(app)
                .put(`/writer/v3.1/portfolio/block/service/${sid}`)
                .send(body)
                .set('Cookie', cookie)
                .set('Content-type', 'application/json');
            console.log(res.error.text);

            expect(res.status).to.equal(400);
        }
    });
    it('should give 400 on missing feesType', async () => {
        if (sid !== 'dne') {
            let body = {
                title: 'test case',
                description: 'this is a test case',
                tags: ['a', 'b'],
                currency: 'inr',
                price: 200,
                rateUnit: 'day',
                deliveryTime: '5 days',
            };
            const res = await request(app)
                .put(`/writer/v3.1/portfolio/block/service/${sid}`)
                .send(body)
                .set('Cookie', cookie)
                .set('Content-type', 'application/json');
            console.log(res.error.text);

            expect(res.status).to.equal(400);
        }
    });
    it('should give 400 on missing currency', async () => {
        if (sid !== 'dne') {
            let body = {
                title: 'test case',
                description: 'this is a test case',
                tags: ['a', 'b'],
                feesType: 'fixed',
                price: 200,
                rateUnit: 'day',
                deliveryTime: '5 days',
            };
            const res = await request(app)
                .put(`/writer/v3.1/portfolio/block/service/${sid}`)
                .send(body)
                .set('Cookie', cookie)
                .set('Content-type', 'application/json');
            console.log(res.error.text);

            expect(res.status).to.equal(400);
        }
    });
    it('should give 400 on missing price', async () => {
        if (sid !== 'dne') {
            let body = {
                title: 'test case',
                description: 'this is a test case',
                tags: ['a', 'b'],
                feesType: 'fixed',
                currency: 'inr',
                rateUnit: 'day',
                deliveryTime: '5 days',
            };
            const res = await request(app)
                .put(`/writer/v3.1/portfolio/block/service/${sid}`)
                .send(body)
                .set('Cookie', cookie)
                .set('Content-type', 'application/json');
            console.log(res.error.text);

            expect(res.status).to.equal(400);
        }
    });
    it('should give 400 when feesType=rate and rateUnit is missing', async () => {
        if (sid !== 'dne') {
            let body = {
                title: 'test case',
                description: 'this is a test case',
                tags: ['a', 'b'],
                feesType: 'rate',
                currency: 'inr',
                price: 200,
                deliveryTime: '5 days',
            };
            const res = await request(app)
                .put(`/writer/v3.1/portfolio/block/service/${sid}`)
                .send(body)
                .set('Cookie', cookie)
                .set('Content-type', 'application/json');
            console.log(res.error.text);
            expect(res.status).to.equal(400);
        }
    });
    it('should give 400 when feesType is not rate and rateUnit is not null', async () => {
        if (sid !== 'dne') {
            let body = {
                title: 'test case',
                description: 'this is a test case',
                tags: ['a', 'b'],
                feesType: 'fixed',
                currency: 'inr',
                price: 200,
                rateUnit: 'day',
                deliveryTime: '5 days',
            };
            const res = await request(app)
                .put(`/writer/v3.1/portfolio/block/service/${sid}`)
                .send(body)
                .set('Cookie', cookie)
                .set('Content-type', 'application/json');
            console.log(res.error.text);
            expect(res.status).to.equal(400);
        }
    });
    it('should give 200', async () => {
        if (sid !== 'dne') {
            let body = {
                title: 'test case',
                description: 'this is a test case',
                tags: ['a', 'b'],
                feesType: 'rate',
                currency: 'inr',
                price: 200,
                rateUnit: 'day',
                deliveryTime: '5 days',
            };
            const res = await request(app)
                .put(`/writer/v3.1/portfolio/block/service/${sid}`)
                .send(body)
                .set('Cookie', cookie)
                .set('Content-type', 'application/json');
            expect(res.status).to.equal(200);
        }
    });
    it('should give 200', async () => {
        if (sid !== 'dne') {
            let body = {
                title: 'test case',
                description: 'this is a test case',
                tags: ['a', 'b'],
                feesType: 'fixed',
                currency: 'inr',
                price: 200,
                deliveryTime: '5 days',
            };
            const res = await request(app)
                .put(`/writer/v3.1/portfolio/block/service/${sid}`)
                .send(body)
                .set('Cookie', cookie)
                .set('Content-type', 'application/json');
            expect(res.status).to.equal(200);
        }
    });
});

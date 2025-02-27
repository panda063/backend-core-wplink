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
        /*   const block = await ExperienceBlock.findOne({
            uid: creator.id,
        }).exec();
        if (block && block.exps.length > 0) {
            const randPos = Math.floor(Math.random() * block.exps.length) + 1;
            eid = block.exps[randPos - 1];
        } */
    });
    it('should give 400 on empty body', async () => {
        let body = {};
        const res = await request(app)
            .post(`/writer/v3.1/portfolio/block/service`)
            .send(body)
            .set('Cookie', cookie)
            .set('Content-type', 'application/json');
        console.log(res.error.text);

        expect(res.status).to.equal(400);
    });
    it('should give 400 on missing title', async () => {
        let body = {
            position: 'a',
            description: 'this is a test case',
            tags: ['a', 'b'],
            feesType: 'fixed',
            currency: 'inr',
            price: 200,
            rateUnit: 'day',
            deliveryTime: '5 days',
        };
        const res = await request(app)
            .post(`/writer/v3.1/portfolio/block/service`)
            .send(body)
            .set('Cookie', cookie)
            .set('Content-type', 'application/json');
        console.log(res.error.text);

        expect(res.status).to.equal(400);
    });
    it('should give 400 on missing description', async () => {
        let body = {
            position: 'a',
            title: 'test case',
            tags: ['a', 'b'],
            feesType: 'fixed',
            currency: 'inr',
            price: 200,
            rateUnit: 'day',
            deliveryTime: '5 days',
        };
        const res = await request(app)
            .post(`/writer/v3.1/portfolio/block/service`)
            .send(body)
            .set('Cookie', cookie)
            .set('Content-type', 'application/json');
        console.log(res.error.text);

        expect(res.status).to.equal(400);
    });
    it('should give 400 on missing feesType', async () => {
        let body = {
            position: 'a',
            title: 'test case',
            description: 'this is a test case',
            tags: ['a', 'b'],
            currency: 'inr',
            price: 200,
            rateUnit: 'day',
            deliveryTime: '5 days',
        };
        const res = await request(app)
            .post(`/writer/v3.1/portfolio/block/service`)
            .send(body)
            .set('Cookie', cookie)
            .set('Content-type', 'application/json');
        console.log(res.error.text);

        expect(res.status).to.equal(400);
    });
    it('should give 400 on missing currency', async () => {
        let body = {
            position: 'a',
            title: 'test case',
            description: 'this is a test case',
            tags: ['a', 'b'],
            feesType: 'fixed',
            price: 200,
            rateUnit: 'day',
            deliveryTime: '5 days',
        };
        const res = await request(app)
            .post(`/writer/v3.1/portfolio/block/service`)
            .send(body)
            .set('Cookie', cookie)
            .set('Content-type', 'application/json');
        console.log(res.error.text);

        expect(res.status).to.equal(400);
    });
    it('should give 400 on missing price', async () => {
        let body = {
            position: 'a',
            title: 'test case',
            description: 'this is a test case',
            tags: ['a', 'b'],
            feesType: 'fixed',
            currency: 'inr',
            rateUnit: 'day',
            deliveryTime: '5 days',
        };
        const res = await request(app)
            .post(`/writer/v3.1/portfolio/block/service`)
            .send(body)
            .set('Cookie', cookie)
            .set('Content-type', 'application/json');
        console.log(res.error.text);

        expect(res.status).to.equal(400);
    });
    it('should give 400 when feesType=rate and rateUnit is missing', async () => {
        let body = {
            position: 'a',
            title: 'test case',
            description: 'this is a test case',
            tags: ['a', 'b'],
            feesType: 'rate',
            currency: 'inr',
            price: 200,
            deliveryTime: '5 days',
        };
        const res = await request(app)
            .post(`/writer/v3.1/portfolio/block/service`)
            .send(body)
            .set('Cookie', cookie)
            .set('Content-type', 'application/json');
        console.log(res.error.text);
        expect(res.status).to.equal(400);
    });
    it('should give 400 when feesType is not rate and rateUnit is not null', async () => {
        let body = {
            position: 'a',
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
            .post(`/writer/v3.1/portfolio/block/service`)
            .send(body)
            .set('Cookie', cookie)
            .set('Content-type', 'application/json');
        console.log(res.error.text);
        expect(res.status).to.equal(400);
    });
    it('should give 200', async () => {
        let body = {
            position: 'a',
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
            .post(`/writer/v3.1/portfolio/block/service`)
            .send(body)
            .set('Cookie', cookie)
            .set('Content-type', 'application/json');
        expect(res.status).to.equal(200);
    });
    it('should give 200', async () => {
        let body = {
            position: 'a',
            title: 'test case',
            description: 'this is a test case',
            tags: ['a', 'b'],
            feesType: 'fixed',
            currency: 'inr',
            price: 200,
            deliveryTime: '5 days',
        };
        const res = await request(app)
            .post(`/writer/v3.1/portfolio/block/service`)
            .send(body)
            .set('Cookie', cookie)
            .set('Content-type', 'application/json');
        expect(res.status).to.equal(200);
    });
});

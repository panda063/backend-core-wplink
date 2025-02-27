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

describe('Add experience block', () => {
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
            .post(`/writer/v3.1/portfolio/block/experience`)
            .send(body)
            .set('Cookie', cookie)
            .set('Content-type', 'application/json');
        console.log(res.error.text);

        expect(res.status).to.equal(400);
    });
    it('should give 400 on missing company name', async () => {
        let body = {
            isWorkingHere: false,
            start: '2020-09-10T00:00:00.000Z',
            end: '2021-09-10T00:00:00.000Z',
            position: 'aa',
            description: 'test case',
        };
        const res = await request(app)
            .post(`/writer/v3.1/portfolio/block/experience`)
            .send(body)
            .set('Cookie', cookie)
            .set('Content-type', 'application/json');
        console.log(res.error.text);

        expect(res.status).to.equal(400);
    });
    it('should give 400 on missing start date', async () => {
        let body = {
            company: 'Apple',
            isWorkingHere: false,
            position: 'aa',
            description: 'test case',
        };
        const res = await request(app)
            .post(`/writer/v3.1/portfolio/block/experience`)
            .send(body)
            .set('Cookie', cookie)
            .set('Content-type', 'application/json');
        console.log(res.error.text);

        expect(res.status).to.equal(400);
    });
    it('should give 400 on missing end date and isWorkingHere', async () => {
        let body = {
            company: 'Apple',
            start: '2020-09-10T00:00:00.000Z',
            position: 'aa',
            description: 'test case',
        };
        const res = await request(app)
            .post(`/writer/v3.1/portfolio/block/experience`)
            .send(body)
            .set('Cookie', cookie)
            .set('Content-type', 'application/json');
        console.log(res.error.text);

        expect(res.status).to.equal(400);
    });
    it('should give 400 on missing end date and isWorkingHere=false', async () => {
        let body = {
            company: 'Apple',
            isWorkingHere: false,
            start: '2020-09-10T00:00:00.000Z',
            position: 'aa',
            description: 'test case',
        };
        const res = await request(app)
            .post(`/writer/v3.1/portfolio/block/experience`)
            .send(body)
            .set('Cookie', cookie)
            .set('Content-type', 'application/json');
        console.log(res.error.text);

        expect(res.status).to.equal(400);
    });
    it('should give 400 on missing position', async () => {
        let body = {
            company: 'Apple',
            isWorkingHere: false,
            start: '2020-09-10T00:00:00.000Z',
            end: '2021-09-10T00:00:00.000Z',
            description: 'test case',
        };
        const res = await request(app)
            .post(`/writer/v3.1/portfolio/block/experience`)
            .send(body)
            .set('Cookie', cookie)
            .set('Content-type', 'application/json');
        console.log(res.error.text);

        expect(res.status).to.equal(400);
    });
    it('should give 400 when end date less than start date', async () => {
        let body = {
            company: 'Apple',
            isWorkingHere: false,
            start: '2020-09-10T00:00:00.000Z',
            end: '2020-09-09T00:00:00.000Z',
            description: 'test case',
            position: 'aa',
        };
        const res = await request(app)
            .post(`/writer/v3.1/portfolio/block/experience`)
            .send(body)
            .set('Cookie', cookie)
            .set('Content-type', 'application/json');
        console.log(res.error.text);
        expect(res.status).to.equal(400);
    });
    it('should give 200', async () => {
        let body = {
            company: 'Apple',
            isWorkingHere: false,
            start: '2020-09-10T00:00:00.000Z',
            end: '2020-09-10T00:00:00.000Z',
            description: 'test case',
            position: 'aa',
        };
        const res = await request(app)
            .post(`/writer/v3.1/portfolio/block/experience`)
            .send(body)
            .set('Cookie', cookie)
            .set('Content-type', 'application/json');
        expect(res.status).to.equal(200);
    });
});

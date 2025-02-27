const request = require('supertest');
const expect = require('chai').expect;
const app = require('../../../../index');
let mongoose = require('mongoose');
let Creator = mongoose.model('Writer');
let TestimonialBlock = mongoose.model('TestimonialBlock');
const { token, email } = require('../../../../config-test');

const cookie = `jwt=${token};`;

let creator;
describe('add link block', () => {
    before(async () => {
        creator = await Creator.find({ e: email }).exec();
        expect(creator.length).to.equal(1);
        creator = creator[0];
    });
    it('should give 400 on empty body', async () => {
        let body = {};
        const res = await request(app)
            .post('/writer/v3.1/portfolio/block/link')
            .send(body)
            .set('Cookie', cookie)
            .set('Content-type', 'application/json');
        expect(res.status).to.equal(400);
    });
    it('should give 400 on missing title', async () => {
        let body = {
            position: 'nnn',
            description: 'this is a test case',
            tags: ['a'],
            url: 'https://github.com/linkedin/kafka-monitor',
            coverImage:
                'https://www.microsoft.com/apple-touch-icon-precomposed.png',
        };
        const res = await request(app)
            .post('/writer/v3.1/portfolio/block/link')
            .send(body)
            .set('Cookie', cookie)
            .set('Content-type', 'application/json');
        expect(res.status).to.equal(400);
    });
    it('should give 400 on missing description', async () => {
        let body = {
            position: 'nnn',
            title: 'test case',
            tags: ['a'],
            url: 'https://github.com/linkedin/kafka-monitor',
            coverImage:
                'https://www.microsoft.com/apple-touch-icon-precomposed.png',
        };
        const res = await request(app)
            .post('/writer/v3.1/portfolio/block/link')
            .send(body)
            .set('Cookie', cookie)
            .set('Content-type', 'application/json');
        expect(res.status).to.equal(400);
    });
    it('should give 400 on missing url', async () => {
        let body = {
            position: 'nnn',
            title: 'test case',
            description: 'this is a test case',
            tags: ['a'],
            coverImage:
                'https://www.microsoft.com/apple-touch-icon-precomposed.png',
        };
        const res = await request(app)
            .post('/writer/v3.1/portfolio/block/link')
            .send(body)
            .set('Cookie', cookie)
            .set('Content-type', 'application/json');
        expect(res.status).to.equal(400);
    });
    it('should give 400 on missing position', async () => {
        let body = {
            title: 'test case',
            description: 'this is a test case',
            tags: ['a'],
            url: 'https://github.com/linkedin/kafka-monitor',
            coverImage:
                'https://www.microsoft.com/apple-touch-icon-precomposed.png',
        };
        const res = await request(app)
            .post('/writer/v3.1/portfolio/block/link')
            .send(body)
            .set('Cookie', cookie)
            .set('Content-type', 'application/json');
        expect(res.status).to.equal(400);
    });
    it('should give 200', async () => {
        let body = {
            position: 'nnn',
            title: 'test case',
            description: 'this is a test case',
            tags: ['a'],
            url: 'https://github.com/linkedin/kafka-monitor',
            coverImage:
                'https://www.microsoft.com/apple-touch-icon-precomposed.png',
        };
        const res = await request(app)
            .post('/writer/v3.1/portfolio/block/link')
            .send(body)
            .set('Cookie', cookie)
            .set('Content-type', 'application/json');
        expect(res.status).to.equal(200);
    });
});

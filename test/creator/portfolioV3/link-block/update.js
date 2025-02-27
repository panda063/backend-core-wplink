const request = require('supertest');
const expect = require('chai').expect;
const app = require('../../../../index');
let mongoose = require('mongoose');
let Creator = mongoose.model('Writer');
let LinkBlock = mongoose.model('LinkBlock');
const { token, email } = require('../../../../config-test');

const cookie = `jwt=${token};`;

let creator,
    bid = 'dne';
describe('update link block', () => {
    before(async () => {
        creator = await Creator.find({ e: email }).exec();
        expect(creator.length).to.equal(1);
        creator = creator[0];
        const block = await LinkBlock.findOne({
            uid: creator.id,
        }).exec();
        if (block) {
            bid = block.id;
        }
    });
    it('should give 400 on empty body', async () => {
        let body = {};
        const res = await request(app)
            .put(`/writer/v3.1/portfolio/block/link/${bid}`)
            .send(body)
            .set('Cookie', cookie)
            .set('Content-type', 'application/json');
        expect(res.status).to.equal(400);
    });
    it('should give 400 on missing title', async () => {
        if (bid !== 'dne') {
            let body = {
                description: 'this is a test case',
                tags: ['a'],
                url: 'https://github.com/linkedin/kafka-monitor',
                coverImage:
                    'https://www.microsoft.com/apple-touch-icon-precomposed.png',
            };
            const res = await request(app)
                .put(`/writer/v3.1/portfolio/block/link/${bid}`)
                .send(body)
                .set('Cookie', cookie)
                .set('Content-type', 'application/json');
            expect(res.status).to.equal(400);
        }
    });
    it('should give 400 on missing description', async () => {
        if (bid !== 'dne') {
            let body = {
                title: 'test case',
                tags: ['a'],
                url: 'https://github.com/linkedin/kafka-monitor',
                coverImage:
                    'https://www.microsoft.com/apple-touch-icon-precomposed.png',
            };
            const res = await request(app)
                .put(`/writer/v3.1/portfolio/block/link/${bid}`)
                .send(body)
                .set('Cookie', cookie)
                .set('Content-type', 'application/json');
            expect(res.status).to.equal(400);
        }
    });
    it('should give 400 on missing url', async () => {
        if (bid !== 'dne') {
            let body = {
                title: 'test case',
                description: 'this is a test case',
                tags: ['a'],
                coverImage:
                    'https://www.microsoft.com/apple-touch-icon-precomposed.png',
            };
            const res = await request(app)
                .put(`/writer/v3.1/portfolio/block/link/${bid}`)
                .send(body)
                .set('Cookie', cookie)
                .set('Content-type', 'application/json');
            expect(res.status).to.equal(400);
        }
    });
    it('should give 200', async () => {
        if (bid !== 'dne') {
            let body = {
                title: 'test case',
                description: 'this is a test case',
                tags: ['a'],
                url: 'https://github.com/linkedin/kafka-monitor',
                coverImage:
                    'https://www.microsoft.com/apple-touch-icon-precomposed.png',
            };
            const res = await request(app)
                .put(`/writer/v3.1/portfolio/block/link/${bid}`)
                .send(body)
                .set('Cookie', cookie)
                .set('Content-type', 'application/json');
            expect(res.status).to.equal(200);
        }
    });
});

const request = require('supertest');
const expect = require('chai').expect;
const app = require('../../../../index');
let mongoose = require('mongoose');
let Creator = mongoose.model('Writer');
const { token, email } = require('../../../../config-test');

const cookie = `jwt=${token};`;

let creator,
    tid = 'dne';

describe('add Image block', () => {
    before(async () => {
        creator = await Creator.find({ e: email }).exec();
        expect(creator.length).to.equal(1);
        creator = creator[0];
    });
    it('should give 400 on empty body', async () => {
        let body = {};
        const res = await request(app)
            .post('/writer/v3.1/portfolio/block/image')
            .send(body)
            .set('Cookie', cookie)
            .set('Content-type', 'application/json');
        expect(res.status).to.equal(400);
    });
    it('should give 400 on missing title', async () => {
        let body = {
            position: 'nnn',
            title: 'test',
            description: 'this is a test case',
            tags: ['a'],
            fileIds: [],
        };
        const res = await request(app)
            .post('/writer/v3.1/portfolio/block/image')
            .send(body)
            .set('Cookie', cookie)
            .set('Content-type', 'application/json');
        expect(res.status).to.equal(400);
    });
    it('should give 400 on missing position', async () => {
        let body = {
            title: 'test',
            description: 'this is a test case',
            tags: ['a'],
            fileIds: [],
        };
        const res = await request(app)
            .post('/writer/v3.1/portfolio/block/image')
            .send(body)
            .set('Cookie', cookie)
            .set('Content-type', 'application/json');
        expect(res.status).to.equal(400);
    });
    it('should give 400 on empty fileIds', async () => {
        let body = {
            position: 'nnn',
            title: 'test',
            description: 'this is a test case',
            tags: ['a'],
            fileIds: [],
        };
        const res = await request(app)
            .post('/writer/v3.1/portfolio/block/image')
            .send(body)
            .set('Cookie', cookie)
            .set('Content-type', 'application/json');
        expect(res.status).to.equal(400);
    });
});

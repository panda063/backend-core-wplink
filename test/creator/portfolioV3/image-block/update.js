const request = require('supertest');
const expect = require('chai').expect;
const app = require('../../../../index');
let mongoose = require('mongoose');
let Creator = mongoose.model('Writer');
const ImageBlock = mongoose.model('ImageBlock');
const { token, email } = require('../../../../config-test');

const cookie = `jwt=${token};`;

let creator,
    bid = 'dne';

describe('update Image block', () => {
    before(async () => {
        creator = await Creator.find({ e: email }).exec();
        expect(creator.length).to.equal(1);
        creator = creator[0];
        const block = await ImageBlock.findOne({
            uid: creator.id,
        }).exec();
        if (block) {
            bid = block.id;
        }
    });
    it('should give 400 on empty body', async () => {
        let body = {};
        const res = await request(app)
            .put(`/writer/v3.1/portfolio/block/image/${bid}`)
            .send(body)
            .set('Cookie', cookie)
            .set('Content-type', 'application/json');
        expect(res.status).to.equal(400);
    });
    it('should give 400 on missing title', async () => {
        let body = {
            description: 'this is a test case',
            tags: ['a'],
            fileIds: [],
        };
        const res = await request(app)
            .put(`/writer/v3.1/portfolio/block/image/${bid}`)
            .send(body)
            .set('Cookie', cookie)
            .set('Content-type', 'application/json');
        expect(res.status).to.equal(400);
    });
    it('should give 400 on empty fileIds', async () => {
        let body = {
            title: 'test',
            description: 'this is a test case',
            tags: ['a'],
            fileIds: [],
        };
        const res = await request(app)
            .put(`/writer/v3.1/portfolio/block/image/${bid}`)
            .send(body)
            .set('Cookie', cookie)
            .set('Content-type', 'application/json');
        expect(res.status).to.equal(400);
    });
});

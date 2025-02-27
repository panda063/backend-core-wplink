const request = require('supertest');
const expect = require('chai').expect;
const app = require('../../../../index');
let mongoose = require('mongoose');
let Creator = mongoose.model('Writer');
const ProjectBlock = mongoose.model('ProjectBlock');

const { token, email } = require('../../../../config-test');

const cookie = `jwt=${token};`;

let creator,
    bid = 'dne';

describe('save project block', () => {
    before(async () => {
        creator = await Creator.find({ e: email }).exec();
        expect(creator.length).to.equal(1);
        creator = creator[0];
        const block = await ProjectBlock.findOne({
            uid: creator.id,
        }).exec();
        if (block) {
            bid = block.id;
        }
    });
    it('should give 400 if body is empty', async () => {
        if (bid !== 'dne') {
            let body = {};
            const res = await request(app)
                .post(`/writer/v3.1/portfolio/block/project/${bid}`)
                .send(body)
                .set('Cookie', cookie)
                .set('Content-type', 'application/json');
            expect(res.status).to.equal(400);
        }
    });
    it('should give 400 if title is missing', async () => {
        if (bid !== 'dne') {
            let body = {
                desciption: 'test case',
                content: 'test case',
            };
            const res = await request(app)
                .post(`/writer/v3.1/portfolio/block/project/${bid}`)
                .send(body)
                .set('Cookie', cookie)
                .set('Content-type', 'application/json');
            expect(res.status).to.equal(400);
        }
    });
    it('should give 400 if description is missing', async () => {
        if (bid !== 'dne') {
            let body = {
                title: 'abc',
                content: 'test case',
            };
            const res = await request(app)
                .post(`/writer/v3.1/portfolio/block/project/${bid}`)
                .send(body)
                .set('Cookie', cookie)
                .set('Content-type', 'application/json');
            expect(res.status).to.equal(400);
        }
    });
    it('should give 200', async () => {
        if (bid !== 'dne') {
            let body = {
                title: 'abc',
                description: 'test case',
                content: 'test case',
            };
            const res = await request(app)
                .post(`/writer/v3.1/portfolio/block/project/${bid}`)
                .send(body)
                .set('Cookie', cookie)
                .set('Content-type', 'application/json');
            expect(res.status).to.equal(200);
        }
    });
});

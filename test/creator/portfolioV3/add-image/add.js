const request = require('supertest');
const expect = require('chai').expect;
const app = require('../../../../index');
let mongoose = require('mongoose');
let Creator = mongoose.model('Writer');
let ProjectBlock = mongoose.model('ProjectBlock');
const FileStore = mongoose.model('FileUpload');

const { token, email } = require('../../../../config-test');

const cookie = `jwt=${token};`;

let creator,
    bid = 'dne';

describe('Add Image to block project block', () => {
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

    it('it should give 400 on missing fileIds', async () => {
        const body = {};
        const res = await request(app)
            .post(`/writer/v3.1/portfolio/block/project/image/${bid}`)
            .send(body)
            .set('Cookie', cookie)
            .set('Content-type', 'application/json');
        expect(res.status).to.equal(400);
    });

    it('it should give 400 when one or more fileIds is already moved to tortoise', async () => {
        if (bid !== 'dne') {
            const file = await FileStore.findOne({
                us: 'finished',
            }).exec();
            if (file) {
                const body = {
                    fileIds: [file.id],
                };
                const res = await request(app)
                    .post(`/writer/v3.1/portfolio/block/project/image/${bid}`)
                    .send(body)
                    .set('Cookie', cookie)
                    .set('Content-type', 'application/json');
                expect(res.status).to.equal(400);
            }
        }
    });
    it('it should give 200', async () => {
        if (bid !== 'dne') {
            const file = await FileStore.findOne({
                us: 'started',
            }).exec();
            if (file) {
                const body = {
                    fileIds: [file.id],
                };
                const res = await request(app)
                    .post(`/writer/v3.1/portfolio/block/project/image/${bid}`)
                    .send(body)
                    .set('Cookie', cookie)
                    .set('Content-type', 'application/json');
                console.log(res);
                expect(res.status).to.equal(200);
            }
        }
    });
});

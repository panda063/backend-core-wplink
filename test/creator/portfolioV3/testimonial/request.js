const request = require('supertest');
const expect = require('chai').expect;
const app = require('../../../../index');
let mongoose = require('mongoose');
let Creator = mongoose.model('Writer');
let TestimonialBlock = mongoose.model('TestimonialBlock');
const { token, email } = require('../../../../config-test');

const cookie = `jwt=${token};`;

let creator;

describe('request tesimonial via email', () => {
    before(async () => {
        creator = await Creator.find({ e: email }).exec();
        expect(creator.length).to.equal(1);
        creator = creator[0];
    });
    it('should give 400 on empty body', async () => {
        let body = {};
        const res = await request(app)
            .post('/writer/v3.1/portfolio/testimonial/request-via-email')
            .send(body)
            .set('Cookie', cookie)
            .set('Content-type', 'application/json');
        expect(res.status).to.equal(400);
    });
    it('should give 400 on missing email', async () => {
        let body = {
            reqMessage: 'i want testimonial',
        };
        const res = await request(app)
            .post('/writer/v3.1/portfolio/testimonial/request-via-email')
            .send(body)
            .set('Cookie', cookie)
            .set('Content-type', 'application/json');
        expect(res.status).to.equal(400);
    });
    it('should give 400 on missing reqMessage', async () => {
        let body = {
            email: 'aaap@test.com',
        };
        const res = await request(app)
            .post('/writer/v3.1/portfolio/testimonial/request-via-email')
            .send(body)
            .set('Cookie', cookie)
            .set('Content-type', 'application/json');
        expect(res.status).to.equal(400);
    });
    it('should give 400 or 200 based on if email is already invited', async () => {
        let block = await TestimonialBlock.findOne({
            uid: creator.id,
        }).exec();
        let body = {
            email: 'aaar@test.com',
            reqMessage: 'I want a testimonial',
        };
        const res = await request(app)
            .post('/writer/v3.1/portfolio/testimonial/request-via-email')
            .send(body)
            .set('Cookie', cookie)
            .set('Content-type', 'application/json');
        let found = false;
        if (block) {
            for (let ts of block.tstm) {
                if (ts.email === body.email) found = true;
            }
        }
        if (found) {
            expect(res.status).to.equal(400);
        } else {
            expect(res.status).to.equal(200);
            block = await TestimonialBlock.findOne({
                uid: creator.id,
            }).exec();
            for (let ts of block.tstm) {
                if (ts.email === body.email) found = true;
            }
            expect(found).to.equal(true);
        }
    });
});

const request = require('supertest');
const expect = require('chai').expect;
const app = require('../../../../index');
let mongoose = require('mongoose');
let Creator = mongoose.model('Writer');
let TestimonialBlock = mongoose.model('TestimonialBlock');
const { token, email } = require('../../../../config-test');

const cookie = `jwt=${token};`;

let creator;

describe('add brand logo', () => {
    before(async () => {
        creator = await Creator.find({ e: email }).exec();
        expect(creator.length).to.equal(1);
        creator = creator[0];
    });
    it('should give 400 on empty body', async () => {
        let body = {};
        const res = await request(app)
            .post('/writer/v3.1/portfolio/testimonial/logo')
            .send(body)
            .set('Cookie', cookie)
            .set('Content-type', 'application/json');
        expect(res.status).to.equal(400);
    });
    it('should give 400 on missing company name', async () => {
        let body = {
            logo: '',
        };
        const res = await request(app)
            .post('/writer/v3.1/portfolio/testimonial/logo')
            .send(body)
            .set('Cookie', cookie)
            .set('Content-type', 'application/json');
        expect(res.status).to.equal(400);
    });
    it('should give 400 on missing company logo', async () => {
        let body = {
            company: 'Google',
        };
        const res = await request(app)
            .post('/writer/v3.1/portfolio/testimonial/logo')
            .send(body)
            .set('Cookie', cookie)
            .set('Content-type', 'application/json');
        expect(res.status).to.equal(400);
    });
    it('should give 400 when logo is not a valid uri', async () => {
        let body = {
            company: 'Google',
            logo: 'abc',
        };
        const res = await request(app)
            .post('/writer/v3.1/portfolio/testimonial/logo')
            .send(body)
            .set('Cookie', cookie)
            .set('Content-type', 'application/json');
        expect(res.status).to.equal(400);
    });
    it('should give 200', async () => {
        let body = {
            company: 'Microsoft',
            logo: 'https://www.microsoft.com/apple-touch-icon-precomposed.png',
        };
        const res = await request(app)
            .post('/writer/v3.1/portfolio/testimonial/logo')
            .send(body)
            .set('Cookie', cookie)
            .set('Content-type', 'application/json');
        expect(res.status).to.equal(200);
    });
});

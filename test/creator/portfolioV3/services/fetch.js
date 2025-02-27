const request = require('supertest');
const expect = require('chai').expect;
const app = require('../../../../index');
let mongoose = require('mongoose');
let Creator = mongoose.model('Writer');
let ExperienceBlock = mongoose.model('ExperienceBlock');

const { token, email } = require('../../../../config-test');

const cookie = `jwt=${token};`;

let creator;

describe('Fetch all service blocks', () => {
    before(async () => {
        creator = await Creator.find({ e: email }).exec();
        expect(creator.length).to.equal(1);
        creator = creator[0];
    });
    // * Make user jwt token has not expired or else portfolio_owner will be false
    it('should give 200 and portfolio_owner=true', async () => {
        const res = await request(app)
            .get(`/common/v3.1/portfolio/${creator.pn}/services`)
            .set('Cookie', cookie)
            .set('Content-type', 'application/json');
        expect(res.status).to.equal(200);
        expect(res.body.data.portfolio_owner).to.equal(true);
    });
});

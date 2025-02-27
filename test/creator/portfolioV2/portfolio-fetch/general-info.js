/** Required Headers **/
const request = require('supertest');
const expect = require('chai').expect;
const app = require('../../../../index');
let mongoose = require('mongoose');
let Creator = mongoose.model('Writer');
let Project = mongoose.model('Project');
const { token, email } = require('../../../../config-test');
// **********
let creator;

describe('fetch general info', () => {
    before(async () => {
        creator = await Creator.find({ e: email }).exec();
        expect(creator.length).to.equal(1);
        creator = creator[0];
    });
    it('should give error on missing username', async () => {
        const res = await request(app)
            .get(`/common/portfolio/generalInfo/`)
            .set('Content-type', 'application/json');
        expect(res.body.errorCode).to.equal('CND');
    });
    it('should give invalid username', async () => {
        const res = await request(app)
            .get(`/common/portfolio/generalInfo/abc`)
            .set('Content-type', 'application/json');
        expect(res.status).to.equal(400);
        expect(res.body.errorCode).to.equal('CRGN100');
    });
    it('should give 200 and portfolio_owner is false', async () => {
        const res = await request(app)
            .get(`/common/portfolio/generalInfo/${creator.pn}`)
            .set('Content-type', 'application/json');
        expect(res.status).to.equal(200);
        expect(res.body.data.portfolio_owner).to.equal(false);
    });
    it('should give 200 and portfolio_owner is true', async () => {
        const res = await request(app)
            .get(`/common/portfolio/generalInfo/${creator.pn}`)
            .set('Authorization', `Bearer ${token}`)
            .set('Content-type', 'application/json');
        expect(res.status).to.equal(200);
        expect(res.body.data.portfolio_owner).to.equal(true);
    });
});

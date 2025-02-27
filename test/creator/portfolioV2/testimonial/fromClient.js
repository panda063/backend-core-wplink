const request = require('supertest');
const expect = require('chai').expect;
const app = require('../../../../index');
let mongoose = require('mongoose');
let Creator = mongoose.model('Writer');
let Application = mongoose.model('Application');
const { token, email } = require('../../../../config-test');
let creator;
let appls;
describe('request testimonial from client', () => {
    before(async () => {
        creator = await Creator.find({ e: email }).exec();
        expect(creator.length).to.equal(1);
        creator = creator[0];
        appls = await Application.find({
            writer: creator._id,
            status: 'hired',
        })
            .populate('client')
            .exec();
    });
    //if (appls.length > 0) {
    it('should give 400 and GL100', async () => {
        if (appls.length > 0) {
            let body = {};
            const res = await request(app)
                .post('/writer/portfolio/testimonials/request-client')
                .send(body)
                .set('Authorization', `Bearer ${token}`)
                .set('Content-type', 'application/json');
            expect(res.status).to.equal(400);
            expect(res.body.errorCode).to.equal('GL100');
        }
    });
    it('should give 400 and GL100 on missing reqMessage', async () => {
        if (appls.length > 0) {
            let body = {
                clientObjectId: appls[0].client.id,
            };
            const res = await request(app)
                .post('/writer/portfolio/testimonials/request-client')
                .send(body)
                .set('Authorization', `Bearer ${token}`)
                .set('Content-type', 'application/json');
            expect(res.status).to.equal(400);
            expect(res.body.errorCode).to.equal('GL100');
        }
    });
    it('should give 200 or 400 based on already invited or not', async () => {
        if (appls.length > 0) {
            let body = {
                clientObjectId: appls[0].client.id,
            };
            const res = await request(app)
                .post('/writer/portfolio/testimonials/request-client')
                .send(body)
                .set('Authorization', `Bearer ${token}`)
                .set('Content-type', 'application/json');
            let found = false;
            for (let tr of creator.rtstm) {
                if (tr.cemail === appls[0].client.e) found = true;
            }
            if (found) {
                expect(res.status).to.equal(400);
                expect(res.body.errorCode).to.equal('CRPL107');
            } else {
                expect(res.status).to.equal(200);
                creator = await Creator.find({ e: email }).exec();
                expect(creator.length).to.equal(1);
                creator = creator[0];
                for (let ts of creator.rtstm) {
                    if (ts.cemail === appls[0].client.e) found = true;
                }
                expect(found).to.equal(true);
            }
        }
    });
});

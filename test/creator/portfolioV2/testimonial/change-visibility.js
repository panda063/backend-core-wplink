const request = require('supertest');
const expect = require('chai').expect;
const app = require('../../../../index');
let mongoose = require('mongoose');
let Creator = mongoose.model('Writer');
const { token, email } = require('../../../../config-test');
let creator;
let tid;
describe('change testimonial visibility', () => {
    before(async () => {
        creator = await Creator.find({ e: email }).exec();
        expect(creator.length).to.equal(1);
        creator = creator[0];
        if (creator.tstm.length > 0) {
            tid = creator.tstm[0]._id.toString();
        }
    });
    //if (appls.length > 0) {
    it('should give 404', async () => {
        let body = {};
        const res = await request(app)
            .put('/writer/portfolio/testimonials/change-visibility/')
            .send(body)
            .set('Authorization', `Bearer ${token}`)
            .set('Content-type', 'application/json');
        expect(res.status).to.equal(404);
    });
    it('should give 400 and GL100 on empty body', async () => {
        if (!tid) return;
        let body = {};
        const res = await request(app)
            .put(`/writer/portfolio/testimonials/change-visibility/${tid}`)
            .send(body)
            .set('Authorization', `Bearer ${token}`)
            .set('Content-type', 'application/json');
        expect(res.status).to.equal(400);
        expect(res.body.errorCode).to.equal('GL100');
    });
    it('should give 400 and GL100 on missing isBookmarked', async () => {
        if (!tid) return;
        let body = {
            isPublic: true,
        };
        const res = await request(app)
            .put(`/writer/portfolio/testimonials/change-visibility/${tid}`)
            .send(body)
            .set('Authorization', `Bearer ${token}`)
            .set('Content-type', 'application/json');
        expect(res.status).to.equal(400);
        expect(res.body.errorCode).to.equal('GL100');
    });
    it('should give 400 and GL100 on missing isPublic', async () => {
        if (!tid) return;
        let body = {
            isBookmarked: true,
        };
        const res = await request(app)
            .put(`/writer/portfolio/testimonials/change-visibility/${tid}`)
            .send(body)
            .set('Authorization', `Bearer ${token}`)
            .set('Content-type', 'application/json');
        expect(res.status).to.equal(400);
        expect(res.body.errorCode).to.equal('GL100');
    });
    it('should give 400 and GL100 on the invalid state operation', async () => {
        if (!tid) return;
        let body = {
            isPublic: false,
            isBookmarked: true,
        };
        const res = await request(app)
            .put(`/writer/portfolio/testimonials/change-visibility/${tid}`)
            .send(body)
            .set('Authorization', `Bearer ${token}`)
            .set('Content-type', 'application/json');
        expect(res.status).to.equal(400);
        expect(res.body.errorCode).to.equal('GL100');
    });
    it('should give 200', async () => {
        if (!tid) return;
        let body = {
            isPublic: true,
            isBookmarked: false,
        };
        const res = await request(app)
            .put(`/writer/portfolio/testimonials/change-visibility/${tid}`)
            .send(body)
            .set('Authorization', `Bearer ${token}`)
            .set('Content-type', 'application/json');
        expect(res.status).to.equal(200);
        creator = await Creator.find({ e: email }).exec();
        expect(creator.length).to.equal(1);
        creator = creator[0];
        let checked = false;
        for (let tr of creator.tstm) {
            if (tr._id == tid) {
                if (tr.isp == body.isPublic && tr.isb == body.isBookmarked)
                    checked = true;
            }
        }
        expect(checked).to.equal(true);
    });
    it('should give 200', async () => {
        if (!tid) return;
        let body = {
            isPublic: false,
            isBookmarked: false,
        };
        const res = await request(app)
            .put(`/writer/portfolio/testimonials/change-visibility/${tid}`)
            .send(body)
            .set('Authorization', `Bearer ${token}`)
            .set('Content-type', 'application/json');
        expect(res.status).to.equal(200);
        creator = await Creator.find({ e: email }).exec();
        expect(creator.length).to.equal(1);
        creator = creator[0];
        let checked = false;
        for (let tr of creator.tstm) {
            if (tr._id == tid) {
                if (tr.isp == body.isPublic && tr.isb == body.isBookmarked)
                    checked = true;
            }
        }
        expect(checked).to.equal(true);
    });
    it('should give 200', async () => {
        if (!tid) return;
        let body = {
            isPublic: true,
            isBookmarked: true,
        };
        const res = await request(app)
            .put(`/writer/portfolio/testimonials/change-visibility/${tid}`)
            .send(body)
            .set('Authorization', `Bearer ${token}`)
            .set('Content-type', 'application/json');
        expect(res.status).to.equal(200);
        creator = await Creator.find({ e: email }).exec();
        expect(creator.length).to.equal(1);
        creator = creator[0];
        let checked = false;
        for (let tr of creator.tstm) {
            if (tr._id == tid) {
                if (tr.isp == body.isPublic && tr.isb == body.isBookmarked)
                    checked = true;
            }
        }
        expect(checked).to.equal(true);
    });
});

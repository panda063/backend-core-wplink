/** Required Headers **/
const request = require('supertest');
const expect = require('chai').expect;
const app = require('../../../../index');
let mongoose = require('mongoose');
let Creator = mongoose.model('Writer');
const { token, email } = require('../../../../config-test');
// **********

let creator;
let toUpdate;
describe('update professional info', () => {
    before(async () => {
        creator = await Creator.find({ e: email }).exec();
        expect(creator.length).to.equal(1);
    });
    it('should give 400 and GL100', async () => {
        // empty body
        let body = {};
        const res = await request(app)
            .post('/writer/portfolio/professionalInfo')
            .send(body)
            .set('Authorization', `Bearer ${token}`)
            .set('Content-type', 'application/json');
        expect(res.status).to.equal(400);
        expect(res.body.errorCode).to.equal('GL100');
    });
    it('should give 400 and GL100 on missing title', async () => {
        // missing title
        let body = {
            organization: 'xyz',
            start: '2019-11-01',
            end: '2019-11-01',
        };
        const res = await request(app)
            .post('/writer/portfolio/professionalInfo')
            .send(body)
            .set('Authorization', `Bearer ${token}`)
            .set('Content-type', 'application/json');
        expect(res.status).to.equal(400);
        expect(res.body.errorCode).to.equal('GL100');
    });
    it('should give 400 and GL100 on missing organization', async () => {
        // missing organization
        let body = {
            title: 'abc',
            start: '2019-11-01',
            end: '2019-11-01',
        };
        const res = await request(app)
            .post('/writer/portfolio/professionalInfo')
            .send(body)
            .set('Authorization', `Bearer ${token}`)
            .set('Content-type', 'application/json');
        expect(res.status).to.equal(400);
        expect(res.body.errorCode).to.equal('GL100');
    });
    it('should give 400 and GL100 on missing start', async () => {
        // missing start
        let body = {
            title: 'abc',
            organization: 'xyz',
            end: '2019-11-01',
        };
        const res = await request(app)
            .post('/writer/portfolio/professionalInfo')
            .send(body)
            .set('Authorization', `Bearer ${token}`)
            .set('Content-type', 'application/json');
        expect(res.status).to.equal(400);
        expect(res.body.errorCode).to.equal('GL100');
    });
    it('should give 400 and GL100 on missing end', async () => {
        // missing end
        let body = {
            title: 'abc',
            organization: 'xyz',
            start: '2019-11-01',
        };
        const res = await request(app)
            .post('/writer/portfolio/professionalInfo')
            .send(body)
            .set('Authorization', `Bearer ${token}`)
            .set('Content-type', 'application/json');
        expect(res.status).to.equal(400);
        expect(res.body.errorCode).to.equal('GL100');
    });
    it('should give 400 and GL100 when isWorkingHere is true and end is present', async () => {
        // isWorkingHere is true and end is present
        let body = {
            title: 'abc',
            organization: 'xyz',
            start: '2019-11-01',
            end: '2019-11-01',
            isWorkingHere: true,
        };
        const res = await request(app)
            .post('/writer/portfolio/professionalInfo')
            .send(body)
            .set('Authorization', `Bearer ${token}`)
            .set('Content-type', 'application/json');
        expect(res.status).to.equal(400);
        expect(res.body.errorCode).to.equal('GL100');
    });
    it('should give 400 and CRPL102', async () => {
        // end < start
        let body = {
            title: 'abc',
            organization: 'xyz',
            start: '2019-11-01',
            end: '2018-11-01',
        };
        const res = await request(app)
            .post('/writer/portfolio/professionalInfo')
            .send(body)
            .set('Authorization', `Bearer ${token}`)
            .set('Content-type', 'application/json');
        expect(res.status).to.equal(400);
        expect(res.body.errorCode).to.equal('CRPL102');
    });
    it('should give 200 and all fields should match', async () => {
        let body = {
            title: 'abc',
            organization: 'xyz',
            start: '2018-11-01',
            end: '2019-11-01',
            categories: ['technology', 'coding'],
            description: 'system design',
        };
        const res = await request(app)
            .post('/writer/portfolio/professionalInfo')
            .send(body)
            .set('Authorization', `Bearer ${token}`)
            .set('Content-type', 'application/json');
        expect(res.status).to.equal(200);
        creator = await Creator.find({ e: email }).exec();
        expect(creator.length).to.equal(1);
        creator = creator[0];
        let allMatch = true;
        let p1 = body;
        let p2 = creator.pfi[creator.pfi.length - 1];
        toUpdate = p2.id;
        for (let key of Object.keys(p1)) {
            if (key === 'start' || key === 'end') {
                let d1 = new Date(p1[key]);
                let d2 = new Date(p2[key]);
                if (d1.getTime() !== d2.getTime()) {
                    //console.log(d1, d2);
                    allMatch = false;
                }
            } else if (key == 'categories') {
                let a1 = p1[key];
                let a2 = p2[key];
                for (let j = 0; j < a1.length; j++) {
                    if (a1[j] !== a2[j]) {
                        allMatch = false;
                    }
                }
            } else {
                if (p1[key] !== p2[key]) {
                    //console.log(p1[key], p2[key], key);
                    allMatch = false;
                }
            }
        }
        expect(allMatch).to.equal(true);
    });
    it('should give 404 on update when expId is missing', async () => {
        const res = await request(app)
            .put(`/writer/portfolio/professionalInfo/`)
            .set('Authorization', `Bearer ${token}`)
            .set('Content-type', 'application/json');
        expect(res.status).to.equal(404);
    });
    it('should give 200 and all fields should match on update', async () => {
        let body = {
            title: 'xyz',
            organization: 'abc',
            start: '2018-11-01',
            end: '2019-11-01',
            categories: ['technology', 'coding'],
            description: 'system design',
        };
        const res = await request(app)
            .put(`/writer/portfolio/professionalInfo/${toUpdate}`)
            .send(body)
            .set('Authorization', `Bearer ${token}`)
            .set('Content-type', 'application/json');
        expect(res.status).to.equal(200);
        creator = await Creator.find({ e: email }).exec();
        expect(creator.length).to.equal(1);
        creator = creator[0];
        let allMatch = true;
        let p1 = body;
        let p2 = creator.pfi[creator.pfi.length - 1];
        toUpdate = p2._id;
        for (let key of Object.keys(p1)) {
            if (key === 'start' || key === 'end') {
                let d1 = new Date(p1[key]);
                let d2 = new Date(p2[key]);
                if (d1.getTime() !== d2.getTime()) {
                    //console.log(d1, d2);
                    allMatch = false;
                }
            } else if (key == 'categories') {
                let a1 = p1[key];
                let a2 = p2[key];
                for (let j = 0; j < a1.length; j++) {
                    if (a1[j] !== a2[j]) {
                        allMatch = false;
                    }
                }
            } else {
                if (p1[key] !== p2[key]) {
                    //console.log(p1[key], p2[key], key);
                    allMatch = false;
                }
            }
        }
        expect(allMatch).to.equal(true);
    });
    it('should give 200 on delete', async () => {
        const res = await request(app)
            .delete(`/writer/portfolio/professionalInfo/${toUpdate}`)
            .set('Authorization', `Bearer ${token}`)
            .set('Content-type', 'application/json');
        expect(res.status).to.equal(200);
        creator = await Creator.find({ e: email }).exec();
        expect(creator.length).to.equal(1);
        creator = creator[0];
        const doc = creator.pfi.id(toUpdate);
        let found = true;
        if (!doc) found = false;
        expect(found).to.equal(false);
    });
});

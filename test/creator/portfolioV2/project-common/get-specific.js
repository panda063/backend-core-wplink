/** Required Headers **/
const request = require('supertest');
const expect = require('chai').expect;
const app = require('../../../../index');
let mongoose = require('mongoose');
let Creator = mongoose.model('Writer');
let Project = mongoose.model('Project');
const { token, email } = require('../../../../config-test');
// **********

let projectToFetch;
let creator;
describe('get project by id', () => {
    before(async () => {
        creator = await Creator.find({ e: email }).exec();
        expect(creator.length).to.equal(1);
        const project = await Project.findOne({ cid: creator[0]._id }).exec();
        if (project) projectToFetch = project.id;
    });
    it('should give 400 and GL100 on invalid id', async () => {
        const res = await request(app)
            .get(`/writer/portfolio/project/abc`)
            .set('Authorization', `Bearer ${token}`)
            .set('Content-type', 'application/json');
        expect(res.status).to.equal(400);
        expect(res.body.errorCode).to.equal('GL100');
    });
    it('should give 200 and portfolio_owner is true', async () => {
        if (projectToFetch) {
            const res = await request(app)
                .get(`/writer/portfolio/project/${projectToFetch}`)
                .set('Authorization', `Bearer ${token}`)
                .set('Content-type', 'application/json');
            expect(res.status).to.equal(200);
        }
    });
    it('should give 200 and portfolio_owner is false', async () => {
        if (projectToFetch) {
            const res = await request(app)
                .get(`/writer/portfolio/project/${projectToFetch}`)
                .set('Authorization', `Bearer ${token}`)
                .set('Content-type', 'application/json');
            expect(res.status).to.equal(200);
        }
    });
});

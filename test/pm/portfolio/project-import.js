// Dependencies

const request = require('supertest');
const expect = require('chai').expect;
const app = require('../../../index');
let mongoose = require('mongoose');
const _ = require('lodash');
let PM = mongoose.model('PM');
const Project = mongoose.model('Project');
const { token, email } = require('../../../config-test');

const cookie = `jwt=${token};`;

// Describe tests

let pm;

describe('import projects', () => {
    before(async () => {
        pm = await PM.find({ e: email }).exec();
        expect(pm.length).to.equal(1);
        pm = pm[0];
    });
    it('should give 404 when pid is empty', async () => {
        const res = await request(app)
            .get('/pm/project/import')
            .set('Cookie', cookie);
        expect(res.status).to.equal(404);
    });
    it('should give 400 when pid is invalid', async () => {
        const res = await request(app)
            .put('/pm/portfolio/project/import/abc')
            .set('Cookie', cookie)
            .set('Content-type', 'application/json');
        expect(res.status).to.equal(400);
        expect(res.body.errorCode).to.equal('GL100');
    });
    it('should give 400 when project is already imported', async () => {
        const project = await Project.findOne({
            _id: { $in: pm.impr },
        }).exec();
        const res = await request(app)
            .put(`/pm/portfolio/project/import/${project.id}`)
            .set('Cookie', cookie)
            .set('Content-type', 'application/json');
        expect(res.status).to.equal(400);
    });
    it('should give 400 when creator is not a member', async () => {
        const pmMemberIds = _.map(pm.mmb, (member) => {
            return member.uid.toString();
        });
        // console.log(pmMemberIds);
        const project = await Project.findOne({
            cid: { $nin: pmMemberIds },
        }).exec();
        // console.log(project.cid);
        const res = await request(app)
            .put(`/pm/portfolio/project/import/${project.id}`)
            .set('Cookie', cookie)
            .set('Content-type', 'application/json');
        expect(res.status).to.equal(400);
    });
});

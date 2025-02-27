const request = require('supertest');
const expect = require('chai').expect;
const app = require('../../../../index');
let mongoose = require('mongoose');
let Creator = mongoose.model('Writer');
const { token, email } = require('../../../../config-test');
let creator;
describe('invite via email', () => {
    before(async () => {
        creator = await Creator.find({ e: email }).exec();
        expect(creator.length).to.equal(1);
        creator = creator[0].toObject();
    });
    describe('POST /writer/invite', () => {
        it('should give 400 and GL100', async () => {
            // empty body
            let body = {};
            const res = await request(app)
                .post('/writer/invite')
                .send(body)
                .set('Authorization', `Bearer ${token}`)
                .set('Content-type', 'application/json');
            expect(res.status).to.equal(400);
            expect(res.body.errorCode).to.equal('GL100');
        });
        it('should give 400 and GL100', async () => {
            // empty emails array
            let body = {
                emails: [],
            };
            const res = await request(app)
                .post('/writer/invite')
                .send(body)
                .set('Authorization', `Bearer ${token}`)
                .set('Content-type', 'application/json');
            expect(res.status).to.equal(400);
            expect(res.body.errorCode).to.equal('GL100');
        });
        it('should give 400 and GL100', async () => {
            // array with invalid emails
            let body = {
                emails: ['aaa', 'bbb'],
            };
            const res = await request(app)
                .post('/writer/invite')
                .send(body)
                .set('Authorization', `Bearer ${token}`)
                .set('Content-type', 'application/json');
            expect(res.status).to.equal(400);
            expect(res.body.errorCode).to.equal('GL100');
        });
        it('should give 400 and GL100', async () => {
            // emails array with more than 3 emails
            let body = {
                emails: [
                    'a@gmail.com',
                    'b@gmail.com',
                    'c@gmail.com',
                    'e@gmail.com',
                ],
            };
            const res = await request(app)
                .post('/writer/invite')
                .send(body)
                .set('Authorization', `Bearer ${token}`)
                .set('Content-type', 'application/json');
            expect(res.status).to.equal(400);
            expect(res.body.errorCode).to.equal('GL100');
        });
        it('should give proper success or error response otherwise', async () => {
            // no. of emails more than no. of invitations left or email already invited/registered
            let body = {
                emails: ['pqr@gmail.com'],
            };
            const res = await request(app)
                .post('/writer/invite')
                .send(body)
                .set('Authorization', `Bearer ${token}`)
                .set('Content-type', 'application/json');
            if (3 - creator.rd.ij.length < body.emails.length) {
                expect(res.status).to.equal(400);
                expect(res.body.errorCode).to.equal('CRPL101');
            } else {
                let invited;
                let es = creator.rd.ij.map((d) => {
                    return d.email;
                });
                for (let ed of body.emails) {
                    if (es.includes(ed)) {
                        invited = true;
                    }
                }
                let found = await Creator.find({
                    e: { $in: body.emails },
                }).exec();
                //console.log(res.body.errorCode);
                if (found.length > 0 || invited) {
                    expect(res.status).to.equal(400);
                    expect(res.body.errorCode).to.equal('CRPL100');
                } else {
                    expect(res.status).to.equal(200);
                }
            }
        });
    });
});

/** Required Headers **/
const request = require('supertest');
const expect = require('chai').expect;
const app = require('../../../index');
let mongoose = require('mongoose');
let Creator = mongoose.model('Writer');
let Client = mongoose.model('Client');
const ConversationClient = mongoose.model('ConversationClient');
const {
    token,
    email,
    clientToken,
    clientEmail,
} = require('../../../config-test');
// **********

let creator, client;
describe('fetch conversation by state', () => {
    // simulate for the creator
    before(async () => {
        creator = await Creator.find({ e: email }).exec();
        expect(creator.length).to.equal(1);
        creator = creator[0];
        client = await Client.find({ e: clientEmail }).exec();
        expect(client.length).to.equal(1);
        client = client[0];
    });
    it('should give 404 if state is missing', async () => {
        const res = await request(app)
            .get('/chat/conversations/')
            .set('Authorization', `Bearer ${token}`)
            .set('Content-type', 'application/json');
        expect(res.status).to.equal(404);
    });
    it('should give 400 and GL100 if state is invalid', async () => {
        const res = await request(app)
            .get('/chat/conversations/abc')
            .set('Authorization', `Bearer ${token}`)
            .set('Content-type', 'application/json');
        expect(res.status).to.equal(400);
        expect(res.body.errorCode).to.equal('GL100');
    });
    it('should give 200 and conversations should match for state=inbox', async () => {
        const res = await request(app)
            .get('/chat/conversations/inbox')
            .set('Authorization', `Bearer ${token}`)
            .set('Content-type', 'application/json');
        expect(res.status).to.equal(200);
        const conversations = await ConversationClient.find({
            u1: client._id,
            u2: creator._id,
            st: 'created',
            sta: { $ne: 'active' },
        }).exec();
        expect(conversations.length).to.equal(
            res.body.data.conversations.length
        );
        let allMatch = true;
        for (let i = 0; i < conversations.length; i++) {
            allMatch =
                allMatch &&
                conversations[i].id == res.body.data.conversations[i].id;
        }
        expect(allMatch).to.equal(true);
    });
    it('should give 200 and conversations should match for state=projects', async () => {
        const res = await request(app)
            .get('/chat/conversations/projects')
            .set('Authorization', `Bearer ${token}`)
            .set('Content-type', 'application/json');
        expect(res.status).to.equal(200);
        const conversations = await ConversationClient.find({
            u1: client._id,
            u2: creator._id,
            st: 'created',
            sta: 'active',
        }).exec();
        expect(conversations.length).to.equal(
            res.body.data.conversations.length
        );
        let allMatch = true;
        for (let i = 0; i < conversations.length; i++) {
            allMatch =
                allMatch &&
                conversations[i].id == res.body.data.conversations[i].id;
        }
        expect(allMatch).to.equal(true);
    });
    it('should give 404 if state is missing', async () => {
        let body = {};
        const res = await request(app)
            .post('/chat/messages/')
            .send(body)
            .set('Authorization', `Bearer ${token}`)
            .set('Content-type', 'application/json');
        expect(res.status).to.equal(404);
    });
    it('should give 400 and GL100 if state is invalid', async () => {
        let body = {};
        const res = await request(app)
            .post('/chat/messages/abc')
            .send(body)
            .set('Authorization', `Bearer ${token}`)
            .set('Content-type', 'application/json');
        expect(res.status).to.equal(400);
        expect(res.body.errorCode).to.equal('GL100');
    });
});

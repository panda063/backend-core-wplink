/** Required Headers **/
const request = require('supertest');
const expect = require('chai').expect;
const app = require('../../../index');
let mongoose = require('mongoose');
let Creator = mongoose.model('Writer');
let Client = mongoose.model('Client');
const ConversationClient = mongoose.model('ConversationClient');
const Message = mongoose.model('Message');
const {
    token,
    email,
    clientToken,
    clientEmail,
} = require('../../../config-test');
// **********

let creator, client, conversation, next_cursor;
describe('fetch conversation messages with cursor pagination', () => {
    // simulate for the creator
    before(async () => {
        creator = await Creator.find({ e: email }).exec();
        expect(creator.length).to.equal(1);
        creator = creator[0];
        client = await Client.find({ e: clientEmail }).exec();
        expect(client.length).to.equal(1);
        client = client[0];
        conversation = await ConversationClient.findOne({
            u1: client._id,
            u2: creator._id,
            st: 'created',
            sta: 'active',
        }).exec();
        // console.log(conversation);
    });
    it('should give 404 if convoId is missing', async () => {
        let body = {};
        const res = await request(app)
            .post('/chat/messages/')
            .send(body)
            .set('Authorization', `Bearer ${token}`)
            .set('Content-type', 'application/json');
        expect(res.status).to.equal(404);
    });
    it('should give 400 and GL100 if convoId is invalid', async () => {
        let body = {};
        const res = await request(app)
            .post('/chat/messages/abc')
            .send(body)
            .set('Authorization', `Bearer ${token}`)
            .set('Content-type', 'application/json');
        expect(res.status).to.equal(400);
        expect(res.body.errorCode).to.equal('GL100');
    });
    it('should give 200, default', async () => {
        if (!conversation) return;
        let body = {};
        const res = await request(app)
            .post(`/chat/messages/${conversation.id}`)
            .send(body)
            .set('Authorization', `Bearer ${token}`)
            .set('Content-type', 'application/json');
        expect(res.status).to.equal(200);
        const messages = await Message.find({
            convoId: conversation._id,
        })
            .sort({ puid: -1 })
            // default limit is 20
            .limit(20)
            .exec();
        expect(messages.length).to.equal(res.body.data.messages.length);
        let allMatch = true;
        for (let i = 0; i < messages.length; i++) {
            allMatch =
                allMatch && messages[i].id == res.body.data.messages[i].id;
        }
        expect(allMatch).to.equal(true);
    });
    it('should give 200, limit=2, cursor match', async () => {
        if (!conversation) return;
        let body = { limit: 2 };
        const res = await request(app)
            .post(`/chat/messages/${conversation.id}`)
            .send(body)
            .set('Authorization', `Bearer ${token}`)
            .set('Content-type', 'application/json');
        expect(res.status).to.equal(200);
        const messages = await Message.find({
            convoId: conversation._id,
        })
            .sort({ puid: -1 })
            // default limit is 20
            .limit(2)
            .exec();
        expect(messages.length).to.equal(res.body.data.messages.length);
        let allMatch = true;
        for (let i = 0; i < messages.length; i++) {
            allMatch =
                allMatch && messages[i].id == res.body.data.messages[i].id;
        }
        expect(allMatch).to.equal(true);
        if (messages.length == 0) return;
        expect(res.body.data.pageDetails.next_cursor).to.equal(
            res.body.data.messages[messages.length - 1].uniqueId,
        );
        next_cursor = res.body.data.pageDetails.next_cursor;
    });
    it('should give 200, limit=2, use next_cursor match', async () => {
        if (!conversation) return;
        let body = { limit: 2, cursor: next_cursor };
        const res = await request(app)
            .post(`/chat/messages/${conversation.id}`)
            .send(body)
            .set('Authorization', `Bearer ${token}`)
            .set('Content-type', 'application/json');
        expect(res.status).to.equal(200);
        const messages = await Message.find({
            convoId: conversation._id,
            puid: { $lt: next_cursor },
        })
            .sort({ puid: -1 })
            // default limit is 20
            .limit(2)
            .exec();
        expect(messages.length).to.equal(res.body.data.messages.length);
        let allMatch = true;
        for (let i = 0; i < messages.length; i++) {
            allMatch =
                allMatch && messages[i].id == res.body.data.messages[i].id;
        }
        expect(allMatch).to.equal(true);
        if (messages.length == 0) return;
        expect(res.body.data.pageDetails.next_cursor).to.equal(
            res.body.data.messages[messages.length - 1].uniqueId,
        );
    });
});

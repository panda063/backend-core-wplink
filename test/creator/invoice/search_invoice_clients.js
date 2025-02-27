const request = require('supertest');
const expect = require('chai').expect;
const app = require('../../../index');
let mongoose = require('mongoose');
let Creator = mongoose.model('Writer');
let InvoiceClient = mongoose.model('InvoiceClient');

const { token, email } = require('../../../config-test');

const cookie = `jwt=${token};`;
let creator;

describe('search invoice clients', () => {
    before(async () => {
        creator = await Creator.find({ e: email }).exec();
        expect(creator.length).to.equal(1);
        creator = creator[0];
    });
    it('should give 200 and return all invoice clients of creator matching searchString', async () => {
        let body = { searchString: 'aa' };
        const res = await request(app)
            .post('/writer/invoice/search-invoice-clients')
            .send(body)
            .set('Cookie', cookie)
            .set('Content-type', 'application/json');
        expect(res.status).to.equal(200);
        const invoiceClients = await InvoiceClient.find({
            uid: creator.id,
            n: { $regex: body.searchString, $options: '-i' },
        }).exec();
        const invoiceClientsFromRes = res.body.data.invoiceClients;
        expect(invoiceClients.length).to.equal(invoiceClientsFromRes.length);
    });
});

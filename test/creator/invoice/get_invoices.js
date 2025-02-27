const request = require('supertest');
const expect = require('chai').expect;
const app = require('../../../index');
let mongoose = require('mongoose');
let Creator = mongoose.model('Writer');
let InvoiceBill = mongoose.model('InvoiceBill');

const { token, email } = require('../../../config-test');

const cookie = `jwt=${token};`;
let creator;

describe('fetch invoices', () => {
    before(async () => {
        creator = await Creator.find({ e: email }).exec();
        expect(creator.length).to.equal(1);
        creator = creator[0];
    });
    it('should give 200 and return all invoices from this creator', async () => {
        let body = {};
        const res = await request(app)
            .post('/writer/invoice/get-invoices')
            .send(body)
            .set('Cookie', cookie)
            .set('Content-type', 'application/json');
        expect(res.status).to.equal(200);
        const invoiceBills = await InvoiceBill.find({
            uid: creator.id,
        }).exec();
        const invoiceBillsFromRes = res.body.data.invoices;
        expect(invoiceBills.length).to.equal(invoiceBillsFromRes.length);
    });
});

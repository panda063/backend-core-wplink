const request = require('supertest');
const expect = require('chai').expect;
const app = require('../../../index');
let mongoose = require('mongoose');
let Creator = mongoose.model('Writer');
const InvoiceBill = mongoose.model('InvoiceBill');

const { token, email } = require('../../../config-test');

const cookie = `jwt=${token};`;
let creator, invoiceId;

describe('update a invoice in draft state', () => {
    before(async () => {
        creator = await Creator.find({ e: email }).exec();
        expect(creator.length).to.equal(1);
        creator = creator[0];
        const invoice = await InvoiceBill.findOne({
            uid: creator.id,
            st: 'draft',
        }).exec();
        if (invoice) invoiceId = invoice.id;
    });
    it('should give 400 on invalid id', async () => {
        let body = {};
        const res = await request(app)
            .put(`/writer/invoice/save/abc`)
            .send(body)
            .set('Cookie', cookie)
            .set('Content-type', 'application/json');
        expect(res.status).to.equal(400);
    });
    it('should give 400 with invalid GSTIN', async () => {
        if (invoiceId) {
            let body = {
                name: 'The second invoice',
                invoiceDate: '2022-03-05',
                dueDate: '2022-03-07',
                addInfo: 'This invoice is not for work',
                invoiceTo: {
                    name: 'Arpit Patha',
                    email: 'arpit@whitepanda.in',
                    phone: '9621573219',
                    address: 'Line 1',
                    state: 'Uttar Pradesh',
                    city: 'Lucknow',
                    pin: '226011',
                    gstin: 'HUII',
                    country: 'India',
                },
                invoiceBy: {
                    country: 'India',
                    phone: '9621513218',
                    address: 'Test 1',
                    city: 'Lucknow',
                    pin: '226010',
                    gstin: 'HHH',
                },
            };
            const res = await request(app)
                .put(`/writer/invoice/save/${invoiceId}`)
                .send(body)
                .set('Cookie', cookie)
                .set('Content-type', 'application/json');
            expect(res.status).to.equal(400);
        }
    });
    it('should give 400 with invalid PAN', async () => {
        if (invoiceId) {
            let body = {
                name: 'The second invoice',
                invoiceDate: '2022-03-05',
                dueDate: '2022-03-07',
                addInfo: 'This invoice is not for work',
                invoiceTo: {
                    name: 'Arpit Patha',
                    email: 'arpit@whitepanda.in',
                    phone: '9621573219',
                    address: 'Line 1',
                    state: 'Uttar Pradesh',
                    city: 'Lucknow',
                    pin: '226011',
                    gstin: '37AADCS0472N1Z1',
                    country: 'India',
                    pan: 'AAA',
                },
                invoiceBy: {
                    country: 'India',
                    phone: '9621513218',
                    address: 'Test 1',
                    city: 'Lucknow',
                    pin: '226010',
                    gstin: '37AADCS0472N1Z1',
                },
            };
            const res = await request(app)
                .put(`/writer/invoice/save/${invoiceId}`)
                .send(body)
                .set('Cookie', cookie)
                .set('Content-type', 'application/json');
            expect(res.status).to.equal(400);
        }
    });
    it('should give 200 and invoice data should match', async () => {
        if (invoiceId) {
            let body = {
                name: 'The second invoice',
                invoiceDate: '2022-03-05T00:00:00.000Z',
                dueDate: '2022-03-07T00:00:00.000Z',
                addInfo: 'This invoice is not for work',
                invoiceTo: {
                    name: 'Arpit Patha',
                    email: 'arpit@whitepanda.in',
                    phone: '9621573219',
                    address: 'Line 1',
                    state: 'Uttar Pradesh',
                    city: 'Lucknow',
                    pin: '226011',
                    gstin: '37AADCS0472N1Z1',
                    country: 'India',
                },
                invoiceBy: {
                    country: 'India',
                    phone: '9621513218',
                    address: 'Test 1',
                    city: 'Lucknow',
                    pin: '226010',
                    gstin: '37AADCS0472N1Z1',
                },
                currency: 'usd',
                items: [
                    {
                        name: 'Item2',
                        description: 'Item description',
                        quantity: 11,
                        price: 11,
                        discount: 10,
                    },
                ],
                discount: 11,
                addCharge: 100,
                paymentDetails: [
                    {
                        payDate: '2022-03-05',
                        amountPaid: 110,
                        transactionId: 'iii',
                        method: 'stripe',
                        description: 'Stripe',
                    },
                ],
                paymentGateway: 'razorpay',
            };
            const res = await request(app)
                .put(`/writer/invoice/save/${invoiceId}`)
                .send(body)
                .set('Cookie', cookie)
                .set('Content-type', 'application/json');
            expect(res.status).to.equal(200);
            const invoice = res.body.data.invoice;
            expect(invoice.name).to.equal(body.name);
            expect(invoice.invoiceDate).to.equal(body.invoiceDate);
            expect(invoice.dueDate).to.equal(body.dueDate);
            expect(invoice.invoiceTo.name).to.equal(body.invoiceTo.name);
            expect(invoice.status).to.equal('draft');
            expect(invoice.id).to.equal(invoiceId);
        }
    });
});

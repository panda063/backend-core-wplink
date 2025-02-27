/**
 * Dependencies
 */

const router = require('express').Router();
const stripe = require('../config/stripe');
const Cashfree = require('cashfree-sdk');
const moment = require('moment');
const env = require('../config/env');
const mongoose = require('mongoose');
const crypto = require('crypto');
const C = require('../lib/constants');
const { v4: uuidv4 } = require('uuid');
const { WEB_NOTIF } = require('../messaging/constants');
const { pgKeys, payoutKeys } = require('../config/cashfree');

//Initialize Cashfree Payout
let Payouts = Cashfree.Payouts;
Payouts.Init({
    ENV: env.NODE_ENV == 'prod' ? 'PRODUCTION' : 'TEST',
    ClientID: payoutKeys.id,
    ClientSecret: payoutKeys.secret,
});

/**
 * Models
 */

const Invoice = mongoose.model(C.MODELS.INVOICE);
const Creator = mongoose.model(C.MODELS.WRITER_C);
const ExtClient = mongoose.model(C.MODELS.EXT_CLIENT);
const User = mongoose.model(C.MODELS.USER_C);
const Client = mongoose.model(C.MODELS.CLIENT_C);
const Transaction = mongoose.model(C.MODELS.TRANSACTION);
const ServiceBlock = mongoose.model(C.MODELS.SERVICE_BLOCK);
const ConversationClient = mongoose.model(C.MODELS.CONVERSATION_CLIENT);
const ConversationExt = mongoose.model(C.MODELS.CONVERSATION_EXT);
const ExtPay = mongoose.model(C.MODELS.EXT_PAY);
const InvoiceBill = mongoose.model(C.MODELS.INVOICE_BILL);
const InvoiceClient = mongoose.model(C.MODELS.INVOICE_CLIENT);

// External Services
const { notification } = require('../messaging/index');
const cashfreeService = require('../services/cashfree');
const razorpayService = require('../services/razorpay');
const userService = require('../services/db/user');

// Helpers
const {
    createConversationCreator,
} = require('../controllers/helpers/chatHelpers');
const { sendLinkToExtClient } = require('../controllers/internal');

// For Invoice Payments
async function dispatchPaidNotification({
    findCreator,
    findClient,
    findInvoice,
    creatorHome,
    currencyHexcode,
}) {
    await notification.send({
        usecase: 'payment_received',
        role: C.ROLES.WRITER_C,
        email: {
            email: findCreator.e,
            clientName: findClient.name,
            amount: findInvoice.tot,
            invoiceLink: `${creatorHome}/invoice/${findInvoice.id}`,
            currency: findInvoice.cur.toUpperCase(),
        },
        web: {
            for: {
                id: findCreator.id,
                role: findCreator.__t,
            },
            by: {
                id: findClient.id,
                role: C.MODELS.CLIENT_C,
            },
            actions: {
                n: WEB_NOTIF[C.ROLES.WRITER_C].VIEW_INVOICE,
                d: {
                    invoiceId: findInvoice.id,
                    fullname: findClient.name,
                },
            },
            createdAt: Date.now(),
            clientName: findClient.name,
            amount: `${currencyHexcode} ${findInvoice.tot}`,
            image: '',
        },
    });
}

/**
 * * Stripe Webhook events
 */

async function handleServicePayment({ data, eventType }) {
    let email,
        name,
        creatorId,
        serviceTitle,
        paymentIntent,
        amount,
        serviceId,
        currency,
        creatorName,
        hasMoreFields = false;
    let user;
    if (eventType.includes('payment_intent')) {
        paymentIntent = data.object.id;
        // of the person who paid
        email = data.object.metadata.email;
        name = data.object.metadata.name;
        // of the service owner
        creatorId = data.object.metadata.creatorId;
        serviceTitle = data.object.metadata.serviceTitle;
        serviceId = data.object.metadata.serviceId;
        amount = data.object.metadata.amount;
        currency = data.object.metadata.currency;
        creatorName = data.object.metadata.creatorName;
        message = data.object.metadata.message;
        formFields = {
            name: data.object.metadata.name,
            contact: data.object.metadata.contact,
            company: data.object.metadata.company,
            projectType: data.object.metadata.projectType,
            duration: data.object.metadata.duration,
            budget: data.object.metadata.budget,
            description: data.object.metadata.description,
        };
        for (let fieldValue of Object.values(formFields)) {
            if (fieldValue.length > 0) {
                hasMoreFields = true;
                break;
            }
        }
        // the user who paid
        user = await userService.getUserByEmail({ email });
    }
    if (eventType === 'payment_intent.succeeded') {
        let extclient, convo, extPay;
        if (user && user.__t == C.ROLES.CLIENT_C) {
            // If on-platform client made the payment
            convo = await ConversationClient.findOne({
                u1: user.id,
                u2: creatorId,
            }).exec();
            if (!convo) {
                convo = new ConversationClient({
                    u1: user.id,
                    u2: creatorId,
                    st: C.CONVERSATION_STATUS.CREATED,
                    ctw: C.CONVERSATION_CLIENT_U2.CREATOR,
                    sta: C.CONVERSATION_STATE.ACTIVE,
                });
            } else if (convo.st == C.CONVERSATION_STATUS.INIT) {
                // If conversation is in the init state
                // ?? init state was added when old file upload flow was used to create conversations.
                // ?? ex when client sends brief to creator, we create conversation for file upload before invite is sent
                // ?? Find way to remove this state
                convo.st = C.CONVERSATION_STATUS.CREATED;
                convo.ctw = C.CONVERSATION_CLIENT_U2.CREATOR;
            }
            extPay = new ExtPay({
                convoId: convo.id,
                sref: serviceId,
                sd: user.id,
                txt: `For your Service ${serviceTitle}.`,
                gu: C.PAYMENT_GATEWAY.STRP,
                paymentIntent,
                amount,
                currency,
                message,
                minf: formFields,
                hasMoreFields,
            });
            convo.lmd = Date.now();
            convo.lmsg = extPay.id;
            // ! This is read-modify-write transaction.
            convo.p2 = convo.p2 + 1;
        } else if (user && user.__t == C.ROLES.WRITER_C) {
            convo = await createConversationCreator({
                u1: user.id,
                u2: creatorId,
            });
            extPay = new ExtPay({
                convoId: convo.id,
                sref: serviceId,
                sd: user.id,
                txt: `For your Service ${serviceTitle}.`,
                gu: C.PAYMENT_GATEWAY.STRP,
                paymentIntent,
                amount,
                currency,
                message,
                minf: formFields,
                hasMoreFields,
            });
            convo.lmd = Date.now();
            convo.lmsg = extPay.id;
            // ! This is read-modify-write transaction.
            if (user.id == convo.u1) {
                convo.p2 = convo.p2 + 1;
            } else {
                convo.p1 = convo.p1 + 1;
            }
        } else if (user && user.__t == C.ROLES.EXT_CLIENT) {
            // When ExtClient made the payment
            convo = await ConversationExt.findOne({
                u1: user.id,
                u2: creatorId,
            }).exec();
            if (!convo) {
                convo = new ConversationExt({
                    u1: user.id,
                    u2: creatorId,
                    st: C.CONVERSATION_STATUS.CREATED,
                });
            }
            extPay = new ExtPay({
                convoId: convo.id,
                sref: serviceId,
                sd: user.id,
                txt: `For your Service ${serviceTitle}.`,
                gu: C.PAYMENT_GATEWAY.STRP,
                paymentIntent,
                amount,
                currency,
                message,
                minf: formFields,
                hasMoreFields,
            });
            convo.lmd = Date.now();
            convo.lmsg = extPay.id;
            // ! This is read-modify-write transaction.
            convo.p2 = convo.p2 + 1;
        } else {
            // Create a new ExtClient who made the payment
            extclient = new ExtClient({
                sgm: C.ACCOUNT_SIGNUP_MODE.EMAIL,
                n: { f: name, l: '' },
                e: email,
                // ?? In future when ExtClient wants to become a Client below fields should be set accordingly
                // Until then ExtClient can only access chat using a special link and token
                evt: undefined,
                iev: true,
                p: '',
                acst: C.ACCOUNT_STATUS.ACTIVE,
                refId: uuidv4(),
            });
            convo = new ConversationExt({
                u1: extclient.id,
                u2: creatorId,
                st: C.CONVERSATION_STATUS.CREATED,
                p2: 1,
            });
            extPay = new ExtPay({
                convoId: convo.id,
                sref: serviceId,
                sd: extclient.id,
                txt: `For your Service ${serviceTitle}.`,
                gu: C.PAYMENT_GATEWAY.STRP,
                paymentIntent,
                amount,
                currency,
                message,
                minf: formFields,
                hasMoreFields,
            });
            convo.lmsg = extPay.id;
            await extclient.save();
        }
        await convo.save();
        await extPay.save();
        // Email payer that payment was successfull
        await notification.send({
            usecase: 'pay-service-complete',
            role: C.ROLES.CLIENT_C,
            email: {
                email,
                creatorName,
                serviceTitle,
                amount,
                currency: currency.toUpperCase(),
            },
        });
        // Send chat access link to payer
        await sendLinkToExtClient({
            user,
            creatorName,
            usecase: 'service-pay',
        });
    } else if (eventType === 'payment_intent.payment_failed') {
        // Email payer that payment was successfull
        await notification.send({
            usecase: 'pay-service-failed',
            role: C.ROLES.CLIENT_C,
            email: {
                email,
                creatorName,
                serviceTitle,
                amount,
                currency: currency.toUpperCase(),
            },
        });
    } else if (eventType === 'payment_intent.processing') {
        // Email payer that payment was successfull
        await notification.send({
            usecase: 'pay-service-processing',
            role: C.ROLES.CLIENT_C,
            email: {
                email,
                creatorName,
                serviceTitle,
                amount,
                currency: currency.toUpperCase(),
            },
        });
    }
}

async function handleInvoicePayment({ data, eventType }) {
    let findInvoice, invoiceId, findClient, findCreator;
    let storeTransaction = false;
    // Capture conversationId, invoiceId for payment_intent events
    /**
     * Payment Intent Webhooks
     */
    if (eventType.includes('payment_intent')) {
        // conversationId = data.object.metadata.conversationId;
        invoiceId = data.object.metadata.invoiceId;
        findInvoice = await InvoiceBill.findOne({
            _id: invoiceId,
        }).exec();
        if (!findInvoice) throw new Error('Invoice not found');
        findClient = await InvoiceClient.findOne({
            _id: findInvoice.invc,
        })
            .select('n img')
            .exec();
        findCreator = await User.findById(findInvoice.uid)
            .select('sstats e strp')
            .exec();
        storeTransaction = true;
    }
    if (eventType === 'payment_intent.succeeded') {
        if (findInvoice) {
            findInvoice.pd.push({
                pd: Date.now(),
                amtp: data.object.amount / 100,
                tid: data.object.id,
                amtd: 0,
                mth: C.PAYMENT_GATEWAY.STRP,
                desc: 'Invoice Paid using Stripe',
            });
            findInvoice.st = C.INVOICE_STATES.PAID;
            // Update PM stats -> revenue
            if (findCreator.__t == C.MODELS.PM_C) {
                findCreator.sstats.rev += findInvoice.tot;
                await findCreator.save();
            }
            await findInvoice.save();
            // Notify Creator/PM
            let creatorHome = '';
            if (findCreator.__t == C.MODELS.WRITER_C) {
                creatorHome = env.CREATOR_PORTFOLIO;
            } else if (findCreator.__t == C.MODELS.PM_C) {
                creatorHome = env.PM_PORTFOLIO;
            }
            const currencyHexcode =
                findInvoice.cur == C.CURRENCY.USD ? '$' : '₹';
            await dispatchPaidNotification({
                findCreator,
                findClient,
                findInvoice,
                creatorHome,
                currencyHexcode,
            });
        }
    } else if (eventType === 'payment_intent.payment_failed') {
        if (findInvoice && findInvoice.st === C.INVOICE_STATES.PENDING) {
            findInvoice.st = C.INVOICE_STATES.SENT;
            await findInvoice.save();
        }
    } else if (eventType === 'payment_intent.processing') {
        if (findInvoice) {
            findInvoice.st = C.INVOICE_STATES.PENDING;
            await findInvoice.save();
        }
    }
    /**
     * Store transaction in db
     */
    if (storeTransaction) {
        const transaction = await Transaction.findOneAndUpdate(
            {
                invoiceId: findInvoice._id,
            },
            {
                intnt: findInvoice.intnt,
                st: findInvoice.st,
                inm: findInvoice.inm,
                sd: findClient._id,
                rcv: findCreator._id,
                tot: findInvoice.tot,
                cur: findInvoice.cur,
                pg: C.PAYMENT_GATEWAY.STRP,
            },
            { upsert: true },
        );
    }
}

/**
 * * Webhook events from stripe connected account
 * * 1. For Invoice payments with invoiceMode=transfer
 * * 2. Service Card payments
 */

router.post('/capture/transfer', async (req, res) => {
    let data, eventType;
    // Retrieve the event by verifying the signature using the raw body and secret.
    let event;
    let signature = req.headers['stripe-signature'];
    try {
        event = stripe.webhooks.constructEvent(
            req.rawBody,
            signature,
            env.STRIPE_WEBHOOK_SECRET_TRANSFER,
        );
    } catch (err) {
        console.log(`⚠️  Webhook signature verification failed.`);
        return res.sendStatus(400);
    }
    data = event.data;
    eventType = event.type;

    if (eventType.includes('payment_intent')) {
        try {
            let usecase = data.object.metadata.usecase;
            if (usecase == 'invoice_pay') {
                await handleInvoicePayment({ data, eventType });
            } else if (usecase == 'service_pay') {
                await handleServicePayment({ data, eventType });
            }
        } catch (err) {
            return res.sendStatus(400);
        }
    } else if (eventType === 'account.updated') {
        /**
         * Account Onboarding webhooks
         */
        let creatorId = data.object.metadata.id;
        // role = Writer or PM
        const role = data.object.metadata.role;
        const {
            charges_enabled,
            payouts_enabled,
            details_submitted,
            requirements,
        } = data.object;
        let findCreator = await User.findOne({ _id: creatorId, __t: role })
            .select('sstats e strp pgs')
            .exec();
        if (!findCreator) return res.json({ error: 'Creator not found' });
        // true after onboarding flow is completed
        if (details_submitted == true) {
            findCreator.strp.cns = C.STRIPE_CONNECTION_STATUS.COMPLETED;
            // If onboarding flow is completed but some information is missing mark as info missing
            if (!charges_enabled || !payouts_enabled) {
                findCreator.strp.cns = C.STRIPE_CONNECTION_STATUS.INFO_MISSING;
            }
            // If onboarding is completed and initially no default PG was selected
            // Select Stripe
            if (findCreator.strp.cns == C.STRIPE_CONNECTION_STATUS.COMPLETED) {
                findCreator.pgs = C.PAYMENT_GATEWAY.STRP;
            }
            await findCreator.save();
        }
    } else if (eventType === 'account.application.deauthorized') {
        const accountId = event.account;
        let findCreator = await User.findOne({
            'strp.acid': accountId,
        })
            .select('sstats e strp pgs cfos')
            .exec();
        if (findCreator) {
            findCreator.strp.acid = '';
            findCreator.strp.cns = C.STRIPE_CONNECTION_STATUS.NOT_DONE;
            // Switch to cashfree if possible
            if (findCreator.cfos == C.CF_CONNECTION_STATUS.ONBOARDED) {
                findCreator.pgs = C.PAYMENT_GATEWAY.CF;
            }
            await findCreator.save();
        }
    }
    return res.json({ eventType });
});

/**
 * * Webhook events from Passionbits account
 * * For
 * * 1. payments on invoices with invoiceMode=receive
 */

router.post('/capture/receive', async (req, res) => {
    let data, eventType;
    // Retrieve the event by verifying the signature using the raw body and secret.
    let event;
    let signature = req.headers['stripe-signature'];
    try {
        event = stripe.webhooks.constructEvent(
            req.rawBody,
            signature,
            env.STRIPE_WEBHOOK_SECRET_RECEIVE,
        );
    } catch (err) {
        console.log(`⚠️  Webhook signature verification failed.`);
        return res.sendStatus(400);
    }

    data = event.data;
    eventType = event.type;
    // console.log(data, eventType);
    try {
        if (eventType.includes('payment_intent')) {
            let usecase = data.object.metadata.usecase;
            // console.log(usecase);
            if (usecase == 'invoice_pay')
                await handleInvoicePayment({ data, eventType });
            else {
                return res.sendStatus(400);
            }
        }
    } catch (err) {
        return res.sendStatus(400);
    }
    return res.json({ eventType });
});

/**
 * * Razorpay Payment webhook and callback
 * * For invoice and service payments
 * *
 */

async function rpHandleInvoicePay(
    event,
    invoiceId,
    order_id,
    amount,
    transferId,
) {
    let findInvoice,
        findClient,
        findCreator,
        storeTransaction = false;
    if (invoiceId) {
        findInvoice = await InvoiceBill.findOne({
            _id: invoiceId,
        }).exec();
        if (!findInvoice) throw new Error('Invoice not found');
        findClient = await InvoiceClient.findOne({
            _id: findInvoice.invc,
        })
            .select('n img')
            .exec();
        findCreator = await User.findById(findInvoice.uid)
            .select('sstats e strp')
            .exec();
        storeTransaction = true;
    }
    // mark invoice=pending on API call on the callback url
    // using webhooks events:
    if (event == 'payment.authorized') {
        // ?? what can we do with this
    } else if (event == 'payment.captured') {
        // for invoiceMode=receive
        // mark invoice status=paid
        if (findInvoice && findInvoice.invoiceMode == C.INVOICE_MODE.RECEIVE) {
            findInvoice.st = C.INVOICE_STATES.PAID;
            await findInvoice.save();
        }
    } else if (event == 'payment.failed') {
        // for invoiceMode=receive/transfer
        // mark invoice status=failed
        if (findInvoice && findInvoice.st === C.INVOICE_STATES.PENDING) {
            findInvoice.st = C.INVOICE_STATES.SENT;
            await findInvoice.save();
        }
    } else if (event == 'transfer.processed') {
        // for invoiceMode=transfer
        // mark status=paid
        if (findInvoice && findInvoice.invoiceMode == C.INVOICE_MODE.TRANSFER) {
            findInvoice.pd.push({
                pd: Date.now(),
                amtp: amount / 100,
                tid: transferId,
                amtd: 0,
                mth: C.PAYMENT_GATEWAY.RP,
                desc: 'Invoice Paid using Razorpay',
            });
            findInvoice.st = C.INVOICE_STATES.PAID;
            // Update PM stats -> revenue
            if (findCreator.__t == C.MODELS.PM_C) {
                findCreator.sstats.rev += findInvoice.tot;
                await findCreator.save();
            }
            await findInvoice.save();
            // Notify Creator/PM
            let creatorHome = '';
            if (findCreator.__t == C.MODELS.WRITER_C) {
                creatorHome = env.CREATOR_PORTFOLIO;
            } else if (findCreator.__t == C.MODELS.PM_C) {
                creatorHome = env.PM_PORTFOLIO;
            }
            const currencyHexcode =
                findInvoice.cur == C.CURRENCY.USD ? '$' : '₹';
            await dispatchPaidNotification({
                findCreator,
                findClient,
                findInvoice,
                creatorHome,
                currencyHexcode,
            });
        }
    }
    /**
     * Store transaction in db
     */
    if (invoiceId && storeTransaction) {
        const transaction = await Transaction.findOneAndUpdate(
            {
                invoiceId: findInvoice._id,
            },
            {
                orderId: order_id,
                st: findInvoice.st,
                inm: findInvoice.inm,
                sd: findClient._id,
                rcv: findCreator._id,
                tot: findInvoice.tot,
                cur: findInvoice.cur,
                pg: C.PAYMENT_GATEWAY.RP,
            },
            { upsert: true },
        );
    }
}

async function rpServicePay(event, transferId, serviceData) {
    let email,
        name,
        creatorId,
        serviceId,
        serviceTitle,
        creatorName,
        amount,
        currency,
        hasMoreFields = false;
    // User who paid
    let user;
    if (event.includes('transfer')) {
        email = serviceData.email;
        name = serviceData.name;
        creatorId = serviceData.creatorId;
        serviceId = serviceData.serviceId;
        serviceTitle = serviceData.serviceTitle;
        amount = serviceData.amount;
        currency = serviceData.currency;
        message = serviceData.message;
        creatorName = serviceData.creatorName;
        formFields = {
            name: serviceData.name,
            contact: serviceData.contact,
            company: serviceData.company,
            projectType: serviceData.projectType,
            duration: serviceData.duration,
            budget: serviceData.budget,
            description: serviceData.description,
        };

        for (let fieldValue of Object.values(formFields)) {
            if (fieldValue.length > 0) {
                hasMoreFields = true;
                break;
            }
        }
        user = await userService.getUserByEmail({ email });
    }
    if (event.includes('payment')) {
        email = serviceData.email;
        creatorName = serviceData.creatorName;
        serviceId = serviceData.serviceId;
        serviceTitle = serviceData.serviceTitle;
        amount = serviceData.amount;
        currency = serviceData.currency;
    }
    if (event == 'payment.captured') {
        // Payment was successfully captured
    } else if (event == 'payment.failed') {
        // Email Client that payment was successfull
        await notification.send({
            usecase: 'pay-service-failed',
            role: C.ROLES.CLIENT_C,
            email: {
                email,
                creatorName,
                serviceTitle,
                amount,
                currency: currency.toUpperCase(),
            },
        });
    } else if (event == 'transfer.processed') {
        let extclient, convo, extPay;
        if (user && user.__t == C.ROLES.CLIENT_C) {
            // If on-platform client made the payment
            convo = await ConversationClient.findOne({
                u1: user.id,
                u2: creatorId,
            }).exec();
            if (!convo) {
                convo = new ConversationClient({
                    u1: user.id,
                    u2: creatorId,
                    st: C.CONVERSATION_STATUS.CREATED,
                    ctw: C.CONVERSATION_CLIENT_U2.CREATOR,
                    sta: C.CONVERSATION_STATE.ACTIVE,
                });
            } else if (convo.st == C.CONVERSATION_STATUS.INIT) {
                // If conversation is in the init state
                // ?? init state was added when old file upload flow was used to create conversations.
                // ?? ex when client sends brief to creator, we create conversation for file upload before invite is sent
                // ?? Find way to remove this state
                convo.st = C.CONVERSATION_STATUS.CREATED;
                convo.ctw = C.CONVERSATION_CLIENT_U2.CREATOR;
            }
            extPay = new ExtPay({
                convoId: convo.id,
                sref: serviceId,
                sd: user.id,
                txt: `For your Service ${serviceTitle}.`,
                gu: C.PAYMENT_GATEWAY.RP,
                rpPaymentId: transferId,
                amount,
                currency,
                message,
                minf: formFields,
                hasMoreFields,
            });
            convo.lmd = Date.now();
            convo.lmsg = extPay.id;
            // ! This is read-modify-write transaction.
            convo.p2 = convo.p2 + 1;
        } else if (user && user.__t == C.ROLES.EXT_CLIENT) {
            // When ExtClient made the payment
            convo = await ConversationExt.findOne({
                u1: user.id,
                u2: creatorId,
            }).exec();
            if (!convo) {
                convo = new ConversationExt({
                    u1: user.id,
                    u2: creatorId,
                    st: C.CONVERSATION_STATUS.CREATED,
                });
            }
            extPay = new ExtPay({
                convoId: convo.id,
                sref: serviceId,
                sd: user.id,
                txt: `For your Service ${serviceTitle}.`,
                gu: C.PAYMENT_GATEWAY.RP,
                rpPaymentId: transferId,
                amount,
                currency,
                message,
                minf: formFields,
                hasMoreFields,
            });
            convo.lmd = Date.now();
            convo.lmsg = extPay.id;
            // ! This is read-modify-write transaction.
            convo.p2 = convo.p2 + 1;
        } else if (user && user.__t == C.ROLES.WRITER_C) {
            convo = await createConversationCreator({
                u1: user.id,
                u2: creatorId,
            });
            extPay = new ExtPay({
                convoId: convo.id,
                sref: serviceId,
                sd: user.id,
                txt: `For your Service ${serviceTitle}.`,
                gu: C.PAYMENT_GATEWAY.RP,
                rpPaymentId: transferId,
                amount,
                currency,
                message,
                minf: formFields,
                hasMoreFields,
            });
            convo.lmd = Date.now();
            convo.lmsg = extPay.id;
            // ! This is read-modify-write transaction.
            if (user.id == convo.u1) {
                convo.p2 = convo.p2 + 1;
            } else {
                convo.p1 = convo.p1 + 1;
            }
        } else {
            // Create a new ExtClient who made the payment
            extclient = new ExtClient({
                sgm: C.ACCOUNT_SIGNUP_MODE.EMAIL,
                n: { f: name, l: '' },
                e: email,
                // ?? In future when ExtClient wants to become a Client below fields should be set accordingly
                // Until then ExtClient can only access chat using a special link and token
                evt: undefined,
                iev: true,
                p: '',
                acst: C.ACCOUNT_STATUS.ACTIVE,
                refId: uuidv4(),
            });
            convo = new ConversationExt({
                u1: extclient.id,
                u2: creatorId,
                st: C.CONVERSATION_STATUS.CREATED,
                p2: 1,
            });
            extPay = new ExtPay({
                convoId: convo.id,
                sref: serviceId,
                sd: extclient.id,
                txt: `For your Service ${serviceTitle}.`,
                gu: C.PAYMENT_GATEWAY.RP,
                rpPaymentId: transferId,
                amount,
                currency,
                message,
                minf: formFields,
                hasMoreFields,
            });
            convo.lmd = Date.now();
            convo.lmsg = extPay.id;
            await extclient.save();
        }
        await convo.save();
        await extPay.save();
        // Email payer that payment was successfull
        await notification.send({
            usecase: 'pay-service-complete',
            role: C.ROLES.CLIENT_C,
            email: {
                email,
                creatorName,
                serviceTitle,
                amount,
                currency: currency.toUpperCase(),
            },
        });
        // Send chat access link to payer
        await sendLinkToExtClient({
            user,
            creatorName,
            usecase: 'service-pay',
        });
    }
}

// Webhook
router.post('/razorpay-webhook', async (req, res) => {
    // TODO: Verify payload signature
    const { account_id, event, payload } = req.body;
    try {
        let usecase;
        let invoiceId, order_id;
        let transferId, serviceData, amount;
        if (event.includes('payment')) {
            // Payment events don't contain the order entity
            // They only contain the payment entity
            let { payment } = payload;

            if (payment) {
                order_id = payment.entity.order_id;
                const order = await razorpayService.fetchOrderById({
                    order_id,
                });
                usecase = order.notes.usecase;
                if (usecase == 'invoice_pay') invoiceId = order.receipt;
                else {
                    serviceData = order.notes;
                }
            }
        } else if (event.includes('transfer')) {
            let { transfer } = payload;
            usecase = transfer.entity.notes.usecase;
            order_id = transfer.entity.source;
            transferId = transfer.entity.id;
            amount = transfer.entity.amount;
            if (usecase == 'invoice_pay')
                invoiceId = transfer.entity.notes.invoiceId;
            else {
                serviceData = transfer.entity.notes;
            }
        }
        if (usecase == 'invoice_pay')
            await rpHandleInvoicePay(
                event,
                invoiceId,
                order_id,
                amount,
                transferId,
            );
        else if (usecase == 'service_pay')
            await rpServicePay(event, transferId, serviceData);
    } catch (err) {
        return res.json({ error: true });
    }
    return res.json({ success: true });
});

// Callback
router.post('/razorpay-callback', async (req, res) => {
    // TODO: Verify signature
    const { razorpay_payment_id, razorpay_order_id, razorpay_signature } =
        req.body;
    if (razorpay_order_id) {
        const invoice = await InvoiceBill.findOne({
            'rzpy.orderId': razorpay_order_id,
        }).exec();
        if (invoice && invoice.st === C.INVOICE_STATES.SENT) {
            invoice.st = C.INVOICE_STATES.PENDING;
            await invoice.save();
        }
        // TODO: Fix success/error callback urls
        return res.redirect(`${env.FRONTEND_URL}/invoice/${invoice.id}`);
    }
    return res.redirect(`${env.FRONTEND_URL}`);
});

// Callback
router.post('/service/razorpay-callback', async (req, res) => {
    // TODO: Fix success/error callback urls
    return res.redirect(`${env.FRONTEND_URL}`);
});

/**
 * * Cashfree Webhooks
 */

// Compute the signature of the payload
async function computeSignature(data, secretKey) {
    const signatureData =
        data['orderId'] +
        data['orderAmount'] +
        data['referenceId'] +
        data['txStatus'] +
        data['paymentMode'] +
        data['txMsg'] +
        data['txTime'];
    return crypto
        .createHmac('sha256', secretKey)
        .update(signatureData)
        .digest('base64');
}

router.post('/cashfree-payment', async (req, res) => {
    const data = req.body;
    const secretKey = pgKeys.secret;

    const computedSignature = await computeSignature(data, secretKey);

    if (computedSignature !== data.signature) {
        console.log(`⚠️  Webhook signature verification failed.`);
        return res.status(200).send({
            status: 'error',
            message: 'signature mismatch',
        });
    }

    // While creating order we set orderId equal to invoiceId
    const invoiceId = data.orderId;
    const status = data.txStatus;
    // Get invoice
    const findInvoice = await Invoice.findById(invoiceId)
        .populate({ path: 'convoId', select: 'u1 u2' })
        .exec();
    if (findInvoice) {
        // In conversation u2 corresponds to creator type role
        // Either creator or pm acting as creator
        // Payee of the invoice
        const findCreator = await User.findById(findInvoice.convoId.u2)
            .select('e sstats cfat')
            .exec();
        if (status === 'SUCCESS') {
            try {
                if (findInvoice.invoiceMode == C.INVOICE_MODE.TRANSFER) {
                    // If payment is success
                    // Generate a transfer towards the beneficiary
                    let random = crypto.randomBytes(4).toString('hex');
                    await cashfreeService.createTransferSync({
                        data: {
                            beneId: findCreator.id,
                            amount: findInvoice.tot,
                            transferId: `${findInvoice.id}_${random}`,
                            transferMode: findCreator.cfat,
                        },
                    });
                    findInvoice.st = C.INVOICE_STATES.PENDING;
                    await findInvoice.save();
                } else {
                    findInvoice.st = C.INVOICE_STATES.PAID;
                    await findInvoice.save();
                }
            } catch (err) {
                findInvoice.st = C.INVOICE_STATES.PAYMENT_FAILED;
                await findInvoice.save();
                return res.status(200).send({
                    status: 'error',
                    message: 'payment success, but transfer creation failed',
                });
            }
        } else if (status === 'PENDING') {
            if (findInvoice) {
                findInvoice.st = C.INVOICE_STATES.PENDING;
                await findInvoice.save();
            }
        } else {
            if (findInvoice) {
                findInvoice.st = C.INVOICE_STATES.PAYMENT_FAILED;
                await findInvoice.save();
            }
        }
    }

    return res.status(200).send({
        status: req.body.txStatus,
    });
});

router.post('/cashfree-transfer', async (req, res) => {
    const data = req.body;
    // console.log(data);
    const verified = Payouts.VerifySignature(data);
    // console.log(verified);
    if (!verified) {
        console.log(`⚠️  Webhook signature verification failed.`);
        return res.status(200).send({
            status: 'error',
            message: 'signature mismatch',
        });
    }
    try {
        const event = data.event;
        let invoiceId = '';
        if (data.transferId) {
            invoiceId = data.transferId.split('_')[0];
        } // Get invoice
        let findInvoice;
        if (invoiceId) {
            findInvoice = await Invoice.findById(invoiceId)
                .populate({ path: 'convoId', select: 'u1 u2' })
                .exec();
        }
        if (findInvoice) {
            // In conversation u1 corresponds to the client type role
            // Either client or pm acting as client
            // Payer of the invoice
            const findClient = await User.findById(findInvoice.convoId.u1)
                .select('n img')
                .exec();
            // In conversation u2 corresponds to creator type role
            // Either creator or pm acting as creator
            // Payee of the invoice
            const findCreator = await User.findById(findInvoice.convoId.u2)
                .select('e sstats')
                .exec();
            if (event == 'TRANSFER_SUCCESS') {
                // Transfer success, mark invoice as paid
                findInvoice.st = C.INVOICE_STATES.PAID;
                findInvoice.pon = new Date(moment());
                // If PM paid this invoice
                // Update PM stats -> revenue
                if (findCreator.__t == C.MODELS.PM_C) {
                    findCreator.sstats.rev += findInvoice.tot;
                    await findCreator.save();
                }
                await findInvoice.save();
                // Notify Creator/PM
                let creatorHome = '';
                if (findCreator.__t == C.MODELS.WRITER_C) {
                    creatorHome = env.CREATOR_PORTFOLIO;
                } else if (findCreator.__t == C.MODELS.PM_C) {
                    creatorHome = env.PM_PORTFOLIO;
                }
                const currencyHexcode =
                    findInvoice.cur == C.CURRENCY.USD ? '$' : '₹';
                await notification.send({
                    usecase: 'payment_received',
                    role: C.ROLES.WRITER_C,
                    email: {
                        email: findCreator.e,
                        clientName: findClient.fullname,
                        amount: findInvoice.tot,
                        invoiceLink: `${creatorHome}/invoice/${findInvoice.id}`,
                        currency: findInvoice.cur.toUpperCase(),
                    },
                    web: {
                        for: {
                            id: findCreator.id,
                            role: findCreator.__t,
                        },
                        by: {
                            id: findClient.id,
                            role: C.MODELS.CLIENT_C,
                        },
                        actions: {
                            n: WEB_NOTIF[C.ROLES.WRITER_C].VIEW_INVOICE,
                            d: {
                                messageId: findInvoice.id,
                                conversationId: findInvoice.convoId.id,
                                fullname: findClient.fullname,
                                type: C.CONVERSATION_TYPE.PROJECT,
                                state: C.CONVERSATION_STATE.ACTIVE,
                            },
                        },
                        createdAt: Date.now(),
                        clientName: findClient.fullname,
                        amount: `${currencyHexcode} ${findInvoice.tot}`,
                        image: findClient.image,
                    },
                });
            } else if (event == 'TRANSFER_FAILED​') {
                findInvoice.st = C.INVOICE_STATES.PAYMENT_FAILED;
                await findInvoice.save();
                // ! Transfer failed, create a refund
            } else if (event == 'TRANSFER_REVERSED​') {
                findInvoice.st = C.INVOICE_STATES.PAYMENT_FAILED;
                await findInvoice.save();
                // ! Transfer failed, create a refund
            }
        }

        return res.status(200).send({
            status: data.event,
        });
    } catch (err) {
        // console.log(err);
        return res.status(200).send({
            status: 'error',
            message: 'error in processing the event',
        });
    }
});

module.exports = router;

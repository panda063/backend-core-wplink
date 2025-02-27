/**
 * Dependencies
 */
const mongoose = require('mongoose');
const C = require('../../lib/constants');
const env = require('../../config/env');
const stripe = require('../../config/stripe');
const { BadRequest, InternalServerError } = require('../../lib/errors');
/**
 * Models
 */
const Client = mongoose.model(C.MODELS.CLIENT_C);
const Invoice = mongoose.model(C.MODELS.INVOICE);
const User = mongoose.model(C.MODELS.USER_C);
const ConversationClient = mongoose.model(C.MODELS.CONVERSATION_CLIENT);

// Helpers
const { getPaymentGatewayCharge } = require('../helpers/clientHelpers');

/**
 * @param creator creator document
 * @param files information uploaded files
 */
exports.uploadBriefOrReference = async ({ client, files }) => {
    if (Array.isArray(files) && files.length > 0) {
        return {
            msg: 'brief/reference uploaded',
            url: `${files[0].location}`,
        };
    }
    throw new BadRequest('Upload Unsuccesful');
};

exports.getPaymentsList = async ({ client }) => {
    const conversations = await ConversationClient.find({
        u1: client._id,
        st: C.CONVERSATION_STATUS.CREATED,
    }).exec();
    const conversationIds = conversations.map((convo) => {
        return convo._id;
    });
    const query = {
        convoId: { $in: conversationIds },
    };
    // https://stackoverflow.com/questions/58065037/mongodb-safely-sort-inner-array-after-group
    const aggregatePipeline = [
        { $match: query },
        { $sort: { puid: -1 } },
        {
            $lookup: {
                from: 'users',
                localField: 'sd',
                foreignField: '_id',
                as: 'creator',
            },
        },
        {
            $group: {
                _id: '$convoId',
                // push current document being processed
                invoices: { $push: '$$ROOT' },
            },
        },
        {
            $project: {
                lastPaymentPop: { $arrayElemAt: ['$invoices', 0] },
                creatorNamePop: { $arrayElemAt: ['$invoices.creator', 0] },
            },
        },
        {
            $project: {
                lastPayment: '$lastPaymentPop',
                creatorName: { $arrayElemAt: ['$creatorNamePop', 0] },
            },
        },
        {
            $project: {
                conversationId: '$_id',
                'name.first': '$creatorName.n.f',
                'name.last': '$creatorName.n.l',
                fullname: {
                    $concat: ['$creatorName.n.f', ' ', '$creatorName.n.l'],
                },
                image: '$creatorName.img',
                paidOn: '$lastPayment.pon',
                dueDate: '$lastPayment.dd',
                status: '$lastPayment.st',
                currency: '$lastPayment.cur',
            },
        },
    ];
    const payments = await Invoice.aggregate(aggregatePipeline);
    return {
        payments,
    };
};

/**
 * Payment controllers
 */

exports.payInvoice = async ({ client, invoiceId, clientCardCountry }) => {
    const findInvoice = await Invoice.findOne({
        _id: invoiceId,
    })
        .populate('convoId')
        .exec();
    if (!findInvoice) throw new BadRequest('Invalid invoice');
    if (findInvoice.pg !== C.PAYMENT_GATEWAY.STRP)
        throw new BadRequest('This Invoice should be paid using cashfree PG');
    if (findInvoice.convoId.u1 != client.id)
        throw new BadRequest('not part of conersation');

    if (
        findInvoice.st == C.INVOICE_STATES.PENDING ||
        findInvoice.st == C.INVOICE_STATES.PAID
    )
        // ?? What happens with failed state
        throw new BadRequest(
            'Invoice is already in processing/processed state',
        );
    const receiver = await User.findOne({
        _id: findInvoice.convoId.u2,
    }).exec();
    const recevierAccountId = receiver.strp.acid;
    if (
        !recevierAccountId ||
        receiver.strp.cns != C.STRIPE_CONNECTION_STATUS.COMPLETED
    )
        throw new BadRequest('User is not connected to stripe');
    let paymentAmount = findInvoice.tot;
    let paymentIntent;
    // Only one payment intent should be created per order
    if (findInvoice.intnt) {
        if (findInvoice.invoiceMode == C.INVOICE_MODE.TRANSFER) {
            // Intent is on behalf of connected account
            paymentIntent = await stripe.paymentIntents.retrieve(
                findInvoice.intnt,
                /**
                 * Clients can make requests as connected accounts using the special header Stripe-Account which should contain a Stripe account ID
                 * This field maps to that header
                 */
                { stripeAccount: `${recevierAccountId}` },
            );
        } else {
            paymentIntent = await stripe.paymentIntents.retrieve(
                findInvoice.intnt,
            );
        }
    } else {
        // Our platform account is in India
        // So if invoiceMode is receive then payeeCountry is India
        const payeeCountry =
            findInvoice.invoiceMode == C.INVOICE_MODE.TRANSFER
                ? receiver.adr.co
                : C.CURRENCY_COUNTRY.INDIA;
        // extraCharge may include one or more of - gateway charge, tax and currency conversation charge
        // We pass this charge to the client
        const extraCharge = await getPaymentGatewayCharge({
            pg: C.PAYMENT_GATEWAY.STRP,
            total: paymentAmount,
            presentmentCurrency: findInvoice.cur,
            clientCardCountry,
            payeeCountry,
        });
        paymentAmount += extraCharge;
        paymentAmount = paymentAmount.toFixed(2);
        // console.log(paymentAmount);
        let paymentIntentData = {
            payment_method_types: ['card'],
            amount: paymentAmount * 100,
            currency: findInvoice.cur,
            metadata: {
                conversationId: findInvoice.convoId.id,
                invoiceId: findInvoice.id,
            },
            receipt_email: client.e,
        };
        if (findInvoice.invoiceMode == C.INVOICE_MODE.TRANSFER) {
            paymentIntentData = {
                ...paymentIntentData,
                application_fee_amount: 0,
            };
            // Make payment to creator
            paymentIntent = await stripe.paymentIntents.create(
                paymentIntentData,
                /**
                 * This is a direct charge
                 * Payment intent is created on behalf of the connected account
                 * Clients can make requests as connected accounts using the special header Stripe-Account which should contain a Stripe account ID
                 * This field maps to that header
                 */
                { stripeAccount: `${recevierAccountId}` },
            );
        } else {
            // Receive payment in Passionbits account
            paymentIntent = await stripe.paymentIntents.create(
                paymentIntentData,
            );
        }

        findInvoice.intnt = paymentIntent.id;
        await findInvoice.save();
    }

    return {
        clientSecret: paymentIntent.client_secret,
        amount: paymentAmount,
        accountId: recevierAccountId,
        invoiceMode: findInvoice.invoiceMode,
    };
};

// Collect client invite field history (Route in internal)

exports.collectInviteFields = async ({
    client,
    title,
    description,
    deliverables,
}) => {
    const findClient = await Client.findById(client).exec();
    if (!findClient) throw new BadRequest('No such client by id');
    findClient.prevInviteValues.splice(0, 0, {
        title,
        description,
        deliverables,
    });
    if (
        findClient.prevInviteValues.length > C.CLIENT_COLLECT_PREV_INVITE_LIMIT
    ) {
        findClient.prevInviteValues.pop();
    }
    await findClient.save();
    return { msg: 'field values saved' };
};

exports.getLastInviteFields = async ({ client }) => {
    return {
        prevInviteValues: client.prevInviteValues,
    };
};

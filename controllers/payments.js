/**
 * Dependencies
 */

const mongoose = require('mongoose');
const stripe = require('../config/stripe');
const C = require('../lib/constants');
const env = require('../config/env');

// Custom errors
const { BadRequest, NotFound, InternalServerError } = require('../lib/errors');

// Models
const Invoice = mongoose.model(C.MODELS.INVOICE);
const InvoiceBill = mongoose.model(C.MODELS.INVOICE_BILL);
const InvoiceClient = mongoose.model(C.MODELS.INVOICE_CLIENT);
const User = mongoose.model(C.MODELS.USER_C);

// Services
const cashfreeService = require('../services/cashfree');
const razorpayService = require('../services/razorpay');

// Helpers
const {
    getPaymentGatewayCharge,
} = require('../controllers/helpers/clientHelpers');

// Controllers

// * Cashfree onboarding controllers

exports.onboardUserAsbeneficiary = async ({ user, data }) => {
    if (user.adr.co !== C.CURRENCY_COUNTRY.INDIA) {
        throw new BadRequest(
            'Onboarding on cashfree is not allowed for creators outside of India',
        );
    }
    /*  if (user.cfos !== C.CF_CONNECTION_STATUS.PENDING)
        throw new BadRequest('You are already onboarded');
 */
    // Check if Beneficiary exists with Beneficiary = user.id
    const getBene = await cashfreeService.getBeneficiaryById({
        beneId: user.id,
    });
    if (getBene) {
        // This is an update operation
        await cashfreeService.removeBeneficiary({ beneId: user.id });
    }
    // Create a new Beneficiary with Beneficiary = user.id
    // One of bank or upi details is necessary but both are not allowed
    if (data.bank && data.upi) {
        throw new BadRequest('You can provide only one of bank or upi details');
    } else if (!(data.bank || data.upi)) {
        throw new BadRequest('One of bank or upi is required');
    }

    // Fields which we don't ask from user
    // id, email
    let createBenData = {
        beneId: user.id,
        email: user.e,
        phone: data.phone,
        address1: data.address,
    };
    if (data.bank) {
        createBenData = {
            ...createBenData,
            name: data.bank.accountHolder,
            bankAccount: data.bank.accountNumber,
            ifsc: data.bank.ifsc,
        };
    } else {
        createBenData = {
            ...createBenData,
            name: data.upi.accountHolder,
            vpa: data.upi.vpa,
        };
    }
    await cashfreeService.createNewBeneficiary({ data: createBenData });
    user.cfos = C.CF_CONNECTION_STATUS.ONBOARDED;
    user.pgs = C.PAYMENT_GATEWAY.CF;
    if (data.upi) user.cfat = 'upi';
    else user.cfat = 'banktransfer';
    await user.save();
    return { msg: 'Onboarding success' };
};

exports.removeBeneficiary = async ({ user }) => {
    if (user.cfos === C.CF_CONNECTION_STATUS.PENDING)
        throw new BadRequest('You are not added as beneficiary on cashfree');
    await cashfreeService.removeBeneficiary({ beneId: user.id });
    user.cfos = C.CF_CONNECTION_STATUS.PENDING;
    user.pgs = C.PAYMENT_GATEWAY.STRP;
    await user.save();
    return { msg: 'Beneficiary removed' };
};

exports.getOnboardingDetails = async ({ user }) => {
    let status = user.cfos;
    let response = {
        status,
    };
    if (status === C.CF_CONNECTION_STATUS.ONBOARDED) {
        let getBene = await cashfreeService.getBeneficiaryById({
            beneId: user.id,
        });
        if (!getBene) {
            throw new InternalServerError(
                'User onboarded but Beneficiary not found',
            );
        }
        const bankDetails = {
            accountNumber: getBene.bankAccount,
            accountHolder: getBene.name,
            ifsc: getBene.ifsc,
            address: getBene.address1,
            phone: getBene.phone,
        };
        const upiDetails = {
            vpa: getBene.vpa,
            accountHolder: getBene.name,
            address: getBene.address1,
            phone: getBene.phone,
        };
        response = { ...response, bankDetails, upiDetails };
    }
    return response;
};

exports.verifyUpiId = async ({ user, name, upi }) => {
    const details = await cashfreeService.verifyUpi({
        name,
        upi,
    });
    return details;
};

// * Stripe onboarding controllers

function generateAccountLink(accountID, role) {
    const creatorHome =
        role == C.MODELS.WRITER_C ? env.CREATOR_PORTFOLIO : env.PM_PORTFOLIO;
    return stripe.accountLinks
        .create({
            type: 'account_onboarding',
            account: accountID,
            refresh_url: `${creatorHome}/refresh-stripe`,
            return_url: `${creatorHome}/connected`,
        })
        .then((link) => link.url);
}

exports.accountOnboard = async ({ creator, country }) => {
    let accountID = '';
    if (
        creator.strp.cns == C.STRIPE_CONNECTION_STATUS.NOT_DONE ||
        !creator.strp.acid
    ) {
        const account = await stripe.accounts.create({
            type: 'standard',
            email: creator.e,
            business_type: 'individual',
            // country ->  ISO 3166-1 alpha-2 code
            country,
            individual: {
                email: creator.e,
                first_name: creator.n.f,
                last_name: creator.n.l,
            },
            /* * Supported with express/custom accounts only

            capabilities: {
                card_payments: { requested: true },
                transfers: { requested: true },
            },*/
            metadata: {
                role: creator.__t,
                id: creator.id,
            },
        });
        creator.strp.acid = account.id;
        creator.strp.cns = C.STRIPE_CONNECTION_STATUS.STARTED;
        accountID = account.id;
    } else if (
        (creator.strp.cns == C.STRIPE_CONNECTION_STATUS.STARTED ||
            creator.strp.cns == C.STRIPE_CONNECTION_STATUS.INFO_MISSING) &&
        creator.strp.acid
    ) {
        const getAccount = await stripe.account.retrieve(creator.strp.acid);
        accountID = creator.strp.acid;
    } else {
        throw new BadRequest('Not allowed to onboard');
    }
    const accountLinkURL = await generateAccountLink(accountID, creator.__t);
    //

    await creator.save();
    return {
        accountLinkURL,
    };
    /**
     * * Creators shouldn't be able to send invoices until their account status is completed
     */
};

exports.generateRefreshUrl = async ({ creator }) => {
    // Generate only when onbaording is incomplete
    if (
        !(
            creator.strp.cns == C.STRIPE_CONNECTION_STATUS.STARTED ||
            creator.strp.cns == C.STRIPE_CONNECTION_STATUS.INFO_MISSING
        ) ||
        !creator.strp.acid
    )
        throw new BadRequest(
            'Invalid Request. Refresh Url can be generated only when onboarding flow was incomplete',
        );

    const accountLinkURL = await generateAccountLink(
        creator.strp.acid,
        creator.__t,
    );
    return {
        accountLinkURL,
    };
};

// * Razorpay Onboarding Controllers

exports.razorpayOnboard = async ({ user, data }) => {
    if (user.adr.co !== C.CURRENCY_COUNTRY.INDIA) {
        throw new BadRequest(
            'Onboarding on Razorpay is not allowed for creators outside of India',
        );
    }
    if (user.rzpy.obs == C.RZPY_CONNECTION_STATUS.ONBOARDED) {
        throw new BadRequest('Already onboarded on razorpay');
    }
    let accountId = await razorpayService.createLinkedAccount({ data });
    user.rzpy.acid = accountId;
    user.rzpy.obs = C.RZPY_CONNECTION_STATUS.ONBOARDED;
    await user.save();
    return {
        msg: 'Onboard success',
        data,
    };
};

exports.getLinkedAccountDetails = async ({ user }) => {
    let status = user.rzpy.obs;
    let response = { status };
    if (status == C.RZPY_CONNECTION_STATUS.ONBOARDED) {
        const { name, email, activation_details } =
            await razorpayService.fetchLinkedAccount({
                id: user.rzpy.acid,
            });
        response = { ...response, name, email, activation_details };
    }
    return response;
};

exports.disableRazorpay = async ({ user }) => {
    if (user.rzpy.obs !== C.RZPY_CONNECTION_STATUS.ONBOARDED) {
        throw new BadRequest('You are not onboarded on razorpay');
    }
    user.rzpy.obs = C.RZPY_CONNECTION_STATUS.PENDING;
    await user.save();
    return {
        msg: 'Razorpay disabled',
    };
};

exports.selectPaymentGateway = async ({ creator, pg }) => {
    /* if (pg == C.PAYMENT_GATEWAY.STRP) {
        if (creator.strp.cns !== C.STRIPE_CONNECTION_STATUS.COMPLETED) {
            throw new BadRequest('Stripe onboarding is incomplete');
        }
    }
    */
    if (pg == C.PAYMENT_GATEWAY.RP) {
        if (creator.rzpy.obs !== C.RZPY_CONNECTION_STATUS.ONBOARDED) {
            throw new BadRequest('Not onboarded on Razorpay');
        }
    }
    creator.pgs = pg;
    await creator.save();
    return {
        msg: 'selected',
        pg,
    };
};

exports.getAccountOnboardState = async ({ creator }) => {
    return {
        stripeOnboardingState: creator.strp.cns,
        razorpayOnboardState: creator.rzpy.obs,
        pgSelected: creator.pgs,
    };
};

// * Make Invoice payment controllers

// Cashfree pay invoice
exports.payInvoiceCF = async ({ user, invoiceId, customer_phone }) => {
    const findInvoice = await Invoice.findOne({
        _id: invoiceId,
    })
        .populate('convoId')
        .exec();
    if (!findInvoice) throw new BadRequest('Invalid invoice');
    if (findInvoice.sender == user.id) {
        throw new BadRequest('You cannot pay invoice that you sent');
    }
    if (findInvoice.pg !== C.PAYMENT_GATEWAY.CF)
        throw new BadRequest('Invoice should be paid via Stripe PG');
    if (findInvoice.convoId.u1 != user.id)
        throw new BadRequest('Not part of conversation');

    if (
        findInvoice.st == C.INVOICE_STATES.PENDING ||
        findInvoice.st == C.INVOICE_STATES.PAID
    )
        // ?? What happens with failed state
        throw new BadRequest('Invoice is already in processing/paid state');
    const payee = await User.findOne({
        _id: findInvoice.convoId.u2,
    })
        .select('cfos')
        .exec();
    if (payee.cfos === C.CF_CONNECTION_STATUS.PENDING) {
        throw new BadRequest('User is not added to cashfree as a vendor');
    }
    // If order has already been created for this invoice
    // Fetch paymentLink of order and return
    let paymentLink = '';
    if (findInvoice.coc) {
        const order = await cashfreeService.getOrder({
            orderId: findInvoice.id,
        });
        paymentLink = order.payment_link;
    } else {
        // Otherwise
        // Create a new order
        // and return paymentLink
        const payer = await User.findById(findInvoice.convoId.u1)
            .select('e')
            .exec();
        let paymentAmount = findInvoice.tot;
        // extraCharge may include one or more of - gateway charge, tax and currency conversation charge
        // We pass this charge to the client
        const extraCharge = await getPaymentGatewayCharge({
            pg: C.PAYMENT_GATEWAY.CF,
            total: paymentAmount,
            presentmentCurrency: findInvoice.cur,
            clientCardCountry: C.COUNTRY_CODES.INDIA,
            payeeCountry: C.CURRENCY_COUNTRY.INDIA,
        });
        paymentAmount += extraCharge;
        paymentAmount = paymentAmount.toFixed(2);
        const roleBasedPath =
            user.__t == C.MODELS.PM_C ? env.PM_PORTFOLIO : env.CLIENT_PROFILE;
        let data = {
            order_id: findInvoice.id,
            order_amount: paymentAmount,
            order_currency: 'INR',
            customer_details: {
                customer_id: payer.id,
                customer_email: payer.email,
                customer_phone,
            },
            order_meta: {
                return_url: `${roleBasedPath}/chat/cf/status?order_id={order_id}&order_token={order_token}`,
                notify_url: `${env.WEBHOOK_PATH}/webhook/cashfree-payment`,
            },
        };
        paymentLink = await cashfreeService.createOrder({
            data,
        });
        findInvoice.coc = true;
        await findInvoice.save();
    }
    return { paymentLink };
};

exports.getOrderStatus = async ({ orderId, orderToken }) => {
    const order = await cashfreeService.getOrder({
        orderId,
    });
    if (order.order_token !== orderToken) {
        throw new BadRequest('Order token mismatch');
    }
    return {
        order_status: order.order_status,
    };
};

exports.payInvoiceStripe = async ({ invoiceId, clientCardCountry }) => {
    const findInvoice = await InvoiceBill.findOne({
        _id: invoiceId,
    }).exec();
    if (!findInvoice) throw new BadRequest('Invalid invoice');

    if (findInvoice.pg !== C.PAYMENT_GATEWAY.STRP)
        throw new BadRequest('This Invoice is not payable using stripe');

    if (findInvoice.st !== C.INVOICE_STATES.SENT)
        // ?? What happens with failed state
        throw new BadRequest('Invoice is not in a payable state');

    // Check if there is some amount due on invoice
    let amountDueOnInvoice = findInvoice.getAmountDue();

    if (amountDueOnInvoice <= 0)
        throw new BadRequest('No amount is due on this invoice');

    const invoiceClient = await InvoiceClient.findOne({
        _id: findInvoice.invc,
    }).exec();

    if (!invoiceClient) throw new BadRequest('Invoice client not found');

    const receiver = await User.findOne({
        _id: findInvoice.uid,
    })
        .select('adr co strp')
        .exec();

    if (!receiver) throw new BadRequest('Receiver not found');

    const recevierAccountId = receiver.strp.acid;
    if (
        !recevierAccountId ||
        receiver.strp.cns != C.STRIPE_CONNECTION_STATUS.COMPLETED
    )
        throw new BadRequest('User is not connected to stripe');

    let paymentIntent;
    let paymentAmount = amountDueOnInvoice;

    // * Calculate payment amount with extra charge

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
    paymentAmount = Number(paymentAmount.toFixed(2));

    let createNewOrder = false;

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
        if (paymentAmount != paymentIntent.amount / 100) {
            createNewOrder = true;
        }
    } else createNewOrder = true;

    /* // Only one payment intent should be created per order until amount due changes
    if (findInvoice.intnt) {
        if (findInvoice.invoiceMode == C.INVOICE_MODE.TRANSFER) {
            // Intent is on behalf of connected account
            paymentIntent = await stripe.paymentIntents.retrieve(
                findInvoice.intnt,
               
                { stripeAccount: `${recevierAccountId}` },
            );
        } else {
            paymentIntent = await stripe.paymentIntents.retrieve(
                findInvoice.intnt,
            );
        }
    } */
    if (createNewOrder) {
        // console.log(paymentAmount);
        let paymentIntentData = {
            payment_method_types: ['card'],
            amount: paymentAmount * 100,
            currency: findInvoice.cur,
            metadata: {
                // conversationId: findInvoice.convoId.id,
                invoiceId: findInvoice.id,
                usecase: 'invoice_pay',
            },
            receipt_email: invoiceClient.e,
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
        currency: findInvoice.cur,
    };
};

exports.payInvoiceRazorpay = async ({ invoiceId }) => {
    const findInvoice = await InvoiceBill.findOne({
        _id: invoiceId,
    }).exec();
    if (!findInvoice) throw new BadRequest('Invalid invoice');

    if (findInvoice.pg !== C.PAYMENT_GATEWAY.RP)
        throw new BadRequest('This Invoice is not payable using Razorpay');

    // Pending: Status of payment on razorpay is 'authorized'
    // Paid: Status of payment on razorpay is 'paid'
    if (findInvoice.st !== C.INVOICE_STATES.SENT)
        // ?? What happens with failed state
        throw new BadRequest('Invoice is not in a payable state');

    // Check if there is some amount due on invoice
    let amountDueOnInvoice = findInvoice.getAmountDue();

    if (amountDueOnInvoice <= 0)
        throw new BadRequest('No amount is due on this invoice');

    // To check if payee has not disconnected Razorpay after sending invoice
    const payee = await User.findOne({
        _id: findInvoice.uid,
    })
        .select('rzpy')
        .exec();

    if (!payee) throw new BadRequest('Payee not found');

    const recevierAccountId = payee.rzpy.acid;
    if (
        !recevierAccountId ||
        payee.rzpy.obs != C.RZPY_CONNECTION_STATUS.ONBOARDED
    )
        throw new BadRequest('Payee is not connected to Razorpay');

    let orderId;

    let paymentAmount = amountDueOnInvoice * 1.02;
    paymentAmount = Number(paymentAmount.toFixed(2));

    let createNewOrder = false;
    if (findInvoice.rzpy.orderId) {
        const { amount } = await razorpayService.fetchOrderById({
            order_id: findInvoice.rzpy.orderId,
        });
        if (paymentAmount != amount / 100) {
            createNewOrder = true;
        } else {
            orderId = findInvoice.rzpy.orderId;
        }
    } else {
        createNewOrder = true;
    }
    // console.log(createNewOrder);

    /* if (findInvoice.rzpy.orderId) {
        // If order has already been created for these invoice and order is in created state
        // Use existing orderId
        orderId = findInvoice.rzpy.orderId;
    } */
    if (createNewOrder) {
        // If order has not been created, create order and use new orderId
        if (findInvoice.invoiceMode == C.INVOICE_MODE.TRANSFER) {
            // This amount should be transferred to linked account (payee)
            orderId = await razorpayService.createOrder({
                amount: paymentAmount,
                receipt: findInvoice.id,
                notes: {
                    usecase: 'invoice_pay',
                },
                transfers: [
                    {
                        account: recevierAccountId,
                        // ?? Why not just the amountDueOnInvoice
                        amount: paymentAmount * 100,
                        currency: 'INR',
                        notes: {
                            usecase: 'invoice_pay',
                            userId: payee.id,
                            invoiceId: findInvoice.id,
                        },
                        linked_account_notes: ['userId'],
                        on_hold: 0,
                    },
                ],
            });
        } else {
            // This amount is to be collected
            orderId = await razorpayService.createOrder({
                amount: paymentAmount,
                receipt: findInvoice.id,
                notes: {
                    usecase: 'invoice_pay',
                },
            });
        }
        // Link orderId to invoice
        findInvoice.rzpy.orderId = orderId;
        await findInvoice.save();
    }

    return {
        amount: paymentAmount,
        invoiceMode: findInvoice.invoiceMode,
        currency: findInvoice.cur,
        orderId,
    };
};

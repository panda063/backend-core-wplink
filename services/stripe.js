const stripe = require('../config/stripe');

exports.createPaymentIntent = async ({
    amount,
    currency,
    metadata,
    receipt_email,
    asConnected,
}) => {
    let paymentIntentData = {
        payment_method_types: ['card'],
        amount: amount * 100,
        currency,
        metadata,
        receipt_email,
    };
    let paymentIntent;
    if (asConnected) {
        // console.log(paymentIntentData);
        paymentIntent = await stripe.paymentIntents.create(
            paymentIntentData,
            asConnected,
        );
    } else {
        paymentIntent = await stripe.paymentIntents.create(paymentIntentData);
    }

    return paymentIntent;
};

exports.initiateTransferToConnectedUser = async ({
    amount,
    currency,
    accountId,
}) => {
    const transfer = await stripe.transfers.create({
        amount: amount * 100,
        currency: currency,
        destination: accountId,
    });
    return transfer;
};

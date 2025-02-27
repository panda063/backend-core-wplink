// Dependencies
const axios = require('axios');

const { keyId, secret } = require('../config/razorpay');
// Custom errors
const { BadRequest } = require('../lib/errors');

/**
 * Create linked accounts for razorpay route.
 * Imp: Currently razorpay doesn't provide APIs to delete an account.
 * Imp: You can create 2 accounts with the same email
 */
exports.createLinkedAccount = async ({ data }) => {
    try {
        const {
            name,
            email,
            business_name,
            business_type,
            ifsc_code,
            beneficiary_name,
            account_type,
            account_number,
        } = data;
        const response = await axios({
            method: 'post',
            // TODO: This API is in still in beta phase
            url: `https://api.razorpay.com/v1/beta/accounts`,
            headers: {
                'Content-type': 'application/json',
                // Authorization: `${basicAuth}`,
            },
            auth: {
                username: keyId,
                password: secret,
            },
            data: {
                name,
                email,
                tnc_accepted: true,
                account_details: {
                    business_name,
                    business_type,
                },
                bank_account: {
                    ifsc_code,
                    beneficiary_name,
                    account_type,
                    account_number,
                },
            },
        });
        if (response.data.error) {
            throw new Error(response.data.error.description);
        }
        return response.data.id;
    } catch (err) {
        const errorMessage = err.response.data.error
            ? err.response.data.error.description
            : 'Some error occured';
        throw new BadRequest(errorMessage);
    }
};

/**
 * Fetch linked account by id
 */

exports.fetchLinkedAccount = async ({ id }) => {
    try {
        const response = await axios({
            method: 'get',
            url: `https://api.razorpay.com/v1/beta/accounts/${id}`,
            auth: {
                username: keyId,
                password: secret,
            },
        });
        if (response.data.error) {
            throw new Error(response.data.error.description);
        }
        return response.data;
    } catch (err) {
        const errorMessage = err.response.data.error
            ? err.response.data.error.description
            : 'Some error occured';
        throw new BadRequest(errorMessage);
    }
};

/**
 * Create order for payment.
 * If transfers[] is provided, this order is a 'razorpay route' order
 */

exports.createOrder = async ({ amount, receipt, notes, transfers }) => {
    try {
        let orderData = {
            amount: amount * 100,
            currency: 'INR',
            notes,
            // Receipt number that corresponds to this order, set for your internal reference.
            receipt,
            /*  notes: {
                key1: 'value3',
                key2: 'value2',
            }, */
        };
        if (Array.isArray(transfers)) {
            orderData = { ...orderData, transfers };
        }
        const response = await axios({
            method: 'post',
            url: 'https://api.razorpay.com/v1/orders',
            headers: {
                'Content-type': 'application/json',
            },
            auth: {
                username: keyId,
                password: secret,
            },
            data: orderData,
        });
        if (response.data.error) {
            throw new Error(response.data.error.description);
        }
        return response.data.id;
    } catch (err) {
        const errorMessage = err.response.data.error
            ? err.response.data.error.description
            : 'Some error occured';
        throw new BadRequest(errorMessage);
    }
};

/**
 * This controllers returns the order entity given the order_id
 */
exports.fetchOrderById = async ({ order_id }) => {
    try {
        const response = await axios({
            method: 'get',
            url: `https://api.razorpay.com/v1/orders/${order_id}`,
            auth: {
                username: keyId,
                password: secret,
            },
        });
        if (response.data.error) {
            throw new Error(response.data.error.description);
        }
        return response.data;
    } catch (err) {
        const errorMessage = err.response.data.error
            ? err.response.data.error.description
            : 'Some error occured';
        throw new BadRequest(errorMessage);
    }
};

exports.createTransferFromPayment = async ({ paymentId, transfers }) => {
    try {
        const response = await axios({
            method: 'post',
            url: `https://api.razorpay.com/v1/payments/${paymentId}/transfers`,
            auth: {
                username: keyId,
                password: secret,
            },
            data: { transfers },
        });
        if (response.data.error) {
            throw new Error(response.data.error.description);
        }
        return response.data;
    } catch (err) {
        const errorMessage = err.response.data.error
            ? err.response.data.error.description
            : 'Some error occured';
        throw new BadRequest(errorMessage);
    }
};

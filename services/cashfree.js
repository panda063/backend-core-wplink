// Dependencies
const axios = require('axios');
const { pgKeys, payoutKeys } = require('../config/cashfree');

// Use clientId and clientSecret to get authentication token
async function getAuthToken(usecase) {
    try {
        let clientId = '';
        let clientSecret = '';
        if (usecase == 'verifyUpi') {
            clientId = pgKeys.id;
            clientSecret = pgKeys.secret;
        } else if (usecase == 'payout') {
            clientId = payoutKeys.id;
            clientSecret = payoutKeys.secret;
        }
        const response = await axios({
            url: `${payoutKeys.path}/payout/v1/authorize`,
            headers: {
                'X-Client-Id': `${clientId}`,
                'X-Client-Secret': `${clientSecret}`,
            },
            method: 'post',
        });
        if (response.data.status !== 'SUCCESS') {
            throw new Error(response.data.message);
        }
        const { token } = response.data.data;
        return token;
    } catch (err) {
        console.log(err);
        throw new Error('Cashfree authtentication failed');
    }
}

/**
 * * Payout beneficiary onboarding endpoints
 */

/**
 * @param beneId
 * @returns Beneficiary object if Beneficiary was found else returns null
 */

exports.getBeneficiaryById = async ({ beneId }) => {
    try {
        const authToken = await getAuthToken('payout');
        const response = await axios({
            url: `${payoutKeys.path}/payout/v1/getBeneficiary/${beneId}`,
            method: 'get',
            headers: {
                Authorization: `Bearer ${authToken}`,
                'Content-Type': 'application/json',
            },
        });
        // Return null value if no vendor exists with this vendorId
        // Status is 404 in this case
        if (
            response.data.status === 'ERROR' &&
            response.data.subCode === '404'
        ) {
            return null;
            // Otherwise was some other exception occured
        } else if (response.data.status !== 'SUCCESS')
            throw new Error(response.data.message);
        return response.data.data;
    } catch (err) {
        throw new Error('Error in fetching Beneficiary');
    }
};

/**
 * @param data Contains all and only the fields required to add a new Beneficiary using cashfree APIs
 */
exports.createNewBeneficiary = async ({ data }) => {
    try {
        const authToken = await getAuthToken('payout');
        const response = await axios({
            url: `${payoutKeys.path}/payout/v1/addBeneficiary`,
            method: 'post',
            headers: {
                Authorization: `Bearer ${authToken}`,
                'Content-Type': 'application/json',
            },
            data,
        });
        // console.log(response.data);
        if (response.data.status !== 'SUCCESS')
            throw new Error(response.data.message);
    } catch (err) {
        throw new Error(err.message);
    }
};

/**
 * @param beneId Remove beneficiary beneId
 */
exports.removeBeneficiary = async ({ beneId }) => {
    try {
        const authToken = await getAuthToken('payout');
        const response = await axios({
            url: `${payoutKeys.path}/payout/v1/removeBeneficiary`,
            method: 'post',
            headers: {
                Authorization: `Bearer ${authToken}`,
                'Content-Type': 'application/json',
            },
            data: { beneId },
        });
        if (response.data.status !== 'SUCCESS')
            throw new Error(response.data.message);
    } catch (err) {
        throw new Error('Error in removing beneficiary');
    }
};

/* // ! Easy split onboarding endpoints

exports.getVendorById = async ({ vendorId }) => {
    try {
        // const authToken = await getAuthToken();
        const response = await axios({
            url: `${epKeys.path}/api/v2/easy-split/vendors/${vendorId}`,
            method: 'get',
            headers: {
                'x-client-id': `${epKeys.id}`,
                'x-client-secret': `${epKeys.secret}`,
                'Content-Type': 'application/json',
            },
        });
        // Return null value if no vendor exists with this vendorId
        // Status is 404 in this case
        if (response.data.status === 'ERROR' && response.data.subCode === 404) {
            return null;
            // Otherwise was some other exception occured
        } else if (response.data.status !== 'OK')
            throw new Error(response.data.message);
        return response.data.vendorDetails;
    } catch (err) {
        throw new Error('Error in fetching vendor');
    }
};

exports.createNewVendor = async ({ data }) => {
    try {
        // By default create ACTIVE vendors with settlementCycleId = x
        data = { ...data, status: 'ACTIVE', settlementCycleId: 1 };
        // const authToken = await getAuthToken();
        const response = await axios({
            url: `${epKeys.path}/api/v2/easy-split/vendors`,
            method: 'post',
            headers: {
                'x-client-id': `${epKeys.id}`,
                'x-client-secret': `${epKeys.secret}`,
                'Content-Type': 'application/json',
            },
            data,
        });
        if (response.data.status !== 'OK')
            throw new Error(response.data.message);
    } catch (err) {
        throw new Error('Vendor creation failed');
    }
};

exports.updateVendorDetails = async ({ vendorId, data }) => {
    try {
        // By default create ACTIVE vendors with settlementCycleId = x
        data = { ...data, status: 'ACTIVE', settlementCycleId: 1 };
        // const authToken = await getAuthToken();
        const response = await axios({
            url: `${epKeys.path}/api/v2/easy-split/vendors/${vendorId}`,
            method: 'put',
            headers: {
                'x-client-id': `${epKeys.id}`,
                'x-client-secret': `${epKeys.secret}`,
                'Content-Type': 'application/json',
            },
            data,
        });
        if (response.data.status !== 'OK')
            throw new Error(response.data.message);
    } catch (err) {
        throw new Error('Vendor creation failed');
    }
};
 */

exports.createTransferSync = async ({ data }) => {
    try {
        const authToken = await getAuthToken('payout');
        const response = await axios({
            url: `${payoutKeys.path}/payout/v1/requestTransfer`,
            method: 'post',
            headers: {
                Authorization: `Bearer ${authToken}`,
                'Content-Type': 'application/json',
            },
            data,
        });
        // console.log(data, response);
        if (response.data.status === 'ERROR')
            throw new Error(response.data.message);
    } catch (err) {
        // console.log(err);
        throw new Error('Unable to create transfer');
    }
};

/**
 * @param name Name of the account
 * @param upi A valid vpa address
 * @returns If successful returns an object containing account name
 */
exports.verifyUpi = async ({ name, upi }) => {
    try {
        const authToken = await getAuthToken('verifyUpi');
        const response = await axios({
            url: `https://payout-api.cashfree.com/payout/v1/validation/upiDetails`,
            method: 'get',
            headers: {
                Authorization: `Bearer ${authToken}`,
                'Content-Type': 'application/json',
            },
            params: {
                name,
                vpa: upi,
            },
        });
        if (response.data.status !== 'SUCCESS') {
            throw new Error(response.data.message);
        }
        return response.data.data;
    } catch (err) {
        throw new Error('Unable to verify upi ');
    }
};

/**
 * @param data Containing all the fields required to create an order on cashfree
 * @returns Payment link of the order
 */
exports.createOrder = async ({ data }) => {
    try {
        const response = await axios({
            url: `${pgKeys.path}/pg/orders`,
            method: 'post',
            headers: {
                'x-client-id': `${pgKeys.id}`,
                'x-client-secret': `${pgKeys.secret}`,
                'x-api-version': '2021-05-21',
            },
            data,
        });
        if (!response.data.payment_link) {
            throw new Error('Create order failed');
        }
        return response.data.payment_link;
    } catch (err) {
        console.log(err);
        throw new Error('Error creating order for invoice payment');
    }
};

/**
 * @param orderId
 * @returns Payment link of the order
 */
exports.getOrder = async ({ orderId }) => {
    try {
        // console.log(orderId);
        const response = await axios({
            url: `${pgKeys.path}/pg/orders/${orderId}`,
            method: 'get',
            headers: {
                'x-client-id': `${pgKeys.id}`,
                'x-client-secret': `${pgKeys.secret}`,
                'x-api-version': '2021-05-21',
            },
        });
        // console.log(response.data);
        if (!response.data.payment_link) {
            throw new Error('Error in fetching order');
        }
        // console.log(response.data);
        return response.data;
    } catch (err) {
        // console.log(err);
        throw new Error('Error in fetching order');
    }
};

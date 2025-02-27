/**
 * Dependencies
 */
const { celebrate, Joi, isCelebrate } = require('celebrate');
Joi.objectId = require('joi-objectid')(Joi);
const router = require('express').Router();
const C = require('../lib/constants');
const env = require('../config/env');
const c = require('./helper');

// Custom errors
const { BadRequest, NotFound, InternalServerError } = require('../lib/errors');

// Controllers
const paymentControllers = require('../controllers/payments');

/**
 * Guard Middlewares
 * Some routes are role specific. To prevent access we have this middleware
 */
const roleAccessGuard = (
    validRoles = [C.ROLES.CLIENT_C, C.ROLES.PM_C, C.ROLES.WRITER_C],
) => {
    return (req, res, next) => {
        const role = req.user.__t;
        if (!validRoles.includes(role)) {
            return next(
                new BadRequest('Role not allowed to access this route'),
            );
        }
        return next();
    };
};

// Temporarily block access on production

const cashfreeAccessGuard = () => {
    return (req, res, next) => {
        if (env.NODE_ENV) {
            return next(
                new BadRequest(
                    'Cashfree has been disabled for end to end payments',
                ),
            );
        }
        return next();
    };
};

/**
 * * Cashfree vendor onboarding endpoints
 */

/**
 * @apiName beneficiary onboard. Currently pm and creators can be beneficiaries
 */

router.post(
    '/cf/onboard',
    cashfreeAccessGuard,
    roleAccessGuard([C.ROLES.PM_C, C.ROLES.WRITER_C]),
    celebrate({
        body: Joi.object().keys({
            phone: Joi.string().min(8).max(12).trim().required(),
            address: Joi.string().trim().max(150).required(),
            bank: Joi.object()
                .keys({
                    accountNumber: Joi.string()
                        .min(9)
                        .max(18)
                        .trim()
                        .required(),
                    accountHolder: Joi.string().trim().required(),
                    ifsc: Joi.string().trim().required(),
                })
                .allow(null),
            upi: Joi.object()
                .keys({
                    vpa: Joi.string().required(),
                    accountHolder: Joi.string().trim().required(),
                })
                .allow(null),
        }),
    }),
    c((req) => {
        const user = req.user;
        const data = req.body;
        return { user, data };
    }, paymentControllers.onboardUserAsbeneficiary),
);

/**
 * @apiName Remove beneficiary
 */

router.put(
    '/cf/remove',
    cashfreeAccessGuard,
    roleAccessGuard([C.ROLES.PM_C, C.ROLES.WRITER_C]),
    c((req) => {
        const user = req.user;
        return { user };
    }, paymentControllers.removeBeneficiary),
);

/**
 * @apiName Get onboarding status and bank/upi details
 */

router.get(
    '/cf/onboard',
    cashfreeAccessGuard,
    roleAccessGuard([C.ROLES.PM_C, C.ROLES.WRITER_C]),
    c((req) => {
        const user = req.user;
        return { user };
    }, paymentControllers.getOnboardingDetails),
);

/**
 * @apiName Verify UPI Id
 */
router.post(
    '/cf/verify-upi',
    cashfreeAccessGuard,
    roleAccessGuard([C.ROLES.PM_C, C.ROLES.WRITER_C]),
    celebrate({
        body: Joi.object().keys({
            name: Joi.string().trim().required(),
            upi: Joi.string().trim().required(),
        }),
    }),
    c((req) => {
        const user = req.user;
        const { name, upi } = req.body;
        return { user, name, upi };
    }, paymentControllers.verifyUpiId),
);

/**
 * * Stripe onboarding endpoints
 */

router.post(
    '/stripe/onboard',
    roleAccessGuard([C.ROLES.PM_C, C.ROLES.WRITER_C]),
    celebrate({
        body: Joi.object().keys({
            country: Joi.string().trim().required(),
        }),
    }),
    c((req) => {
        const creator = req.user;
        const { country } = req.body;
        return { creator, country };
    }, paymentControllers.accountOnboard),
);

router.get(
    '/stripe/onboard-user/refresh',
    roleAccessGuard([C.ROLES.PM_C, C.ROLES.WRITER_C]),
    c((req) => {
        const creator = req.user;
        return {
            creator,
        };
    }, paymentControllers.generateRefreshUrl),
);

/**
 * @apiName Razorpay onboard
 */

router.put(
    '/rp/onboard',
    roleAccessGuard([C.ROLES.PM_C, C.ROLES.WRITER_C]),
    celebrate({
        body: Joi.object().keys({
            name: Joi.string().trim().required(), //
            email: Joi.string().email().trim().required(), //
            business_name: Joi.string().trim().required(), //
            business_type: Joi.string().trim().required(), //
            ifsc_code: Joi.string().trim().required(), //
            beneficiary_name: Joi.string().trim().required(), //
            account_type: Joi.string().trim().required(),
            account_number: Joi.string().trim().required(), //
        }),
    }),
    c((req) => {
        const user = req.user;
        const data = req.body;
        return { user, data };
    }, paymentControllers.razorpayOnboard),
);

router.put(
    '/rp/disable',
    roleAccessGuard([C.ROLES.PM_C, C.ROLES.WRITER_C]),
    c((req) => {
        const user = req.user;
        return { user };
    }, paymentControllers.disableRazorpay),
);

router.get(
    '/rp/onboard',
    roleAccessGuard([C.ROLES.PM_C, C.ROLES.WRITER_C]),
    c((req) => {
        const user = req.user;
        return { user };
    }, paymentControllers.getLinkedAccountDetails),
);

// * Common for cashfree, razorpay and stripe

router.get(
    '/onboarding-state',
    roleAccessGuard([C.ROLES.PM_C, C.ROLES.WRITER_C]),
    c((req) => {
        const creator = req.user;
        return {
            creator,
        };
    }, paymentControllers.getAccountOnboardState),
);

router.post(
    '/select-pg',
    roleAccessGuard([C.ROLES.PM_C, C.ROLES.WRITER_C]),
    celebrate({
        body: Joi.object().keys({
            pg: Joi.string()
                .valid(C.PAYMENT_GATEWAY.STRP, C.PAYMENT_GATEWAY.RP)
                .required(),
        }),
    }),
    c((req) => {
        const creator = req.user;
        const { pg } = req.body;
        return { creator, pg };
    }, paymentControllers.selectPaymentGateway),
);

/**
 *  * Make Payment endpoints
 */

// Pay invoice with cashfree
router.post(
    '/cf/pay-invoice',
    cashfreeAccessGuard,
    roleAccessGuard([C.ROLES.PM_C, C.ROLES.CLIENT_C]),
    celebrate({
        body: Joi.object().keys({
            invoiceId: Joi.objectId().required(),
            customer_phone: Joi.string().min(10).max(10).required(),
        }),
    }),
    c((req) => {
        const user = req.user;
        const { invoiceId, customer_phone } = req.body;
        return { user, invoiceId, customer_phone };
    }, paymentControllers.payInvoiceCF),
);

// Get order status
router.post(
    '/cf/order-status',
    cashfreeAccessGuard,
    roleAccessGuard([C.ROLES.PM_C, C.ROLES.CLIENT_C]),
    celebrate({
        body: Joi.object().keys({
            orderId: Joi.string().required(),
            orderToken: Joi.string().required(),
        }),
    }),
    c((req) => {
        const { orderId, orderToken } = req.body;
        return { orderId, orderToken };
    }, paymentControllers.getOrderStatus),
);

// ! Stripe Pay Invoice
/* router.post(
    '/stripe/pay-invoice',
    roleAccessGuard([C.ROLES.PM_C, C.ROLES.CLIENT_C]),
    celebrate({
        body: Joi.object().keys({
            invoiceId: Joi.objectId().required(),
            clientCardCountry: Joi.string().required(),
        }),
    }),
    c((req) => {
        const { invoiceId, clientCardCountry } = req.body;
        return {
            invoiceId,
            clientCardCountry,
        };
    }, paymentControllers.payInvoiceStripe),
); */

// ! Razorpay Pay Invoice
/* router.post(
    '/rp/pay-invoice',
    roleAccessGuard([C.ROLES.PM_C, C.ROLES.CLIENT_C]),
    celebrate({
        body: Joi.object().keys({
            invoiceId: Joi.objectId().required(),
        }),
    }),
    c((req) => {
        const { invoiceId } = req.body;
        return { invoiceId };
    }, paymentControllers.payInvoiceRazorpay),
);
 */
module.exports = router;

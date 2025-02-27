/**
 * Module Dependencies
 */

const _ = require('lodash');
const { celebrate, Joi, isCelebrate } = require('celebrate');
Joi.objectId = require('joi-objectid')(Joi);
const router = require('express').Router();
const moment = require('moment');
const c = require('../helper');
const C = require('../../lib/constants');

/**
 * Controllers
 */

const invoiceController = require('../../controllers/creator/invoice');

// Regex pattern for a valid email address
const emailRegex = /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/;

// Invoice Schema

const invoiceSchema = Joi.object().keys({
    name: Joi.string().trim().max(100).required(),
    invoiceDate: Joi.date().required(),
    dueDate: Joi.date().required(),
    addInfo: Joi.string().max(1000).trim().allow('').default(''),
    invoiceTo: Joi.object().keys({
        name: Joi.string().max(100).trim().required(),
        email: Joi.string().email().trim().required(),
        country: Joi.string().max(100).trim().allow('').default(''),
        phone: Joi.string()
            .regex(/^[0-9]+$/)
            .min(1)
            .max(10)
            .allow('')
            .default(''),
        address: Joi.string().max(100).trim().allow('').default(''),
        state: Joi.string().max(100).trim().allow('').default(''),
        city: Joi.string().max(100).trim().allow('').default(''),
        pin: Joi.string().max(100).trim().allow('').default(''),
        gstin: Joi.string()
            .regex(
                /^([0-2][0-9]|[3][0-7])[A-Z]{3}[ABCFGHLJPTK][A-Z]\d{4}[A-Z][A-Z0-9][Z][A-Z0-9]$/,
            )
            .max(100)
            .trim()
            .allow('')
            .default(''),
        pan: Joi.string()
            .regex(/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/)
            .max(100)
            .trim()
            .allow('')
            .default(''),
    }),
    invoiceBy: Joi.object().keys({
        country: Joi.string().max(100).trim().allow('').default(''),
        phone: Joi.string()
            .regex(/^[0-9]+$/)
            .min(1)
            .max(10)
            .allow('')
            .default(''),
        address: Joi.string().max(100).trim().allow('').default(''),
        state: Joi.string().max(100).trim().allow('').default(''),
        city: Joi.string().max(100).trim().allow('').default(''),
        pin: Joi.string().max(100).trim().allow('').default(''),
        pan: Joi.string()
            .regex(/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/)
            .max(100)
            .trim()
            .allow('')
            .default(''),
        gstin: Joi.string()
            .regex(
                /^([0-2][0-9]|[3][0-7])[A-Z]{3}[ABCFGHLJPTK][A-Z]\d{4}[A-Z][A-Z0-9][Z][A-Z0-9]$/,
            )
            .max(100)
            .trim()
            .allow('')
            .default(''),
    }),
    currency: Joi.string()
        .valid(...Object.values(C.CURRENCY))
        .required(),
    items: Joi.array()
        .items(
            Joi.object().keys({
                name: Joi.string().trim().max(100).required(),
                description: Joi.string()
                    .trim()
                    .max(1000)
                    .allow('')
                    .default(''),
                quantity: Joi.number().required(),
                price: Joi.number().required(),

                discount: Joi.when('itemDiscountUnit', {
                    is: C.INVOICE_UNIT_TYPES.PERCENT,
                    then: Joi.number().min(0).max(100).default(0),
                    otherwise: Joi.number().min(0).default(0),
                }),
            }),
        )
        .min(1)
        .required(),
    taxUnit: Joi.string()
        .valid(...Object.values(C.INVOICE_UNIT_TYPES))
        .default(C.INVOICE_UNIT_TYPES.PERCENT),
    tax: Joi.when('taxUnit', {
        is: C.INVOICE_UNIT_TYPES.PERCENT,
        then: Joi.number().min(0).max(100).default(0),
        otherwise: Joi.number().min(0).default(0),
    }),

    discountUnit: Joi.string()
        .valid(...Object.values(C.INVOICE_UNIT_TYPES))
        .default(C.INVOICE_UNIT_TYPES.FIXED),
    discount: Joi.when('discountUnit', {
        is: C.INVOICE_UNIT_TYPES.PERCENT,
        then: Joi.number().min(0).max(100).default(0),
        otherwise: Joi.number().min(0).default(0),
    }),
    itemDiscountUnit: Joi.string()
        .valid(...Object.values(C.INVOICE_UNIT_TYPES))
        .default(C.INVOICE_UNIT_TYPES.FIXED),
    addChargeUnit: Joi.string()
        .valid(...Object.values(C.INVOICE_UNIT_TYPES))
        .default(C.INVOICE_UNIT_TYPES.FIXED),
    addCharge: Joi.when('addChargeUnit', {
        is: C.INVOICE_UNIT_TYPES.PERCENT,
        then: Joi.number().min(0).max(100).default(0),
        otherwise: Joi.number().min(0).default(0),
    }),

    paymentDetails: Joi.array()
        .items(
            Joi.object().keys({
                payDate: Joi.date().allow(null).default(null),
                amountPaid: Joi.number().default(0),
                transactionId: Joi.string().allow('').default(''),
                method: Joi.string().allow('').default(''),
                description: Joi.string().allow('').default(''),
            }),
        )
        .default([]),
    paymentGateway: Joi.string()
        .valid(...Object.values(C.PAYMENT_GATEWAY))
        .allow(null),
    // conversationId
    convoId: Joi.objectId().allow('', null).default(null),
});

const invoiceSchemaDraft = Joi.object().keys({
    name: Joi.string().trim().max(100).allow('').default(''),
    invoiceDate: Joi.date().default(new Date(moment().utc())),
    dueDate: Joi.date().default(
        new Date(moment().utc().add(1, 'd').startOf('day')),
    ),
    addInfo: Joi.string().max(1000).trim().allow('').default(''),
    invoiceTo: Joi.object()
        .keys({
            name: Joi.string().max(100).trim().allow('').default(''),
            email: Joi.string().email().trim().allow('').default(''),
            country: Joi.string().max(100).trim().allow('').default(''),
            phone: Joi.string()
                .regex(/^[0-9]+$/)
                .min(1)
                .max(10)
                .allow('')
                .default(''),
            address: Joi.string().max(100).trim().allow('').default(''),
            state: Joi.string().max(100).trim().allow('').default(''),
            city: Joi.string().max(100).trim().allow('').default(''),
            pin: Joi.string().max(100).trim().allow('').default(''),
            gstin: Joi.string()
                .regex(
                    /^([0-2][0-9]|[3][0-7])[A-Z]{3}[ABCFGHLJPTK][A-Z]\d{4}[A-Z][A-Z0-9][Z][A-Z0-9]$/,
                )
                .max(100)
                .trim()
                .allow('')
                .default(''),
            pan: Joi.string()
                .regex(/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/)
                .max(100)
                .trim()
                .allow('')
                .default(''),
        })
        .default({}),
    invoiceBy: Joi.object()
        .keys({
            country: Joi.string().max(100).trim().allow('').default(''),
            phone: Joi.string()
                .regex(/^[0-9]+$/)
                .min(1)
                .max(10)
                .allow('')
                .default(''),
            address: Joi.string().max(100).trim().allow('').default(''),
            state: Joi.string().max(100).trim().allow('').default(''),
            city: Joi.string().max(100).trim().allow('').default(''),
            pin: Joi.string().max(100).trim().allow('').default(''),
            pan: Joi.string()
                .regex(/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/)
                .max(100)
                .trim()
                .allow('')
                .default(''),
            gstin: Joi.string()
                .regex(
                    /^([0-2][0-9]|[3][0-7])[A-Z]{3}[ABCFGHLJPTK][A-Z]\d{4}[A-Z][A-Z0-9][Z][A-Z0-9]$/,
                )
                .max(100)
                .trim()
                .allow('')
                .default(''),
        })
        .default({}),
    currency: Joi.string()
        .valid(...Object.values(C.CURRENCY))
        .default(C.CURRENCY.INR),
    items: Joi.array()
        .items(
            Joi.object().keys({
                name: Joi.string().trim().max(100).allow('').default(''),
                description: Joi.string()
                    .trim()
                    .max(1000)
                    .allow('')
                    .default(''),
                quantity: Joi.number().min(0).default(0),
                price: Joi.number().min(0).default(0),

                discount: Joi.when('itemDiscountUnit', {
                    is: C.INVOICE_UNIT_TYPES.PERCENT,
                    then: Joi.number().min(0).max(100).default(0),
                    otherwise: Joi.number().min(0).default(0),
                }),
            }),
        )
        .default([]),
    taxUnit: Joi.string()
        .valid(...Object.values(C.INVOICE_UNIT_TYPES))
        .default(C.INVOICE_UNIT_TYPES.PERCENT),
    tax: Joi.when('taxUnit', {
        is: C.INVOICE_UNIT_TYPES.PERCENT,
        then: Joi.number().min(0).max(100).default(0),
        otherwise: Joi.number().min(0).default(0),
    }),

    discountUnit: Joi.string()
        .valid(...Object.values(C.INVOICE_UNIT_TYPES))
        .default(C.INVOICE_UNIT_TYPES.FIXED),
    discount: Joi.when('discountUnit', {
        is: C.INVOICE_UNIT_TYPES.PERCENT,
        then: Joi.number().min(0).max(100).default(0),
        otherwise: Joi.number().min(0).default(0),
    }),
    itemDiscountUnit: Joi.string()
        .valid(...Object.values(C.INVOICE_UNIT_TYPES))
        .default(C.INVOICE_UNIT_TYPES.FIXED),
    addChargeUnit: Joi.string()
        .valid(...Object.values(C.INVOICE_UNIT_TYPES))
        .default(C.INVOICE_UNIT_TYPES.FIXED),
    addCharge: Joi.when('addChargeUnit', {
        is: C.INVOICE_UNIT_TYPES.PERCENT,
        then: Joi.number().min(0).max(100).default(0),
        otherwise: Joi.number().min(0).default(0),
    }),

    paymentDetails: Joi.array()
        .items(
            Joi.object().keys({
                payDate: Joi.date().allow(null).default(null),
                amountPaid: Joi.number().default(0),
                transactionId: Joi.string().allow('').default(''),
                method: Joi.string().allow('').default(''),
                description: Joi.string().allow('').default(''),
            }),
        )
        .default([]),
    paymentGateway: Joi.string()
        .valid(...Object.values(C.PAYMENT_GATEWAY))
        .allow(null),
});

/**
 * @apiName Create Invoice
 * @description Creates an invoice in draft state
 */

router.post(
    '/create',
    celebrate({
        body: invoiceSchemaDraft,
    }),
    c((req) => {
        const user = req.user;
        const data = req.body;
        return { user, data };
    }, invoiceController.createInvoice),
);

/**
 * @apiName Save edited invoice
 * @description Save an edited invoice which is in draft state
 */

router.put(
    '/save/:id',
    celebrate({
        params: Joi.object().keys({
            id: Joi.objectId().required(),
        }),
        body: invoiceSchemaDraft,
    }),
    c((req) => {
        const data = req.body;
        const { id } = req.params;
        const user = req.user;
        return { id, data, user };
    }, invoiceController.saveDraftInvoice),
);

/**
 * @apiName Generate Invoice
 * @description Create Invoice OR use one in draft state and send on email. If conversation between users exists, also send as message on chat
 */

router.post(
    '/generate/:id?',
    celebrate({
        params: Joi.object().keys({
            id: Joi.objectId().allow(null),
        }),
        body: invoiceSchema,
    }),
    c((req) => {
        const { id } = req.params;
        const data = req.body;
        const user = req.user;
        return { user, id, data };
    }, invoiceController.generateInvoice),
);

/**
 * @apiName Get Invoice Clients
 */

router.post(
    '/get-invoice-clients',
    c((req) => {
        const user = req.user;
        return { user };
    }, invoiceController.fetchInvoiceClients),
);

/**
 * @apiName Fetch all Invoices with clients
 */

router.post(
    '/get-invoices',
    celebrate({
        body: Joi.object().keys({
            clientIds: Joi.array().items(Joi.objectId()).default([]),
            dateMin: Joi.date().allow(null),
            dateMax: Joi.date().allow(null),
            sortOrder: Joi.number().valid(1, -1).default(-1),
        }),
    }),
    c((req) => {
        const data = req.body;
        const user = req.user;
        return {
            user,
            data,
        };
    }, invoiceController.fetchInvoices),
);

/**
 * @apiName Search Invoice Clients
 */

router.post(
    '/search-invoice-clients',
    celebrate({
        body: Joi.object().keys({
            searchString: Joi.string().allow('').default(''),
        }),
    }),
    c((req) => {
        const user = req.user;
        const { searchString } = req.body;
        return { user, searchString };
    }, invoiceController.searchClients),
);

/**
 * @apiName Add Client
 */

router.post(
    '/add-client',
    celebrate({
        body: Joi.object().keys({
            email: Joi.string().email().trim().required(),
            name: Joi.string().max(100).trim().required(),
            phone: Joi.string()
                .regex(/^[0-9]+$/)
                .min(1)
                .max(10)
                .allow('')
                .default(''),
            address: Joi.string().max(100).trim().allow('').default(''),
            state: Joi.string().max(100).trim().allow('').default(''),
            city: Joi.string().max(100).trim().allow('').default(''),
            pin: Joi.string().max(100).trim().allow('').default(''),
            gstin: Joi.string()
                /*  .regex(
                    /^([0-2][0-9]|[3][0-7])[A-Z]{3}[ABCFGHLJPTK][A-Z]\d{4}[A-Z][A-Z0-9][Z][A-Z0-9]$/,
                ) */
                .max(100)
                .trim()
                .allow('')
                .default(''),
            pan: Joi.string()
                /*   .regex(/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/) */
                .max(100)
                .trim()
                .allow('')
                .default(''),
            country: Joi.string().max(100).trim().allow('').default(''),
        }),
    }),
    c((req) => {
        const user = req.user;
        const data = req.body;
        return {
            user,
            data,
        };
    }, invoiceController.addClient),
);

/**
 * @apiName Edit Client Details
 */

router.put(
    '/edit-details/:id',
    celebrate({
        params: Joi.object().keys({
            id: Joi.objectId().required(),
        }),
        body: Joi.object().keys({
            name: Joi.string().max(100).trim().required(),
            phone: Joi.string()
                .regex(/^[0-9]+$/)
                .min(1)
                .max(10)
                .allow('')
                .default(''),
            address: Joi.string().max(100).trim().allow('').default(''),
            state: Joi.string().max(100).trim().allow('').default(''),
            city: Joi.string().max(100).trim().allow('').default(''),
            pin: Joi.string().max(100).trim().allow('').default(''),
            gstin: Joi.string()
                .regex(
                    /^([0-2][0-9]|[3][0-7])[A-Z]{3}[ABCFGHLJPTK][A-Z]\d{4}[A-Z][A-Z0-9][Z][A-Z0-9]$/,
                )
                .max(100)
                .trim()
                .allow('')
                .default(''),
            pan: Joi.string()
                .regex(/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/)
                .max(100)
                .trim()
                .allow('')
                .default(''),
            country: Joi.string().max(100).trim().allow('').default(''),
        }),
    }),
    c((req) => {
        const user = req.user;
        const { id } = req.params;
        const data = req.body;
        return {
            user,
            id,
            data,
        };
    }, invoiceController.updateClient),
);

/**
 * @apiName Find Client
 * @description Given user find if a client exists in history with same email
 */

router.post(
    '/find-client',
    celebrate({
        body: Joi.object().keys({
            userId: Joi.objectId().required(),
        }),
    }),
    c((req) => {
        const user = req.user;
        const { userId } = req.body;
        return { user, userId };
    }, invoiceController.findClientInHistory),
);

/**
 * @apiName Invoice Operations
 * @description Duplicate, mark paid, cancel, delete invoice
 */

router.post(
    '/invoice-op/:id',
    celebrate({
        params: Joi.object().keys({
            id: Joi.objectId().required(),
        }),
        body: Joi.object().keys({
            op: Joi.string()
                .valid('duplicate', 'mark-paid', 'cancel', 'delete')
                .required(),
            data: Joi.when('op', {
                is: 'mark-paid',
                then: Joi.object()
                    .keys({
                        payDate: Joi.date().allow(null).default(null),
                        amountPaid: Joi.number().default(0),
                        transactionId: Joi.string().allow('').default(''),
                        method: Joi.string().allow('').default(''),
                        description: Joi.string().allow('').default(''),
                    })
                    .allow(null),
                otherwise: Joi.valid(null),
            }),
        }),
    }),
    c((req) => {
        const { id } = req.params;
        const { op, data } = req.body;
        const user = req.user;
        return {
            user,
            id,
            op,
            data,
        };
    }, invoiceController.performInvoiceOperations),
);

/**
 * @apiName Delete multiple invoices
 */

router.delete(
    '/invoice-op/delete',
    celebrate({
        body: Joi.object().keys({
            invoiceIds: Joi.array().items(Joi.objectId()).min(1).default([]),
        }),
    }),
    c((req) => {
        const { invoiceIds } = req.body;
        const user = req.user;
        return {
            invoiceIds,
            user,
        };
    }, invoiceController.deleteMultipleInvoices),
);

/**
 * @apiName Send Invoice Reminder
 */

router.post(
    '/send-reminder/:id',
    celebrate({
        params: Joi.object().keys({
            id: Joi.objectId().required(),
        }),
        body: Joi.object().keys({
            note: Joi.string().trim().max(300).default(''),
        }),
    }),
    c((req) => {
        const { id } = req.params;
        const { note } = req.body;
        const user = req.user;
        return {
            user,
            id,
            note,
        };
    }, invoiceController.sendInvoiceReminder),
);

/**
 * @apiName Add Payment record
 */

router.post(
    '/add-record/:id',
    celebrate({
        params: Joi.object().keys({
            id: Joi.objectId().required(),
        }),
        body: Joi.object().keys({
            payDate: Joi.date().allow(null).default(null),
            amountPaid: Joi.number().default(0),
            transactionId: Joi.string().allow('').default(''),
            method: Joi.string().allow('').default(''),
            description: Joi.string().allow('').default(''),
        }),
    }),
    c((req) => {
        const data = req.body;
        const { id } = req.params;
        const user = req.user;
        return {
            id,
            user,
            data,
        };
    }, invoiceController.addPaymentRecord),
);

/**
 * @apiName Fetch Invoice
 */

router.get(
    '/fetch-invoice/:id',
    celebrate({
        params: Joi.object().keys({
            id: Joi.objectId().required(),
        }),
    }),
    c((req) => {
        const { id } = req.params;
        const user = req.user;
        return {
            id,
            user,
        };
    }, invoiceController.fetchInvoice),
);

/**
 * @apiName Fetch Invoice Number, my previous invoice address, userDetails if userId is given
 */

router.post(
    '/fetch-invoice-number',
    celebrate({
        body: Joi.object().keys({
            userId: Joi.objectId().allow(null, ''),
        }),
    }),
    c((req) => {
        const user = req.user;
        const { userId } = req.body;
        return {
            user,
            userId,
        };
    }, invoiceController.fetchInvoiceNumber),
);

module.exports = router;

/**
 * Module dependencies
 */

const mongoose = require('mongoose');
const moment = require('moment');
const agenda = require('../../services/agenda');
const C = require('../../lib/constants');
const env = require('../../config/env');
const _ = require('lodash');

// Errors
const { BadRequest } = require('../../lib/errors');

/**
 * Models
 */

const InvoiceBill = mongoose.model(C.MODELS.INVOICE_BILL);
const InvoiceClient = mongoose.model(C.MODELS.INVOICE_CLIENT);
// const Conversation = mongoose.model(C.MODELS.CONVERSATION_CLIENT);
const Conversation = mongoose.model(C.MODELS.CONVERSATION);
const Invoice = mongoose.model(C.MODELS.INVOICE);
const User = mongoose.model(C.MODELS.USER_C);
const GroupConversation = mongoose.model(C.MODELS.GROUP_CONVERSATION);
const GroupInvoice = mongoose.model(C.MODELS.GROUP_INVOICE);

/**
 * Services
 */

const { createEmailFindRegex } = require('../../services/db/user');
const {
    updateConverstionInCache,
    updateConverstionInCacheGroup,
} = require('../../services/redis/operations');
const rtService = require('../../services/rt');
const { notification } = require('../../messaging/index');

/**
 * Common Functions
 */

async function createNewInvoice({ userId, data, draft = false }) {
    const { invoiceTo, dueDate, invoiceDate } = data;
    const isAfter = moment(invoiceDate).isSameOrAfter(dueDate);
    if (isAfter) {
        throw new BadRequest('Due Date should be greater than Invoice Date');
    }
    let email, name;
    if (invoiceTo) {
        email = invoiceTo.email;
        name = invoiceTo.name;
    }
    let findClient;
    // Email and name can be empty only on draft operations
    if (email && name && draft == false) {
        findClient = await InvoiceClient.findOne({
            uid: userId,
            e: createEmailFindRegex({
                email,
            }),
        }).exec();

        if (!findClient) {
            findClient = new InvoiceClient({
                uid: userId,
                ...invoiceTo,
            });
        }
    }

    const maxInvoiceNumber = await InvoiceBill.findMaxInvoiceNumber(userId);

    let newInvoiceData = {
        uid: userId,
        invoiceNumber: maxInvoiceNumber + 1,
        ...data,
    };

    if (findClient) newInvoiceData.invc = findClient.id;

    const newInvoice = new InvoiceBill(newInvoiceData);

    let totalAmount = 0;
    for (let item of data.items) {
        let amount = item.price * item.quantity;

        // reduce discount
        if (data.itemDiscountUnit === C.INVOICE_UNIT_TYPES.FIXED)
            amount = Math.max(0, amount - item.discount);
        else amount -= (item.discount / 100) * amount;

        // add tax to each item
        if (data.taxUnit === C.INVOICE_UNIT_TYPES.FIXED) amount += data.tax;
        else amount += (data.tax / 100) * amount;

        amount = Number(amount.toFixed(2));
        item.amount = amount;
        totalAmount += amount;
    }

    newInvoice.items = data.items;

    // reduce discount
    if (data.discountUnit === C.INVOICE_UNIT_TYPES.FIXED)
        totalAmount = Math.max(0, totalAmount - data.discount);
    else totalAmount -= (data.discount / 100) * totalAmount;

    // add additional Charge
    if (data.addChargeUnit === C.INVOICE_UNIT_TYPES.FIXED)
        totalAmount += data.addCharge;
    else totalAmount += (data.addCharge / 100) * totalAmount;

    totalAmount = Number(totalAmount.toFixed(2));

    newInvoice.tot = totalAmount;

    for (let detail of data.paymentDetails) {
        detail.amountDue = Math.max(0, totalAmount - detail.amountPaid);
        detail.amountDue = Number(detail.amountDue.toFixed(2));
    }

    newInvoice.paymentDetails = data.paymentDetails;

    return { invoice: newInvoice, client: findClient };
}

async function updateInvoice({ userId, id, data, draft = false }) {
    let findInvoice = await InvoiceBill.findOne({
        uid: userId,
        _id: id,
    }).exec();
    if (!findInvoice) throw new BadRequest('No Invoice find by this id');
    if (findInvoice.status !== C.INVOICE_STATES.DRAFT) {
        throw new BadRequest(
            'You can only update invoices which are in the draft state',
        );
    }

    const { dueDate, invoiceDate } = data;
    const isAfter = moment(invoiceDate).isSameOrAfter(dueDate);
    if (isAfter) {
        throw new BadRequest('Due Date should be greater than Invoice Date');
    }

    const {
        name,
        addInfo,
        invoiceTo,
        invoiceBy,
        currency,
        items,
        tax,
        taxUnit,
        discount,
        discountUnit,
        itemDiscountUnit,
        addCharge,
        addChargeUnit,
        paymentDetails,
        paymentGateway,
    } = data;

    findInvoice.name = name;
    findInvoice.dueDate = dueDate;
    findInvoice.invoiceDate = invoiceDate;
    findInvoice.addInfo = addInfo;
    findInvoice.invoiceTo = invoiceTo;
    findInvoice.invoiceBy = invoiceBy;
    findInvoice.currency = currency;
    findInvoice.discount = discount;
    findInvoice.addCharge = addCharge;
    findInvoice.paymentGateway = paymentGateway;

    let totalAmount = 0;

    for (let item of items) {
        let amount = item.price * item.quantity;

        // reduce discount
        if (itemDiscountUnit === C.INVOICE_UNIT_TYPES.FIXED)
            amount = Math.max(0, amount - item.discount);
        else amount -= (item.discount / 100) * amount;

        // add tax to each item
        if (taxUnit === C.INVOICE_UNIT_TYPES.FIXED) amount += tax;
        else amount += (tax / 100) * amount;

        amount = Number(amount.toFixed(2));
        item.amount = amount;
        totalAmount += amount;
    }

    findInvoice.items = items;

    // reduce discount
    if (discountUnit === C.INVOICE_UNIT_TYPES.FIXED)
        totalAmount = Math.max(0, totalAmount - discount);
    else totalAmount -= (discount / 100) * totalAmount;

    // add additional Charge
    if (addChargeUnit === C.INVOICE_UNIT_TYPES.FIXED) totalAmount += addCharge;
    else totalAmount += (addCharge / 100) * totalAmount;

    totalAmount = Number(totalAmount.toFixed(2));

    findInvoice.tot = totalAmount;

    for (let detail of paymentDetails) {
        detail.amountDue = Math.max(0, totalAmount - detail.amountPaid);
        detail.amountDue = Number(detail.amountDue.toFixed(2));
    }

    findInvoice.paymentDetails = paymentDetails;

    let findClient;
    // Email and name can be empty only on draft operations
    if (invoiceTo.email && invoiceTo.name && draft == false) {
        findClient = await InvoiceClient.findOne({
            uid: userId,
            e: createEmailFindRegex({
                email: invoiceTo.email,
            }),
        }).exec();

        if (!findClient) {
            findClient = new InvoiceClient({
                uid: userId,
                ...invoiceTo,
            });
        }
        findInvoice.invc = findClient.id;
    }

    return { invoice: findInvoice, client: findClient };
}

async function paymentGatewayChecks({
    pgToUse,
    currency,
    stripeInfo,
    razorpayInfo,
    address,
}) {
    if (typeof pgToUse !== 'string') {
        return;
    }
    // First verify if user has onboarded either on razorpay or stripe
    let stripeOnboarded = false;
    let razorpayOnboarded = false;
    // Check onboarding status on stripe
    if (stripeInfo.connectionStatus === C.STRIPE_CONNECTION_STATUS.COMPLETED) {
        stripeOnboarded = true;
    }
    // Check onboarding status on razorpay
    if (razorpayInfo.onboardStatus === C.RZPY_CONNECTION_STATUS.ONBOARDED) {
        razorpayOnboarded = true;
    }
    if (
        !(
            (pgToUse == C.PAYMENT_GATEWAY.STRP && stripeOnboarded) ||
            (pgToUse == C.PAYMENT_GATEWAY.RP && razorpayOnboarded)
        )
    ) {
        throw new Error(
            `Account details missing. Onboarding on ${pgToUse} is required to send invoice`,
        );
    }
    // For USA onboarded stripe, connect users don't allow invoices to be raised in any other except USD
    // For India onboarded razorpay users don't allow invoices to be raised in any other except INR
    if (
        pgToUse == C.PAYMENT_GATEWAY.STRP &&
        currency !== C.CURRENCY.USD &&
        address.country == C.CURRENCY_COUNTRY.USA
    ) {
        throw new Error(
            'Since you are onboarded in the USA, you can raise invoices only in USD',
        );
    }
    if (pgToUse == C.PAYMENT_GATEWAY.RP && currency !== C.CURRENCY.INR) {
        throw new Error(
            'Since you are onboarded on razorpay, you can raise invoices only in INR',
        );
    }
}

/**
 * Controllers
 */

exports.createInvoice = async ({ user, data }) => {
    let { invoice } = await createNewInvoice({
        userId: user.id,
        data,
        draft: true,
    });
    await invoice.save();
    return {
        msg: 'Invoice draft created',
        invoice: {
            invoiceNumber: invoice.invoiceNumber,
            name: invoice.name,
            invoiceDate: invoice.invoiceDate,
            dueDate: invoice.dueDate,
            invoiceTo: {
                name: invoice.invoiceTo.name,
            },
            total: invoice.total,
            status: invoice.status,
            id: invoice.id,
            amountDue: invoice.getAmountDue(),
        },
    };
};

exports.saveDraftInvoice = async ({ user, data, id }) => {
    const { invoice } = await updateInvoice({
        userId: user.id,
        data,
        id,
        draft: true,
    });
    await invoice.save();
    return {
        msg: 'Invoice updated',
        invoice: {
            invoiceNumber: invoice.invoiceNumber,
            name: invoice.name,
            invoiceDate: invoice.invoiceDate,
            dueDate: invoice.dueDate,
            invoiceTo: {
                name: invoice.invoiceTo.name,
            },
            total: invoice.total,
            status: invoice.status,
            id: invoice.id,
            amountDue: invoice.getAmountDue(),
        },
    };
};

async function pushToConversation({ convoId, userId, invoiceId, name }) {
    const group = await GroupConversation.findOne({
        _id: convoId,
    })
        .select('ty part lmsg lmd')
        .exec();

    // if (!group) return;

    // Create message
    if(group){
        let invoiceMessage = new GroupInvoice({
            convoId,
            sd: userId,
            invId: invoiceId,
        });

        group.lmd = Date.now();
        group.lmsg = invoiceMessage.id;
        let memberCount = group.part.length;

        for (let i = 0; i < memberCount; i++) {
            if (group.part[i].usr != userId) {
                group.part[i].pc += 1;
            }
        }

        await invoiceMessage.save();
        await group.save();

        // Update cache with latest data
        await updateConverstionInCacheGroup({
            conversation: group,
        });

        // Construct Message Payload
        await invoiceMessage.execPopulate({
            path: 'invId',
            select: 'userId invn invc n ind dd ito iby cur tot st pg',
        });

        invoiceMessage = invoiceMessage.toJSON();
        const sender = {
            name: { first: name, last: '' },
            company: '',
            fullname: name,
        };
        invoiceMessage.sender = sender;

        for (let participant of group.participants) {
            // Send event to users for the new message which was created
        await rtService.sendNewMessage({
                // Receivers
                receivers: [participant.user],
                // Message Data
                conversationId: group.id,
                pendingCount: participant.pendingCount,
                conversationType: C.CONVERSATION_TYPE.PROJECT,
                message: invoiceMessage,
            });
        }
        return true
    }else{
        const conversation = await Conversation.findOne({
            _id: convoId,
        })
            .select('p1 lmsg lmd u1 u2')
            .exec();

        if(!conversation) return false

        let invoiceMessage = new Invoice({
            convoId,
            sd: userId,
            invId: invoiceId,
        });

        conversation.lmd = Date.now();
        conversation.lmsg = invoiceMessage.id;
        conversation.p1 += 1;


        await invoiceMessage.save();
        await conversation.save();

        // Update cache with latest data
        await updateConverstionInCache({
            conversation,
        });


         // Construct Message Payload
        await invoiceMessage.execPopulate({
            path: 'invId',
            select: 'userId invn invc n ind dd ito iby cur tot st pg',
        });

        invoiceMessage = invoiceMessage.toJSON();
        const sender = {
            id: userId,
            name: { first: name, last: '' },
            company: '',
            fullname: name,
        };
        invoiceMessage.sender = sender;
       
        await rtService.sendNewMessage({
            // Receivers
            receivers: [conversation.u2, conversation.u1],
            // Message Data
            conversationId: conversation.id,
            pendingCount: conversation.p1,
            conversationType: C.CONVERSATION_TYPE.INBOX,
            message: invoiceMessage,
        });
        return true
    }

}

exports.generateInvoice = async ({ user, id, data }) => {
    let invoice, client;
    if (id) {
        // If id was given
        // if should be of an invoice in draft state
        // Update this invoice new data
        let result = await updateInvoice({ userId: user.id, id, data });
        invoice = result.invoice;
        client = result.client;
    } else {
        // If id was not given
        // New invoice to be created with provided data

        let result = await createNewInvoice({ userId: user.id, data });
        invoice = result.invoice;
        client = result.client;
    }

    let clientIsNew = client.isNew;

    // Save address for future
    user.invd = invoice.invoiceBy;
    await user.save();

    let amountDueOnInvoice = invoice.getAmountDue();

    // Before Sending out invoice
    // If invoice to be paid using payment Gateway check if
    // user is onboarded successfully on that payment gateway

    await paymentGatewayChecks({
        pgToUse: invoice.paymentGateway,
        currency: invoice.currency,
        stripeInfo: user.stripeInfo,
        razorpayInfo: user.razorpayInfo,
        address: user.address,
    });

    // Find user with email in invoice on the platform
    const invoiceUser = await User.findOne({
        // Manish > Change fields
        // old > e: createEmailFindRegex({ email: client.e }),
        e: client.e,
    })
        .select('id n __t')
        .exec();

        let alreadySentMessage = false
        let r = {invoiceUser: invoiceUser}

    // Now send the invoice
    // On email and/or as message

    if (!invoiceUser) {
        // Send email
    } else {
        
        if (
            // for role = Client and ExtClient
            // if conversation exists - send message, send email
            // otherwise - only send email
            // Manish > Added Writer
            [C.MODELS.CLIENT_C, C.MODELS.EXT_CLIENT, C.MODELS.WRITER_C].includes(invoiceUser.__t)
        ) {
            // Manish update user condition
            const userCondition = {
                $in: [
                    invoiceUser.id,
                    user.id
                ],
            }
        
        const conversation = await Conversation.findOne({
                u1: user.id,
                u2: invoiceUser.id,
                // st: C.CONVERSATION_STATUS.CREATED,
            }).exec();
        
        r["conversation"]=conversation;
            if (conversation) {
                // Create message
        
        let invoiceMessage = new Invoice({
                    convoId: conversation.id,
                    sd: user.id,
                    invId: invoice.id,
                });
                conversation.lmsg = invoiceMessage.id;
                // TODO: This is read-modify-write cycle
                // TODO: Make it an atomic increment operation
                conversation.p1 += 1;
                conversation.lmd = Date.now();
                await invoiceMessage.save();
                await conversation.save();

                // mark invoice as sent immediately after message creation
                if (invoice.status === C.INVOICE_STATES.DRAFT) {
                    invoice.status =
                        amountDueOnInvoice > 0
                            ? C.INVOICE_STATES.SENT
                            : C.INVOICE_STATES.PAID;
                    await invoice.save();
                    if (client) {
                        client.lid = invoice.updatedAt;
                        await client.save();
                    }
                }

                // Update cache with latest data
        
        await updateConverstionInCache({
                    conversation,
                });

                // Construct Message Payload
        
        await invoiceMessage.execPopulate({
                    path: 'invId',
                    select: 'userId invn invc n ind dd ito iby cur tot st pg',
                });
                invoiceMessage = invoiceMessage.toJSON();
                const sender = {
                    name: user.name,
                    company: '',
                    fullname: user.fullname,
                };
                invoiceMessage.sender = sender;

                // Send event to users for the new message which was created
                alreadySentMessage= true;
        
        await rtService.sendNewMessage({
                    // Receivers
                    receivers: [conversation.u1, conversation.u2],
                    // Message Data
                    conversationId: conversation.id,
                    pendingCount: conversation.p1,
                    conversationType: C.CONVERSATION_TYPE.INBOX,
                    message: invoiceMessage,
                });

                // Dispatch web notification
                const currencyHexcode =
                    invoiceMessage.invoice.currency == C.CURRENCY.USD
                        ? '$'
                        : '₹';

        
        await notification.send({
                    role: C.MODELS.CLIENT_C,
                    usecase: 'invoice_received',
                    web: {
                        for: {
                            id: conversation.u1,
                            role: C.MODELS.CLIENT_C,
                        },
                        by: {
                            id: conversation.u2,
                            role: C.MODELS.WRITER_C,
                        },
                        actions: {
                            n: 'View Invoice',
                            d: {
                                messageId: invoiceMessage.id,
                                conversationId: conversation.id,
                                fullname: sender.fullname,
                                type: C.CONVERSATION_TYPE.INBOX,
                                state: conversation.sta,
                                __t: conversation.__t,
                            },
                        },
                        createdAt: Date.now(),
                        creatorName: sender.fullname,
                        amount: `${currencyHexcode} ${invoiceMessage.invoice.total}`,
                        dueDate: invoiceMessage.invoice.dueDate.toLocaleString(
                            'en-US',
                            {
                                year: 'numeric',
                                month: 'long',
                                day: 'numeric',
                            },
                        ),
                        image: '',
                    },
                });
            }
        } else {
            // Send email
        }
    }

    // Dispatch Email
        
        await notification.send({
        role: C.MODELS.CLIENT_C,
        usecase: 'invoice_received',
        email: {
            email: client.email,
            creatorName: user.fullname,
            amount: `${invoice.total}`,
            dueDate: invoice.dueDate.toLocaleString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
            }),
            invoiceLink: `${env.FRONTEND_URL}/invoice/${invoice.id}`,
            currency: invoice.currency.toUpperCase(),
        },
    });

    if (invoice.status === C.INVOICE_STATES.DRAFT) {
        // mark invoice as sent
        invoice.status =
            amountDueOnInvoice > 0
                ? C.INVOICE_STATES.SENT
                : C.INVOICE_STATES.PAID;
        await invoice.save();
        if (client) {
            client.lid = invoice.updatedAt;
            await client.save();
        }
    }

    await invoice.save();

    // Push to conversation (convoId)

    const { convoId } = data;
    r["convoId"] = convoId
    if (convoId && !alreadySentMessage) {
        alreadySentMessage = await pushToConversation({
            convoId,
            userId: user.id,
            invoiceId: invoice.id,
            name: user.fullname,
        });
    }

    let response = {
        id: invoice.id,
        clientId: client.id,
        ...r
    };
    if (clientIsNew) {
        response = {
            ...response,
            client: {
                name: client.name,
                lastDate: client.lastDate,
                id: client.id,
            },
        };
    }

    return {
        msg: 'invoice sent',
        ...response,
    };
};

exports.fetchInvoiceClients = async ({ user }) => {
    const invoiceClients = await InvoiceClient.find({
        uid: user.id,
    })
        .select('n lid e')
        .sort({
            lid: -1,
        })
        .exec();
    return {
        invoiceClients,
    };
};

exports.fetchInvoices = async ({ user, data }) => {
    const { clientIds, dateMin, dateMax, sortOrder } = data;
    let clientDetails = { clientInfo: {}, allTotal: 0, allDue: 0 };

    let query = {
        uid: user.id,
    };
    if (dateMin && dateMax) {
        query = {
            ...query,
            ind: {
                $gte: dateMin,
                $lte: dateMax,
            },
        };
    } else if (dateMin) {
        query = {
            ...query,
            ind: {
                $gte: dateMin,
            },
        };
    } else if (dateMax) {
        query = {
            ...query,
            ind: {
                $lte: dateMax,
            },
        };
    }
    if (Array.isArray(clientIds) && clientIds.length > 0) {
        const invoiceClient = await InvoiceClient.findOne({
            _id: clientIds[0],
            uid: user.id,
        }).exec();
        clientDetails.clientInfo = invoiceClient;
        query = {
            ...query,
            invc: {
                $in: clientIds,
            },
        };
    }
    let allInvoices = await InvoiceBill.find(query)
        .select('n ind invn ito.cnn tot st dd pd')
        .sort({
            ind: sortOrder,
        })
        .exec();
    const invoices = [];
    for (let invoice of allInvoices) {
        let amountDue = invoice.getAmountDue();

        invoice = invoice.toJSON();

        invoice.amountDue = amountDue;

        clientDetails.allTotal += invoice.total;
        clientDetails.allDue += invoice.amountDue;

        delete invoice.paymentDetails;
        invoices.push(invoice);
    }
    return {
        clientDetails,
        invoices,
    };
};

exports.searchClients = async ({ user, searchString }) => {
    const invoiceClients = await InvoiceClient.find({
        uid: user.id,
        $or: [
            {
                n: { $regex: searchString, $options: '-i' },
            },
            {
                e: { $regex: searchString, $options: '-i' },
            },
        ],
    })
        .sort({
            lid: -1,
        })
        .select('-img')
        .exec();
    return {
        invoiceClients,
    };
};

exports.addClient = async ({ user, data }) => {
    const { email } = data;
    if (email.toLowerCase() == user.email.toLowerCase()) {
        throw new BadRequest('You cannot user your own email');
    }

    let invoiceClient = await InvoiceClient.findOne({
        uid: user.id,
        e: createEmailFindRegex({ email }),
    }).exec();

    if (invoiceClient) {
        throw new BadRequest('client with this email already exists');
    }

    invoiceClient = new InvoiceClient({
        uid: user.id,
        ...data,
    });
    await invoiceClient.save();

    return {
        msg: 'client created',
        invoiceClient,
    };
};

exports.updateClient = async ({ user, id, data }) => {
    const { name, phone, address, state, city, pin, gstin, pan, country } =
        data;
    const invoiceClient = await InvoiceClient.findOne({
        uid: user.id,
        _id: id,
    }).exec();
    if (!invoiceClient) throw new BadRequest('Invoice client was not found');
    invoiceClient.name = name;
    invoiceClient.phone = phone;
    invoiceClient.address = address;
    invoiceClient.state = state;
    invoiceClient.city = city;
    invoiceClient.pin = pin;
    invoiceClient.gstin = gstin;
    invoiceClient.pan = pan;
    invoiceClient.country = country;

    await invoiceClient.save();

    return {
        msg: 'Invoice Client updated',
        invoiceClient,
    };
};

exports.findClientInHistory = async ({ user, userId }) => {
    const findUser = await User.findById(userId).select('n e adr').exec();
    if (!findUser) throw new BadRequest('User not found with id');

    const email = findUser.e;

    const invoiceClient = await InvoiceClient.findOne({
        uid: user.id,
        e: createEmailFindRegex(email),
    }).exec();

    if (invoiceClient) {
        return {
            invoiceClient,
        };
    }

    return {
        name: findUser.fullname,
        // ?? Should we send user email of an on-platform client
        email: findUser.email,
        country: findUser.adr.co,
        city: findUser.adr.ci,
        id: findUser.id,
    };
};

exports.performInvoiceOperations = async ({ user, id, op, data }) => {
    const invoice = await InvoiceBill.findOne({
        uid: user.id,
        _id: id,
    }).exec();
    if (!invoice)
        throw new BadRequest('No Invoice found by this id for this user');

    if (op === 'duplicate') {
        let invoiceDateAsJson = invoice.toJSON();
        // Delete fields which should be changed
        delete invoiceDateAsJson.invoiceNumber;
        delete invoiceDateAsJson.status;
        delete invoiceDateAsJson.paymentIntent;
        delete invoiceDateAsJson.razorpay;
        delete invoiceDateAsJson.paymentDetails;
        delete invoiceDateAsJson.id;
        delete invoiceDateAsJson.createdAt;
        delete invoiceDateAsJson.deletedAt;

        let newInvoice = new InvoiceBill(invoiceDateAsJson);
        await newInvoice.save();
        return {
            msg: 'Duplicate invoice created in draft state',
            newInvoice,
        };
    } else if (op === 'mark-paid') {
        if (invoice.status === C.INVOICE_STATES.PENDING)
            throw new BadRequest(
                'A payment using payment gateway is in processing state, please wait',
            );

        if (
            invoice.status !== C.INVOICE_STATES.SENT &&
            invoice.status !== C.INVOICE_STATES.DRAFT
        )
            throw new BadRequest('Cannot mark this invoice as paid');

        if (data) {
            let amountPaid = 0;
            for (let detail of invoice.paymentDetails) {
                amountPaid += detail.amountPaid;
            }

            amountPaid += data.amountPaid;

            let amountDue = Math.max(0, invoice.total - amountPaid);
            amountDue = Number(amountDue.toFixed(2));

            data.amountDue = amountDue;

            invoice.pd.push(data);
        }

        invoice.status = C.INVOICE_STATES.PAID;
        await invoice.save();

        return {
            msg: 'Invoice was marked as paid',
            id: invoice.id,
        };
    } else if (op === 'cancel') {
        if (invoice.status === C.INVOICE_STATES.PENDING)
            throw new BadRequest(
                'A payment using payment gateway is in processing state, please wait',
            );

        if (
            invoice.status !== C.INVOICE_STATES.SENT &&
            invoice.status !== C.INVOICE_STATES.CANCELLED
        )
            throw new BadRequest('Cannot mark this invoice as cancelled');

        invoice.status = C.INVOICE_STATES.CANCELLED;
        // Send amount payable to 0 on cancelled invoice
        invoice.total = 0;

        await invoice.save();

        return {
            msg: 'Invoice was cancelled',
            id: invoice.id,
        };
    } else if (op === 'delete') {
        if (invoice.status !== C.INVOICE_STATES.DRAFT)
            throw new BadRequest('Only invoice in draft state can be deleted');

        const res = await InvoiceBill.remove({
            _id: invoice.id,
        });

        if (res.deletedCount !== 1)
            throw new BadRequest('Unable to delete invoice');

        return {
            msg: 'Invoice was deleted successfully',
            id: invoice.id,
        };
    } else throw new BadRequest('Unknown invoice operation');
};

exports.deleteMultipleInvoices = async ({ invoiceIds, user }) => {
    const invoices = await InvoiceBill.find({
        uid: user.id,
        _id: {
            $in: invoiceIds,
        },
        st: C.INVOICE_STATES.DRAFT,
    }).exec();

    if (invoices.length !== invoiceIds.length)
        throw new BadRequest(
            'One or more invoices not found or cant be deleted',
        );
    await InvoiceBill.deleteMany({
        uid: user.id,
        _id: {
            $in: invoiceIds,
        },
        st: C.INVOICE_STATES.DRAFT,
    }).exec();
    return {
        msg: `${invoiceIds.length} invoice(s) were deleted`,
    };
};

exports.sendInvoiceReminder = async ({ user, id, note }) => {
    const invoice = await InvoiceBill.findOne({
        uid: user.id,
        _id: id,
    })
        .select('n invc tot dd cur st')
        .populate({
            path: 'invc',
            select: 'n e',
        })
        .exec();
    if (!invoice)
        throw new BadRequest('No Invoice found by this id for this user');

    if (invoice.status === C.INVOICE_STATES.DRAFT) {
        throw new BadRequest(
            'Invoice is in draft state. First send/generate invoice to send reminder to client',
        );
    }

    if (invoice.status === C.INVOICE_STATES.PAID) {
        throw new BadRequest('Invoice was already paid');
    }

    if (invoice.status === C.INVOICE_STATES.CANCELLED) {
        throw new BadRequest('This Invoice was cancelled');
    }

    // Create Email notification payload
    const emailData = {
        email: invoice.invoiceClient.email,
        clientName: invoice.invoiceClient.name,
        creatorName: user.fullname,
        amount: `${invoice.total}`,
        dueDate: invoice.dueDate.toLocaleString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
        }),
        invoiceLink: `${env.FRONTEND_URL}/invoice/${invoice.id}`,
        invoiceName: invoice.name,
        currency: invoice.currency.toUpperCase(),
        note,
        keyword: note.length > 0 ? 'message' : 'reminder',
    };

    let notificationData = {
        role: C.MODELS.CLIENT_C,
        usecase: 'invoice_reminder',
        email: emailData,
    };

    // If user is in conversation with this creator on-platform
    // send web notification

    // First check if an on-platform client with same email exists on-platform

    const invoiceUser = await User.findOne({
        e: createEmailFindRegex({ email: invoice.invoiceClient.email }),
        __t: C.MODELS.CLIENT_C,
    }).exec();

    if (invoiceUser) {
        // User found
        // Now check if conversation exists between creator and client
        const conversation = await Conversation.findOne({
            u1: invoiceUser.id,
            u2: user.id,
            __t: C.MODELS.CONVERSATION_CLIENT,
            st: C.CONVERSATION_STATUS.CREATED,
        }).exec();
        if (conversation) {
            // If conversation exists
            // Create web notification
            notificationData = {
                ...notificationData,
                web: {
                    for: {
                        id: invoiceUser.id,
                        role: C.MODELS.CLIENT_C,
                    },
                    by: {
                        id: user.id,
                        role: C.MODELS.WRITER_C,
                    },
                    actions: {
                        n: 'Open Invoice',
                        d: {
                            invoiceId: invoice.id,
                        },
                    },
                    keyword: note.length > 0 ? 'message' : 'reminder',
                    creatorName: user.fullname,
                    invoiceName: invoice.name,
                    message: note,
                    image: '',
                },
            };
        }
    }

    // Send notification
    await notification.send(notificationData);

    return {
        msg: 'Invoice reminder was sent',
    };
};

exports.addPaymentRecord = async ({ id, user, data }) => {
    const invoice = await InvoiceBill.findOne({
        uid: user.id,
        _id: id,
    })
        .select('pd tot')
        .exec();

    if (invoice.status === C.INVOICE_STATES.PENDING)
        throw new BadRequest(
            'A payment using payment gateway is in processing state, please wait',
        );

    let amountPaid = 0;
    for (let detail of invoice.paymentDetails) {
        amountPaid += detail.amountPaid;
    }

    amountPaid += data.amountPaid;

    let amountDue = Math.max(0, invoice.total - amountPaid);
    amountDue = Number(amountDue.toFixed(2));

    data.amountDue = amountDue;

    invoice.pd.push(data);

    // If no amount is due, mark invoice as paid
    if (amountDue <= 0 && invoice.status == C.INVOICE_STATES.SENT)
        invoice.status = C.INVOICE_STATES.PAID;

    await invoice.save();

    return {
        msg: 'Payment record added',
        id: invoice.id,
        record: data,
    };
};

exports.fetchInvoice = async ({ user, id }) => {
    let invoice = await InvoiceBill.findOne({
        _id: id,
        uid: user.id,
    }).exec();

    if (!invoice) throw new BadRequest('Invoice not found');

    let amountDue = invoice.getAmountDue();

    invoice = invoice.toJSON();
    invoice.amountDue = amountDue;
    invoice.invoiceBy.fullname = user.fullname;

    return {
        invoice,
    };
};

exports.fetchInvoiceNumber = async ({ user, userId }) => {
    const invoiceNumber = await InvoiceBill.findMaxInvoiceNumber(user.id);

    let response = {
        invoiceNumber: invoiceNumber + 1,
        invoiceAddress: user.invoiceAddress,
    };

    if (userId) {
        const findUser = await User.findById(userId).select('n e adr').exec();
        if (!findUser) throw new BadRequest('User not found with this id');

        const email = findUser.e;

        const invoiceClient = await InvoiceClient.findOne({
            uid: user.id,
            e: createEmailFindRegex(email),
        }).exec();

        if (invoiceClient) {
            response = {
                ...response,
                userDetails: {
                    ...invoiceClient,
                },
            };
        } else {
            response = {
                ...response,
                userDetails: {
                    name: findUser.fullname,
                    // ?? Should we send user email of an on-platform client
                    email: findUser.email,
                    country: findUser.adr.co,
                    city: findUser.adr.ci,
                    id: findUser.id,
                },
            };
        }
    }
    return {
        ...response,
    };
};

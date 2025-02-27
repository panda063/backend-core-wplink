/**
 * Dependencies
 */
const mongoose = require('mongoose');
const _ = require('lodash');
const C = require('../../lib/constants');
const env = require('../../config/env');
// Bucket Name and Url
const { S3_BUCKET_WEBSITE_URL } = require('../../config/env');

// Other Controllers
const { updateStateAndPersist } = require('../fileStore');

const { BadRequest, InternalServerError } = require('../../lib/errors');

const Template = mongoose.model(C.MODELS.TEMPLATE);
const Form = mongoose.model(C.MODELS.FORM);
const Message = mongoose.model(C.MODELS.MESSAGE);
const Invoice = mongoose.model(C.MODELS.INVOICE);

/**
 * @param creator creator object
 * @param budgetData new budget data fields
 */
exports.setBudget = async ({ creator, budgetData }) => {
    const { minBudget, maxBudget, perHourCharge } = budgetData;
    if (minBudget > maxBudget)
        throw new BadRequest('Max budget should be greator than minBudget');
    creator.minBudget = minBudget;
    creator.maxBudget = maxBudget;
    creator.perHourCharge = perHourCharge;
    await creator.save();
    return {
        msg: 'budget updated',
    };
};
exports.getBudget = async ({ creator }) => {
    const minBudget = creator.minBudget;
    const maxBudget = creator.maxBudget;
    const perHourCharge = creator.perHourCharge;
    return {
        minBudget,
        maxBudget,
        perHourCharge,
    };
};
exports.getPaymentAnalytics = async ({ creator }) => {
    const query = {
        sd: creator._id,
    };
    const aggregatePipeline = [
        { $match: query },
        {
            // Group invoices by status [sent, pending, paid, payment_failed]
            $group: { _id: '$st', invoices: { $push: '$$ROOT' } },
        },
        {
            // Add new field for sum of each group
            $addFields: {
                totalSum: { $sum: '$invoices.tot' },
            },
        },
    ];
    const sumPerState = await Invoice.aggregate(aggregatePipeline);
    let invoiceRaised = 0;
    let invoicePaid = 0;
    let pending = 0;
    _.map(sumPerState, (state) => {
        if (state._id == C.INVOICE_STATES.PAID) {
            invoicePaid += state.totalSum;
        }
        invoiceRaised += state.totalSum;
    });
    pending = invoiceRaised - invoicePaid;
    return {
        invoiceRaised,
        invoicePaid,
        pending,
    };
};
/**
 *
 * @param creator creator document object
 * @param itemData all item fields
 */
exports.createTemplateItem = async ({ creator, itemData }) => {
    itemData = {
        ...itemData,
        cid: creator.id,
    };
    const newItem = await Template.create(itemData);
    return { id: newItem.id };
};

/**
 *
 * @param creator creator document object
 * @param itemData all item fields
 * @param itemId objectId of item to remove
 */
exports.updateTemplateItem = async ({ creator, itemId, itemData }) => {
    const updatedItem = await Template.findOneAndUpdate(
        { _id: itemId, cid: creator._id },
        {
            $set: {
                nm: itemData.name,
                desc: itemData.description,
                prc: itemData.price,
                cat: itemData.category,
            },
        },
    ).exec();
    if (!updatedItem) throw new BadRequest('Invalid template id', 'CRCH100');
    return {
        id: updatedItem.id,
    };
};

/**
 *
 * @param newProposal proposal document
 * @param proposalData proposal fields
 */
exports.createUpdateTemplateProposal = async ({
    creator,
    newProposal,
    proposalData,
    files,
}) => {
    newProposal.name = proposalData.name;
    newProposal.description = proposalData.description;
    newProposal.category = proposalData.category;
    newProposal.price = proposalData.price;
    newProposal.currency = proposalData.currency;
    newProposal.payoutCondition = proposalData.payoutCondition;
    if (Array.isArray(proposalData.items)) {
        newProposal.items = proposalData.items;
    } else {
        newProposal.items = [];
    }
    // If no file was uploaded keep same cover image as before. Ensure that current cover url is sent in request
    // If a image was uploaded always use the uploaded image url for cover
    if (!(Array.isArray(files) && files.length > 0) && !proposalData.fileId) {
        newProposal.cover = proposalData.cover;
    }
    // If file Id is given then maybe cover is uploaded using new file upload flow
    if (proposalData.fileId) {
        const fileIds = [proposalData.fileId];
        // Create Image sub documents
        // Update state of files in db and move objects from 'mayfly' to 'tortoise' directory
        const fileKeys = await updateStateAndPersist({
            fileIds,
            allowedTypes: ['image'],
        });
        _.forEach(fileKeys, (file) => {
            const originalPath = `${env.S3_BUCKET_WEBSITE_URL}/${file.key}`;
            newProposal.cover = `${originalPath}`;
        });
    }
    await newProposal.save();
    return {
        id: newProposal.id,
    };
};

/**
 * @param creator writer/pm
 * @form Form data
 * @id Required when operation is an update
 */

exports.createUpdateFormTemplate = async ({ creator, form, id }) => {
    let theForm;
    if (id) {
        theForm = await Form.findOne({
            cid: creator.id,
            _id: id,
        }).exec();
        if (!theForm) throw new BadRequest('Form template not found');
    } else {
        theForm = new Form({ cid: creator._id });
    }
    theForm.nm = form.name;
    theForm.desc = form.description;
    const allFields = [];
    for (let field of form.fields) {
        let fieldObject = {
            req: field.required,
            ty: field.type,
            ques: field.question,
        };
        if (field.type !== C.FORM_TYPES.TEXT) {
            fieldObject.hoth = field.other;
            fieldObject.opt = [];
            for (let option of field.options) {
                fieldObject.opt.push({
                    op: option,
                });
            }
        }

        allFields.push(fieldObject);
    }
    theForm.flds = allFields;
    await theForm.save();
    return {
        msg: 'Form templated created/updated',
        id: theForm.id,
    };
};

/**
 *
 * @param creator creator document object
 * @param itemIds array of objectIds of templates to remove
 */
exports.deleteMultipleTemplates = async ({ creator, itemIds }) => {
    const deletedTemplates = await Template.deleteMany({
        cid: creator._id,
        _id: { $in: itemIds },
    }).exec();
    /**
     * * Cover images are not deleted because maybe they are being used in proposal messages
     */
    return {
        msg: 'template(s) deleted',
    };
};
/**
 *
 * @param creator creator document
 * @param templateType [item, proposal]
 */
exports.getAllTemplates = async ({ creator, templateType }) => {
    let query = {
        cid: creator._id,
    };
    let project = null;
    if (templateType == 'proposal')
        query = { ...query, __t: C.MODELS.PROPOSAL };
    else if (templateType == 'form') {
        project = '-prc -cur -cat';
        query = { ...query, __t: C.MODELS.FORM };
    } else {
        query = { ...query, __t: { $exists: false } };
    }
    const templates = await Template.find(query, project).exec();
    return { templates };
};
/**
 *
 * @param creator creator document
 * @param id template id
 */
exports.getSpecificTemplate = async ({ creator, id }) => {
    let template = await Template.findOne({
        cid: creator._id,
        _id: id,
    }).exec();
    if (!template) throw new BadRequest('Template Not Found', 'CRCH102');
    template = template.toJSON();
    if (template.__t && template.__t == C.MODELS.FORM) {
        delete template.price;
        delete template.currency;
        delete template.category;
    }
    return {
        template,
    };
};

/**
 * Chat messaging controllers
 */
exports.fetchSpecificInvite = async ({ creator, id }) => {
    let findInvite = await Message.findById(id).populate('convoId').exec();
    if (!findInvite) throw new BadRequest('Invite not Found');
    if (findInvite.convoId.user2 != creator.id)
        throw new BadRequest('Not part of conversation');
    const message = findInvite.toJSON();
    message.messageType = findInvite.__t;
    delete message.conversationId;
    return {
        message,
    };
};

exports.sendProposalCoverUpload = async ({ files, proposal }) => {
    let url = '';
    if (Array.isArray(files) && files.length > 0) {
        url = `${S3_BUCKET_WEBSITE_URL}/${files[0].key}`;
    }
    await proposal.save();
    return {
        url,
    };
};

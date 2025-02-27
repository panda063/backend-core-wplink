/*
 * Module Dependencies
 */
const mongoose = require('mongoose');
const _ = require('lodash');
const moment = require('moment');
const agenda = require('../../services/agenda');
const C = require('../../lib/constants');
const env = require('../../config/env');
const sanitizeHtml = require('sanitize-html');
const debug = require('debug')('creator');
debug.enabled = true;

// Project Models
const Cards = mongoose.model(C.MODELS.CARDS);
const Project = mongoose.model(C.MODELS.PROJECT);
const LongForm = mongoose.model(C.MODELS.LONG_FORM);
const Writer = mongoose.model(C.MODELS.WRITER_C);
const Client = mongoose.model(C.MODELS.CLIENT_C);
const Application = mongoose.model(C.MODELS.JOB_BOARD_APPLICATION_C);
/**
 * Utility functions
 */
const {
    emptyS3Directory,
    deleteMultiple,
    getObject,
} = require('../../utils/s3-operations');
const jwt = require('../../lib/jwt');
const { createEmailFindRegex } = require('../../services/db/user');
/**
 * External service dependencies
 */
const { scrapeArticle } = require('../../services/import-article');
const { getDataFromPublicDoc } = require('../../services/google-doc');
const { notification } = require('../../messaging/index');
const { BadRequest } = require('../../lib/errors');

/*
 * Helpers
 */
const {
    generatePublicUrl,
    verifyCollaboraters,
    createEmptyFile,
    updateFile,
} = require('../helpers/writerHelper');

// Other Controllers
const {
    updateStateAndPersist,
    deleteSingleFileVersions,
    deleteFilesByKey,
} = require('../fileStore');

/**
 * * Portfolio Project controllers
 */
/**
 *
 * Short Form
 */
exports.addShortFormCard = async ({ creator, cardData }) => {
    // Check if colloborates array has valid id's
    await verifyCollaboraters(creator, cardData.collaboraters);
    let projectData = {
        creatorId: creator._id,
        cardType: C.CARD_TYPES.SHORT_FORM,
        ...cardData,
    };
    const newProject = new Cards(projectData);
    newProject.public_url = await generatePublicUrl(newProject.title);
    newProject.cun = creator.pn;
    // For PM projects
    if (creator.__t == C.ROLES.PM_C) {
        newProject.cun = creator.stid;
        newProject.crrl = C.ROLES.PM_C;
    }
    await newProject.save();
    // Asynchronus agenda to send email
    // To studios that creator posted new content piece
    if (creator.__t == C.MODELS.WRITER_C) {
        agenda.now('new_content_studios', {
            creator: {
                id: creator.id,
                creatorName: creator.name.first,
            },
            projectId: newProject.id,
        });
    }
    return {
        msg: 'Short Form Project Created Successfully',
        id: newProject.id,
        public_url: newProject.pul,
    };
};

exports.updateShortFormCard = async ({ creator, cardData, sid }) => {
    // Check if colloborates array has valid id's
    await verifyCollaboraters(creator, cardData.collaboraters);
    const findProject = await Cards.findOneAndUpdate(
        { _id: sid, cid: creator._id, del: false },
        {
            $set: {
                t: cardData.title,
                desc: cardData.description,
                // ptg: cardData.primaryTag,
                ctg: cardData.category,
                tn: cardData.tone,
                iny: cardData.industry,
                // ?? Q. what happens when null? Ans: It is set to null
                atg: cardData.additionalTags,
                clb: cardData.collaboraters,
                tc: cardData.txtCards,
            },
        },
    ).exec();
    if (!findProject) throw new BadRequest('Project Not found', 'CRPL105');
    if (findProject.t != cardData.title) {
        findProject.pul = await generatePublicUrl(cardData.title);
    }
    await findProject.save();
    return {
        msg: 'Short Form Project Updated Successfully',
        cardData,
        id: findProject.id,
        public_url: findProject.pul,
    };
};

/**
 * Design
 */
exports.addDesignProject = async ({ creator, cardData }) => {
    const {
        title,
        description,
        category,
        style,
        industry,
        additionalTags,
        collaboraters,
        fileIds,
    } = cardData;
    // Verify valid collaboaters are present
    await verifyCollaboraters(creator, collaboraters);
    // Generate a unique id for the public url from title
    const publicUrl = await generatePublicUrl(title);
    const newProject = new Cards({
        cty: C.CARD_TYPES.DESIGN,
        t: title,
        desc: description,
        ctg: category,
        sty: style,
        iny: industry,
        atg: additionalTags,
        clb: collaboraters,
        cid: creator._id,
        pul: publicUrl,
        // ! if changing penname feature is allowed for creator/PM, this will become a problem
        cun: creator.pn,
    });
    // For PM projects
    if (creator.__t == C.ROLES.PM_C) {
        // ! if changing penname feature is allowed for creator/PM, this will become a problem
        newProject.cun = creator.stid;
        newProject.crrl = C.ROLES.PM_C;
    }
    // Create Image sub documents
    // Update state of files in db and move objects from 'mayfly' to 'tortoise' directory
    const fileKeys = await updateStateAndPersist({
        fileIds,
        allowedTypes: ['image'],
    });
    _.forEach(fileKeys, (file) => {
        const originalPath = `${env.S3_BUCKET_WEBSITE_URL}/${file.key}`;
        newProject.img.push({
            fty: 'webp',
            iurl: `${originalPath}-webp.webp`,
            tbn: `${originalPath}-thumb.webp`,
            og: originalPath,
        });
    });
    await newProject.save();
    // Asynchronus agenda to send email
    // To studios that creator posted new content piece
    if (creator.__t == C.MODELS.WRITER_C) {
        agenda.now('new_content_studios', {
            creator: {
                id: creator.id,
                creatorName: creator.name.first,
            },
            projectId: newProject.id,
        });
    }
    return {
        msg: 'design project saved',
        id: newProject.id,
        images: newProject.img,
        public_url: newProject.pul,
    };
};

exports.updateDesignProject = async ({ creator, cardData, pid }) => {
    const project = await Cards.findOne({
        _id: pid,
        cty: C.CARD_TYPES.DESIGN,
        cid: creator.id,
    }).exec();
    if (!project) throw new BadRequest('Project not found');
    const {
        title,
        description,
        category,
        style,
        industry,
        additionalTags,
        collaboraters,
        fileIds,
    } = cardData;
    if (C.DESIGN_MAX_CARDS - project.img.length < fileIds.length) {
        throw new BadRequest(
            `Only ${C.DESIGN_MAX_CARDS} Images can be added to design`,
        );
    }
    // Verify valid collaboaters are present
    await verifyCollaboraters(creator, collaboraters);
    // If title changes generate new public url
    if (project.t != title) {
        project.t = title;
        project.pul = await generatePublicUrl(title);
    }
    project.desc = description;
    project.ctg = category;
    project.sty = style;
    project.iny = industry;
    project.atg = additionalTags;
    project.clb = collaboraters;
    // Create Image sub documents
    // Update state of files in db and move objects from 'mayfly' to 'tortoise' directory
    const fileKeys = await updateStateAndPersist({
        fileIds,
        allowedTypes: ['image'],
    });
    _.forEach(fileKeys, (file) => {
        const originalPath = `${env.S3_BUCKET_WEBSITE_URL}/${file.key}`;
        project.img.push({
            fty: 'webp',
            iurl: `${originalPath}-webp.webp`,
            tbn: `${originalPath}-thumb.webp`,
            og: originalPath,
        });
    });
    await project.save();
    return {
        msg: 'design project updated',
        id: project.id,
        images: project.img,
        public_url: project.pul,
    };
};

/**
 * Long Form
 */
// Long Form is initialized so as to allow adding images to a unsaved document
exports.initializeLongForm = async ({ creator }) => {
    // KEEP at most one Long Form in database with state INIT
    let newLongForm = await LongForm.findOne({
        cid: creator._id,
        lst: C.LONG_FORM_STATES.INIT,
    }).exec();
    if (newLongForm) {
        // remove images from s3 and db so to return a clean document
        await emptyS3Directory(
            env.S3_BUCKET_USER_DATA,
            `${creator.id}/LongForm/${newLongForm.id}/`,
        );
        newLongForm.img = [];
    } else {
        newLongForm = new LongForm({ t: 'untitled', cid: creator._id });
        newLongForm.pul = await generatePublicUrl('untitled');
    }
    // Create File
    const fileUrl = await createEmptyFile({
        creatorId: creator.id,
        projectId: newLongForm.id,
    });
    newLongForm.ful = fileUrl;
    newLongForm.cun = creator.pn;
    // For PM projects
    if (creator.__t == C.ROLES.PM_C) {
        newLongForm.cun = creator.stid;
        newLongForm.crrl = C.ROLES.PM_C;
    }
    await newLongForm.save();
    return {
        id: newLongForm.id,
        public_url: newLongForm.pul,
        image: '',
        state: C.LONG_FORM_STATES.INIT,
    };
};

// Update content of file
exports.saveLongForm = async ({ pid, creator, data }) => {
    const {
        content,
        previewText,
        publish,
        title,
        description,
        category,
        tone,
        coverImg,
        industry,
        additionalTags,
        collaboraters,
    } = data;
    await verifyCollaboraters(creator, collaboraters);
    const findProject = await LongForm.findOne({
        _id: pid,
        cid: creator._id,
        del: false,
    }).exec();
    if (!findProject) throw new BadRequest('Project Not found', 'CRPL105');
    const isNew = findProject.lst == C.LONG_FORM_STATES.INIT;
    findProject.pblc = publish;
    if (findProject.t !== title) {
        findProject.t = title;
        findProject.pul = await generatePublicUrl(title);
    }
    if (typeof description == 'string') findProject.desc = description;
    // findProject.ptg = primaryTag;
    findProject.ctg = category;
    findProject.tn = tone;
    findProject.iny = industry;
    findProject.ptxt = previewText;
    findProject.cvi = coverImg;
    findProject.atg = additionalTags;
    await verifyCollaboraters(creator, collaboraters);
    findProject.clb = collaboraters;
    // update state, significant for INIT projects
    findProject.lst = C.LONG_FORM_STATES.SAVED;
    await findProject.save();
    // Sanitize Html
    const sanitizedContent = sanitizeHtml(content, {
        allowedTags: false,
        allowedAttributes: false,
    });
    // Save content to file
    await updateFile({
        creatorId: creator.id,
        projectId: pid,
        content: sanitizedContent,
    });
    // Asynchronus agenda to send email
    // To studios that creator posted new content piece
    if (creator.__t == C.MODELS.WRITER_C && isNew) {
        agenda.now('new_content_studios', {
            creator: {
                id: creator.id,
                creatorName: creator.name.first,
            },
            projectId: findProject.id,
        });
    }
    return {
        msg: 'saved',
        id: findProject.id,
        public_url: findProject.pul,
        image: coverImg,
        state: C.LONG_FORM_STATES.SAVED,
    };
};

exports.addImageToLongForm = async ({ creator, fileIds, pid }) => {
    const project = await LongForm.findOne({
        _id: pid,
        cid: creator.id,
    }).exec();
    if (!project) throw new BadRequest('Project not found');
    // Create Image sub documents
    // Update state of files in db and move objects from 'mayfly' to 'tortoise' directory
    const fileKeys = await updateStateAndPersist({
        fileIds,
        allowedTypes: ['image'],
    });
    const imageUrls = [];
    _.forEach(fileKeys, (file) => {
        const originalPath = `${env.S3_BUCKET_WEBSITE_URL}/${file.key}`;
        project.img.push({
            fty: 'webp',
            iurl: `${originalPath}-webp.webp`,
            tbn: `${originalPath}-thumb.webp`,
            og: originalPath,
        });

        imageUrls.push(`${originalPath}-webp.webp`);
    });
    await project.save();
    return {
        msg: 'Image(s) Added',
        imageUrls,
        id: project.id,
        public_url: project.pul,
    };
};

function checkIfDocUrl(url) {
    const prefix = ['https://', 'http://'];
    for (let pref of prefix) {
        let newUrl = url.replace(pref, '');
        if (newUrl.indexOf('docs.google.com') === 0) {
            return true;
        }
    }
    return false;
}

exports.importArticle = async ({ creator, targetUrl }) => {
    let data = [];
    if (checkIfDocUrl(targetUrl)) {
        const docId = targetUrl.match(/[-\w]{25,}/);
        try {
            data = await getDataFromPublicDoc({ docId });
        } catch (err) {
            console.log(err.errors);
            let errorReason =
                'Error reading Google Doc. Check if the doc has public viewing access';
            if (
                Array.isArray(err.errors) &&
                err.errors.length > 0 &&
                err.errors[0].reason &&
                err.errors[0].reason === 'failedPrecondition'
            ) {
                errorReason =
                    "Could not import this document. Please check the format and make sure it's in the corresponding Docs Editors format. Go to file -> Save as google docs";
            }
            throw new BadRequest(errorReason);
        }
    } else {
        data = await scrapeArticle({ targetUrl });
    }
    return { data };
};

// Get File Data of Long Form
exports.getFileData = async ({ creator, pid }) => {
    let project = await LongForm.findOne({
        _id: pid,
        cid: creator._id,
        del: false,
    }).exec();
    if (!project) throw new BadRequest('Project Not found', 'CRPL105');
    // Remove part to create prefix
    const prefixS3 = project.ful.replace(env.S3_BUCKET_USER_DATA_URL + '/', '');
    const content = await getObject(env.S3_BUCKET_USER_DATA, prefixS3);
    project = project.toJSON();
    delete project.fileUrl;
    delete project.images;
    // TODO: FIle content response can be stream. This will save memory
    return { content, project };
};

/**
 *
 * Project Common Controllers
 */

// Remove Images from project and storage
exports.removeImagesFromProject = async ({ creator, pid, imageIds, ptype }) => {
    const project = await Project.findOne({
        _id: pid,
        cid: creator._id,
        __t: ptype,
        del: false,
    }).exec();
    if (!project) throw new BadRequest('Project Not Found', 'CRPL105');
    // objects to remove
    let files = [];
    await Promise.all(
        _.map(imageIds, async (img) => {
            const doc = project.img.id(img);
            if (doc) {
                // original
                const originalKey = doc.og.replace(
                    env.S3_BUCKET_WEBSITE_URL + '/',
                    '',
                );
                // This condition is checked for backwards compatibility
                // Older images had path: creatorId/projectType/projectId/ImageId
                if (originalKey.split('/').length == 2) {
                    files.push(originalKey);
                    // Remove all versions of image
                    const versions = Object.values(C.PORTFOLIO_IMAGE_VERSIONS);
                    for (let vr of versions) {
                        files.push(`${originalKey}-${vr}.webp`);
                    }
                }
                // remove from collection
                await doc.remove();
            }
        }),
    );
    await project.save();
    if (files.length > 0) {
        // Remove from s3 (tortoise); delete documents
        await deleteMultiple(env.S3_BUCKET_USER_DATA, files);
        await deleteFilesByKey({ keys: files });
    }

    return { msg: 'images removed from project' };
};

exports.getSpecificProject = async ({ creator, pid }) => {
    let project = await Project.findOne({
        _id: pid,
        cid: creator._id,
        del: false,
    })
        .select('-ful')
        .populate('cid', 'cid n pn stid img')
        .exec();
    if (!project) throw new BadRequest('Project Not found', 'CRPL105');
    project = project.toJSON();
    project.creator = project.creatorId;
    delete project.creatorId;
    return { project };
};

exports.removeProject = async ({ creator, pid }) => {
    // Mark project as delete and remove files store in s3 for project and remove urls from db
    const removedDoc = await Project.findOne({
        _id: pid,
        cid: creator._id,
        del: false,
    }).exec();
    if (!removedDoc) throw new BadRequest('Project Not Found', 'CRPL105');
    removedDoc.del = true;
    // Delete images and long form file objects
    if (
        removedDoc.__t == C.MODELS.LONG_FORM ||
        (removedDoc.__t == C.MODELS.CARDS &&
            removedDoc.cty == C.CARD_TYPES.DESIGN)
    ) {
        // get image object keys to remove from s3
        let files = [];
        await Promise.all(
            _.map(removedDoc.img, async (doc) => {
                // original
                const originalKey = doc.og.replace(
                    env.S3_BUCKET_WEBSITE_URL + '/',
                    '',
                );
                // This is done for backwards compatibility
                // Older images had path: creatorId/projectType/projectId/ImageId
                if (originalKey.split('/').length == 2) {
                    files.push(originalKey);
                    // Remove all versions of image
                    const versions = Object.values(C.PORTFOLIO_IMAGE_VERSIONS);
                    for (let vr of versions) {
                        files.push(`${originalKey}-${vr}.webp`);
                    }
                }
                // remove from collection
                await doc.remove();
            }),
        );
        removedDoc.img = [];
        // If long form set file path to empty string and remove file
        // ? What happens if we try to read empty prefix from s3
        if (removedDoc.__t == C.MODELS.LONG_FORM) {
            removedDoc.ful = '';
            // Remove file from bucket
            await emptyS3Directory(
                env.S3_BUCKET_USER_DATA,
                `${creator.id}/${C.MODELS.LONG_FORM}/${removedDoc.id}/`,
            );
        }
        if (files.length > 0) {
            // Remove from s3 (tortoise); delete documents
            await deleteMultiple(env.S3_BUCKET_USER_DATA, files);
            await deleteFilesByKey({ keys: files });
        }
    }
    await removedDoc.save();
    return {
        msg: 'project removed',
    };
};

/**
 * Testimonials Controllers
 *
 */
exports.testimonialViaEmail = async ({ creator, email, reqMessage }) => {
    // check if creator has already requested from email
    for (let tr of creator.tstm) {
        if (tr.email.toLowerCase() === email.toLowerCase())
            throw new BadRequest('already requested testimonial', 'CRPL107');
    }

    /**
     * Find Client with email
     */
    const onPlatformClient = await Client.findOne({
        e: createEmailFindRegex({ email }),
    }).exec();

    // Data for off-platform, will alter this data if client is on platform client.
    let clientType = 'off-platform';
    let notificationType = C.NOTIF_USECASES[C.ROLES.WRITER_C].TESTIMONIAL_OFF;
    let notificationDetails = {
        email: email,
        name: creator.fullname,
        reqMessage,
        link: '', // will assing outside if
    };

    /**
     * * If client with email is present, this testimonial is for an on-platform client
     * * For on-platform client we also have to find applications with hired status
     * * Only when there is such an application creator can request testimonial
     */
    if (onPlatformClient) {
        clientType = 'on-platform';

        notificationType = C.NOTIF_USECASES[C.ROLES.WRITER_C].TESTIMONIAL_ON;

        // Verify if creator has worked with the client and get most recent application
        const appl = await Application.findOne({
            writer: creator._id,
            client: onPlatformClient._id,
            status: C.JOB_BOARD_APPLICATION_STATES.HIRED,
            updatedAt: { $gte: new Date(moment().subtract(30, 'd')) }, // Hired in last 30 days
        })
            .sort({ updatedAt: -1 })
            .limit(1)
            .populate('job', 'title')
            .exec();

        if (!appl)
            throw new BadRequest(
                'When you send testimonial to a client who is already on platform, then you can send request only when you have done some work with them on platform.',
                'CRPL108',
            );

        notificationDetails = {
            email: onPlatformClient.e,
            clientName: onPlatformClient.n.f,
            creatorName: creator.fullname,
            projectName: appl.job.title,
            reqMessage,
            link: '', // will assing outside if
        };
    }

    let testimonialId = mongoose.Types.ObjectId().toHexString();

    const token = await jwt.generateToken({
        data: {
            creatorId: creator.id,
            email,
            testimonialId,
            client_type: clientType,
        },
        expiresIn: C.TESTIMONIAL_TOKEN_EXPIRESIN,
    });

    const link = `${env.FRONTEND_URL}/creator/client-testimonial/${token}`;

    notificationDetails.link = link;

    creator.tstm.push({
        _id: testimonialId,
        t: C.TESTIMONIAL_TYPE.TEXT,
        e: email,
        req: true,
        vf: false,
    });

    await notification.send({
        usecase: notificationType,
        role: C.ROLES.WRITER_C,
        email: notificationDetails,
    });

    await creator.save();

    return { msg: 'testimonial request email sent', email, token };
};

exports.changeTestimonialVisibility = async ({
    creator,
    updatedStatus,
    tid,
}) => {
    const testimonial = creator.tstm.id(tid);
    if (!testimonial) throw new BadRequest('invalid testimonial', 'CRPL109');
    testimonial.isp = updatedStatus.isPublic;
    testimonial.isb = updatedStatus.isBookmarked;
    let bookmarkedCount = 0;
    let publicCount = 0;
    for (let tr of creator.tstm) {
        if (tr.isp === true) publicCount++;
        if (tr.isb === true) bookmarkedCount++;
    }
    if (bookmarkedCount > C.MAX_BOOKMARKS || publicCount > C.MAX_PUBLIC)
        throw new BadRequest('limit exceeded');
    await creator.save();
    return { msg: 'testimonial visibility changed' };
};

exports.addBrandLogo = async ({ creator, company, fileId, logo }) => {
    if (!fileId && !logo) {
        throw new BadRequest('file not uploaded and logo url provided');
    }
    const logo_testimonaial = creator.tstm.create({
        t: C.TESTIMONIAL_TYPE.LOGO,
        req: false,
        vf: true,
        cmp: '',
        img: '',
    });
    logo_testimonaial.cmp = company;

    if (fileId) {
        const fileIds = [fileId];
        // Create Image sub documents
        // Update state of files in db and move objects from 'mayfly' to 'tortoise' directory
        const fileKeys = await updateStateAndPersist({
            fileIds,
            allowedTypes: ['image'],
        });
        _.forEach(fileKeys, (file) => {
            const originalPath = `${env.S3_BUCKET_WEBSITE_URL}/${file.key}`;
            logo_testimonaial.img = originalPath;
        });
    } else {
        logo_testimonaial.img = logo;
    }

    creator.tstm.push(logo_testimonaial);
    await creator.save();
    return {
        msg: 'logo added',
        logo_testimonaial,
    };
};

exports.deleteTestimonial = async ({ creator, testimonialId }) => {
    const doc = creator.tstm.id(testimonialId);
    if (!doc) throw new BadRequest('Logo not found');
    const isLogo = doc.t === C.TESTIMONIAL_TYPE.LOGO;
    await doc.remove();
    await creator.save();

    if (isLogo) {
        const key = doc.img.replace(env.S3_BUCKET_WEBSITE_URL + '/', '');
        await deleteSingleFileVersions({ key });
    }
    return {
        msg: 'logo removed',
    };
};

/*
 * Module Dependencies
 */
const mongoose = require('mongoose');
const _ = require('lodash');
const moment = require('moment');
const agenda = require('../../services/agenda');
const C = require('../../lib/constants');
const env = require('../../config/env');
const jwt = require('../../lib/jwt');
const sanitizeHtml = require('sanitize-html');
const debug = require('debug')('creator');
debug.enabled = true;
// const NOTIF_C = require('../config/notification');

// const Level = mongoose.model(C.MODELS.LEVEL_C);
const Writer = mongoose.model(C.MODELS.WRITER_C);
const Client = mongoose.model(C.MODELS.CLIENT_C);
const Application = mongoose.model(C.MODELS.JOB_BOARD_APPLICATION_C);
// Project Models
const PDF = mongoose.model(C.MODELS.PDF);
const Cards = mongoose.model(C.MODELS.CARDS);
const Project = mongoose.model(C.MODELS.PROJECT);
const LongForm = mongoose.model(C.MODELS.LONG_FORM);
/**
 * Utility functions
 */
const {
    emptyS3Directory,
    deleteMultiple,
    getObject,
} = require('../../utils/s3-operations');
const { createEmailFindRegex } = require('../../services/db/user');

/**
 * External service dependencies
 */
const scraperService = require('../../services/scraper');
const { scrapeArticle } = require('../../services/import-article');
const { notification } = require('../../messaging/index');
const { getDataFromPublicDoc } = require('../../services/google-doc');

// Other Controllers
const {
    deleteSingleFileVersions,
    updateStateAndPersist,
} = require('../fileStore');

const { BadRequest } = require('../../lib/errors');

/*
 * Helpers
 */
const {
    generatePublicUrl,
    verifyCollaboraters,
    createEmptyFile,
    updateFile,
    expSort,
} = require('../helpers/writerHelper');

/**
 * Contains
 * controllers specific to creator and
 * controllers common to PM and creator
 */

exports.uploadPortfolioImg = async ({ user, file }) => {
    // const { originalname, location } = file;
    if (!file) {
        throw new BadRequest('no file selected');
    }
    // Remove resized versions of older image
    const versions = Object.values(C.PORTFOLIO_IMAGE_VERSIONS);
    const filesToRemove = [];
    for (let vr of versions) {
        filesToRemove.push(`${user.id.toString()}/profile-${vr}.webp`);
    }
    await deleteMultiple(env.S3_BUCKET_USER_DATA, filesToRemove);
    user.img = `${
        env.S3_BUCKET_WEBSITE_URL
    }/${user.id.toString()}/profile-150x150.webp`;
    await user.save();
    return {
        originalname: file.originalname,
        location: user.img,
    };
};

exports.removePortfolioImage = async ({ user }) => {
    const filesToRemove = [`${user.id.toString()}/profile`];
    const versions = Object.values(C.PORTFOLIO_IMAGE_VERSIONS);
    for (let vr of versions) {
        filesToRemove.push(`${user.id.toString()}/profile-${vr}.webp`);
    }
    await deleteMultiple(env.S3_BUCKET_USER_DATA, filesToRemove);
    user.img = '';
    await user.save();
    return {
        msg: 'image removed',
    };
};
/**
 * Put portfolio personal info controller
 * @version2
 */
// Update Personal Info
exports.putPortfolioPersonalInfo = async ({ creator, personalInfo }) => {
    const {
        firstName,
        lastName,
        // country,
        city,
        professionalDesignation,
        skills,
        bio,
    } = personalInfo;
    creator.n.f = firstName;
    creator.n.l = lastName;
    creator.bio = bio;
    // creator.adr.co = country;
    if (typeof city == 'string') {
        creator.adr.ci = city;
    }
    if (typeof professionalDesignation == 'string')
        creator.pdg = professionalDesignation;
    if (skills) creator.sls = skills;
    await creator.save();

    return { msg: 'Personal info updated successfully', personalInfo };
};

exports.putPortfolioSocialInfo = async ({ creator, socialInfo }) => {
    const { linkedin, instagram, twitter, medium, dribbble } = socialInfo;
    if (typeof linkedin == 'string') creator.sml.linkedin = linkedin;
    if (typeof instagram == 'string') creator.sml.instagram = instagram;
    if (typeof twitter == 'string') creator.sml.twitter = twitter;
    if (typeof medium == 'string') creator.sml.medium = medium;
    if (typeof dribbble == 'string') creator.sml.dribbble = dribbble;
    await creator.save();

    return { msg: 'Social info updated successfully', socialInfo };
};

// Find Client
exports.findClient = async ({ creator, searchValue, workedWith }) => {
    if (!searchValue) searchValue = '';
    let findQuery = {
        cn: { $regex: searchValue, $options: '-i' },
        acst: { $nin: [C.ACCOUNT_STATUS.BAN, C.ACCOUNT_STATUS.INACTIVE] },
    };
    if (workedWith) {
        let appls = await Application.find({
            writer: creator._id,
            status: C.JOB_BOARD_APPLICATION_STATES.HIRED,
            updatedAt: { $gte: new Date(moment().subtract(30, 'd')) }, // Hired in last 30 days
        })
            .select('client')
            .exec();
        appls = _.map(appls, (app) => {
            return app.client;
        });
        findQuery = { ...findQuery, _id: { $in: appls } };
    }
    const clients = await Client.find(findQuery, { cn: 1, img: 1, e: 1 });
    return {
        clients,
    };
};

exports.findCreator = async ({ creator, searchValue }) => {
    if (!searchValue) searchValue = '';
    let findQuery = {
        $or: [
            { 'n.f': { $regex: searchValue, $options: '-i' } },
            { 'n.l': { $regex: searchValue, $options: '-i' } },
            { cn: { $regex: searchValue, $options: '-i' } },
            { pn: { $regex: searchValue, $options: '-i' } },
        ],
        acst: { $nin: [C.ACCOUNT_STATUS.BAN, C.ACCOUNT_STATUS.INACTIVE] },
        _id: { $ne: creator._id },
    };
    const foundCreators = await Writer.find(findQuery, {
        n: 1,
        cn: 1,
        img: 1,
        pn: 1,
    });
    const creators = [];
    for (let cr of foundCreators) {
        toSend = cr.toJSON();
        toSend.name =
            (toSend.name.first ? toSend.name.first : '') +
            ' ' +
            (toSend.name.last ? toSend.name.last : '');
        creators.push(toSend);
    }
    return {
        creators,
    };
};

/**
 * Professional Info Controllers
 * @version2
 */

exports.addUpdateExperience = async ({
    creator,
    professionalInfo,
    exp,
    file,
}) => {
    if (professionalInfo.isWorkingHere === false) {
        const isAfter = moment(professionalInfo.end).isSameOrAfter(
            professionalInfo.start,
        );
        if (!isAfter) {
            throw new BadRequest(
                'End Date should be after Start Date',
                'CRPL102',
            );
        }
    }
    exp.e = professionalInfo.end;
    exp.s = professionalInfo.start;
    exp.iwh = professionalInfo.isWorkingHere;
    exp.cg = professionalInfo.categories;
    exp.desc = professionalInfo.description;
    exp.t = professionalInfo.title;
    exp.o = professionalInfo.organization;
    if (!file && !professionalInfo.fileId) {
        exp.l = professionalInfo.logo;
    }
    if (file) {
        // File uploaded using multer
        // If file uploaded
        exp.l = `${env.S3_BUCKET_USER_DATA_URL}/${
            creator.id
        }/experience/${exp._id.toString()}/logo`;
    } else if (professionalInfo.fileId) {
        // File uploaded using new file upload service directly to s3
        if (exp.l) {
            // First delete old logos
            const key = exp.l.replace(env.S3_BUCKET_WEBSITE_URL + '/', '');
            await deleteSingleFileVersions({ key });
        }
        const fileIds = [professionalInfo.fileId];
        // Create Image sub documents
        // Update state of files in db and move objects from 'mayfly' to 'tortoise' directory
        const fileKeys = await updateStateAndPersist({
            fileIds,
            allowedTypes: ['image'],
        });
        _.forEach(fileKeys, (file) => {
            const originalPath = `${env.S3_BUCKET_WEBSITE_URL}/${file.key}`;
            exp.l = `${originalPath}`;
        });
    }
    creator.pfi.push(exp);
    professionalInfo.id = exp._id;

    // Sort experience
    const experience = [];
    for (let exp of creator.pfi) {
        exp = exp.toJSON();
        exp._id = exp.id;
        delete exp.id;
        experience.push(exp);
    }
    experience.sort(expSort);
    creator.pfi = experience;
    await creator.save();

    return {
        msg: 'professional info added successfully!',
        professionalInfo: { ...professionalInfo, logo: exp.l },
    };
};

/*
exports.updateExperience = async ({ creator, professionalInfo, expId }) => {
    const updatededFields = {
        _id: expId,
        ...professionalInfo,
    };
    // Sort experience
    const experience = [];
    for (let exp of creator.pfi) {
        exp = exp.toJSON();
        if (exp.id == expId) {
            exp = updatededFields;
        } else {
            exp._id = exp.id;
            delete exp.id;
        }
        experience.push(exp);
    }
    experience.sort(expSort);
    creator.pfi = experience;
    await creator.save();
    professionalInfo.id = expId;
    return { msg: 'professional info updated successfully!', professionalInfo };
};
*/

exports.removeExperience = async ({ creator, expId }) => {
    const doc = creator.pfi.id(expId);
    if (!doc) throw new BadRequest('invalid experience', 'CRPL104');
    await doc.remove();
    await creator.save();
    // Delete Directory from s3
    await emptyS3Directory(
        env.S3_BUCKET_USER_DATA,
        `${creator.id}/experience/${expId}/`,
    );
    // When using new file upload service
    if (doc.l) {
        // First delete old logos
        const key = doc.l.replace(env.S3_BUCKET_WEBSITE_URL + '/', '');
        await deleteSingleFileVersions({ key });
    }
    return { msg: 'professional info removed successfully!' };
};

/**
 *
 * @Version1
 */
exports.getArticleMetaData = async ({ targetUrl }) => {
    const metadata = await scraperService.scrapeArticle({ targetUrl });
    const { title, description } = metadata;
    // title.length <= 128
    // description.length <= 360
    let newTitle = title;
    if (title && title.length > 128) {
        newTitle = `${title.substring(0, 128)}`;
    }
    let newDescription = description;
    if (description && description.length > 360) {
        newDescription = `${description.substring(0, 360)}`;
    }
    return {
        image: metadata.image,
        publisher: metadata.publisher,
        title: newTitle,
        description: newDescription,
        url: metadata.url,
        logo: metadata.logo,
    };
};

/**
 * Testimonials Controllers
 * @version2
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
/*
exports.removeTestimonial = async ({ creator, tid }) => {
    const testimonial = creator.tstm.id(tid);
    if (!testimonial) throw new BadRequest('invalid testimonial', 'CRPL109');
    await testimonial.remove();
    await creator.save();
    return { msg: 'testimonial removed' };
};
*/

exports.addBrandLogo = async ({
    creator,
    company,
    file,
    logo,
    logo_testimonaial,
}) => {
    if (!file && !logo)
        throw new BadRequest('No image uploaded or logo url provided');
    logo_testimonaial.cmp = company;
    if (file) {
        logo_testimonaial.img = `${env.S3_BUCKET_WEBSITE_URL}/${
            creator.id
        }/brandLogo/${logo_testimonaial._id.toString()}/logo`;
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
    // Delete Directory from s3
    if (isLogo)
        await emptyS3Directory(
            env.S3_BUCKET_USER_DATA,
            `${creator.id}/brandLogo/${doc._id.toString()}/`,
        );
    return {
        msg: 'logo removed',
    };
};

//******************* Portfolio Project Controllers ********************/
// @version2

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
 *
 * Design
 *
 * */
exports.addDesignProject = async ({ creator, newProject, cardData }) => {
    newProject.t = cardData.title;
    if (typeof cardData.description == 'string')
        newProject.desc = cardData.description;
    // newProject.ptg = cardData.primaryTag;
    newProject.ctg = cardData.category;
    newProject.sty = cardData.style;
    newProject.iny = cardData.industry;
    newProject.atg = cardData.additionalTags;
    await verifyCollaboraters(creator, cardData.collaboraters);
    newProject.clb = cardData.collaboraters;
    newProject.cid = creator._id;
    newProject.pul = await generatePublicUrl(cardData.title);
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
        msg: 'design project saved',
        id: newProject.id,
        images: newProject.img,
        public_url: newProject.pul,
    };
};

exports.updateDesignProject = async ({ creator, project, cardData }) => {
    // If title changes generate new public url
    if (project.t != cardData.title) {
        project.t = cardData.title;
        project.pul = await generatePublicUrl(cardData.title);
    }
    if (typeof cardData.description == 'string')
        project.desc = cardData.description;
    // newProject.ptg = cardData.primaryTag;
    project.ctg = cardData.category;
    project.sty = cardData.style;
    project.iny = cardData.industry;
    project.atg = cardData.additionalTags;
    await verifyCollaboraters(creator, cardData.collaboraters);
    project.clb = cardData.collaboraters;
    await project.save();
    return {
        msg: 'design project updated',
        id: project.id,
        images: project.img,
        public_url: project.pul,
    };
};
/**
 *
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

exports.addImageToLongForm = async ({ creator, files, project }) => {
    await project.save();
    if (Array.isArray(files) == false)
        throw new BadRequest('upload unsuccessful', 'CRPL110');
    if (files.length == 0)
        throw new BadRequest('upload unsuccessful', 'CRPL110');
    let imgUrl = `${env.S3_BUCKET_WEBSITE_URL}/${files[0].key}-webp.webp`;
    return {
        msg: 'Image Added',
        imgUrl,
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

exports.createUpdatePdf = async ({ creator, data, pid }) => {
    let project;
    // Check if colloborates array has valid id's
    await verifyCollaboraters(creator, data.collaboraters);
    const { fileId, coverId, ...projectData } = data;
    // If pid is provided operation is an update operation
    if (pid) {
        project = await PDF.findOne({
            _id: pid,
            cid: creator.id,
            del: false,
        });
        if (!project) throw new BadRequest('PDF not found');
        // Generate new public url if title changed
        if (project.title !== projectData.title) {
            project.pul = await generatePublicUrl(projectData.title);
        }
        const {
            title,
            description,
            category,
            tone,
            industry,
            additionalTags,
            collaboraters,
        } = projectData;
        project.title = title;
        project.description = description;
        project.category = category;
        project.tone = tone;
        project.industry = industry;
        project.additionalTags = additionalTags;
        project.collaboraters = collaboraters;
    } else {
        // Else create new PDF project
        project = new PDF({
            creatorId: creator._id,
            cun: creator.pn,
            ...projectData,
        });
        project.pul = await generatePublicUrl(projectData.title);
    }
    // If operation is update then fileId and coverId are optional
    // otherwise they are required
    if (!pid && !(fileId && coverId)) {
        throw new BadRequest(
            'Both file Id and cover Image Id required to create new project',
        );
    }
    if (pid && ((!fileId && coverId) || (fileId && !coverId))) {
        throw new BadRequest(
            'Provide both file Id and cover Image Id or none to update PDF',
        );
    }
    if (fileId && coverId) {
        if (pid) {
            // delete old files: pdf file and cover image
            const key1 = project.floc.replace(
                env.S3_BUCKET_WEBSITE_URL + '/',
                '',
            );
            const key2 = project.cvi.replace(
                env.S3_BUCKET_WEBSITE_URL + '/',
                '',
            );
            await deleteSingleFileVersions({ keys: [key1, key2] });
        }
        // Create new file urls
        const fileIds = [fileId, coverId];
        const fileKeys = await updateStateAndPersist({
            fileIds,
            allowedTypes: ['image', 'pdf'],
        });
        let idx = 0;
        _.forEach(fileKeys, (file) => {
            const originalPath = `${env.S3_BUCKET_WEBSITE_URL}/${file.key}`;
            if (idx == 0) project.floc = originalPath;
            if (idx == 1) project.cvi = originalPath;
            idx++;
        });
    }
    await project.save();
    return {
        project,
    };
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
    await Promise.all(
        _.map(imageIds, async (img) => {
            const doc = project.img.id(img);
            if (doc) {
                // Files to remove
                let files = [];
                // original
                files.push(`${creator.id}/${project.__t}/${project.id}/${img}`);
                // Remove all versions of image
                const versions = Object.values(C.PORTFOLIO_IMAGE_VERSIONS);
                for (let vr of versions) {
                    files.push(
                        `${creator.id}/${project.__t}/${project.id}/${img}-${vr}.webp`,
                    );
                }
                await deleteMultiple(env.S3_BUCKET_USER_DATA, files);
                // remove from collection
                await doc.remove();
            }
        }),
    );
    await project.save();
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
    // Remove images and long form file urls
    if (
        removedDoc.__t == C.MODELS.LONG_FORM ||
        (removedDoc.__t == C.MODELS.CARDS &&
            removedDoc.cty == C.CARD_TYPES.DESIGN)
    ) {
        removedDoc.img = [];
        // ? What happens if we try to read empty prefix from s3
        if (removedDoc.__t == C.MODELS.LONG_FORM) removedDoc.ful = '';
    }
    await removedDoc.save();
    // Delete images and long form file objects
    if (
        removedDoc.__t == C.MODELS.LONG_FORM ||
        (removedDoc.__t == C.MODELS.CARDS &&
            removedDoc.cty == C.CARD_TYPES.DESIGN)
    ) {
        // Delete Directory from s3
        await emptyS3Directory(
            env.S3_BUCKET_USER_DATA,
            `${creator.id}/${removedDoc.__t}/${removedDoc.id}/`,
        );
    }
    if (removedDoc.__t == C.MODELS.PDF) {
        const key = removedDoc.floc.replace(
            env.S3_BUCKET_WEBSITE_URL + '/',
            '',
        );
        await deleteSingleFileVersions({ key });
    }
};

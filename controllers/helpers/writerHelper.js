const mongoose = require('mongoose');
const crypto = require('crypto');
const _ = require('lodash');

// Config
const C = require('../../lib/constants');
const { WEB_NOTIF } = require('../../messaging/constants');
const env = require('../../config/env');
const debug = require('debug')('writer:helper');
debug.enabled = true;

// Models
const Report = mongoose.model(C.MODELS.JOB_BOARD_REPORTING_C);
const JobBoard = mongoose.model(C.MODELS.JOB_BOARD_C);
const User = mongoose.model(C.MODELS.USER_C);
const Creator = mongoose.model(C.MODELS.WRITER_C);
const Project = mongoose.model(C.MODELS.PROJECT);
const Page = mongoose.model(C.MODELS.PAGE);
const Block = mongoose.model(C.MODELS.BLOCK);

// Services
const { notification } = require('../../messaging/index');
const {
    uploadFile,
    copyMultilple,
    getObject,
} = require('../../utils/s3-operations');
const {
    createFileUploads,
    updateStateAndPersist,
    copyFiles,
} = require('../fileStore');
const { createEmailFindRegex } = require('../../services/db/user');

//
const templateData = require('../../assets/templates/templates.json')[
    env.NODE_ENV
];

// Errors
const { BadRequest } = require('../../lib/errors');
const { sortByPosition } = require('./commonHelpers');

exports.get_reported_jobs = async (writer) => {
    const query = {
        'by.uid': writer._id,
        report_type: C.JOB_BOARD_REPORT_TYPE.POST,
    };
    const reported = await Report.find(query).select('postId').exec();
    const reportedIds = reported.map((report) => {
        return report.postId;
    });
    return reportedIds;
};

exports.has_writer_reported = async (writer, jobId) => {
    const query = {
        'by.uid': writer._id,
        postId: jobId,
        report_type: C.JOB_BOARD_REPORT_TYPE.POST,
    };
    const has_reported = await Report.findOne(query).exec();
    if (has_reported) return true;
    return false;
};

exports.has_client_reported_writer = async ({ writer, jobId }) => {
    const job = await JobBoard.findById(jobId).exec();
    const query = {
        'by.uid': job.client._id,
        'against.uid': writer.id,
        report_type: C.JOB_BOARD_REPORT_TYPE.PROFILE,
    };
    const check = await Report.findOne(query).exec();
    if (check) return true;
    return false;
};

exports.client_notification_new = async ({ updated }) => {
    const client = await User.findOne({
        _id: updated.client,
    })
        .select('n e')
        .exec();
    const forUser = {
        id: client.id,
        role: C.ROLES.CLIENT_C,
    };
    const actions = {
        n: WEB_NOTIF[C.ROLES.CLIENT_C].VIEW_NEW_APPLICATIONS,
        d: { jobId: updated._id },
    };
    let link = '';
    if (client.__t == C.MODELS.PM_C) {
        link = `${env.PM_PORTFOLIO}/application/${updated.id}`;
    } else if (client.__t == C.MODELS.CLIENT_C) {
        link = `${env.CLIENT_PROFILE}/application/${updated.id}`;
    }
    await notification.send({
        role: C.ROLES.CLIENT_C,
        usecase: C.NOTIF_USECASES[C.ROLES.CLIENT_C].CLIENT_APPL_REMINDER,
        email: {
            email: client.e,
            nac: updated.nac,
            name: client.n.f,
            jobName: updated.title,
            link,
        },
        web: {
            for: forUser,
            actions,
            createdAt: Date.now(),
            nac: updated.nac,
            title: updated.title,
        },
    });
};

/**
 * Version 2  Helpers
 */

exports.hasInvalidEmails = async (creator, emails) => {
    // Create Case insensitive regex array
    let emailRegex = emails.map((email) => {
        return createEmailFindRegex({ email });
    });
    // Check if any email is already present in database
    let result = await User.find({ e: { $in: emailRegex } }).exec();
    if (result.length > 0) return true;
    // Check if user has already invited this email
    let invalid = false;
    // For case insensitive operation
    let emailsLower = emails.map((email) => {
        return email.toLowerCase();
    });
    creator.rd.ij.forEach((element) => {
        let checkLower = element.email.toLowerCase();
        if (emailsLower.includes(checkLower)) {
            invalid = true;
        }
    });
    return invalid;
};

const generatePublicUrl = async (
    title,
    id = '',
    update = false,
    oldUrl = '',
) => {
    // Structure of a public Url
    // [title]-[6 random characters]-[id]

    // Make title url safe
    let url = title.replace(/\W+/g, '-').toLowerCase();

    // If this is an update operation, only title part of oldUrl should change
    if (update) {
        if (!oldUrl) throw new Error('oldUrl length cannot be 0');
        const fixedPortion = oldUrl.substring(oldUrl.length - 34);
        if (fixedPortion.length !== 34)
            throw new Error('34 characters not found in block url');
        url = url + fixedPortion;
    } else {
        // Length of random is 8
        // Base64 requires 6 bits
        // So 6 * 8 / 6 = 8
        let random = crypto
            .randomBytes(6)
            .toString('base64')
            .replace(/\//g, '_') // Make url safe: replace / and + with _ and -
            .replace(/\+/g, '-');
        url = url + '-' + random + '-' + id;
    }
    return url;
};

exports.generatePublicUrl = generatePublicUrl;

exports.importedServiceUrl = async (id) => {
    const title = crypto
        .randomBytes(6)
        .toString('base64')
        .replace(/\//g, '_') // Make url safe: replace / and + with _ and -
        .replace(/\+/g, '-');
    return await generatePublicUrl(title, id);
};

const generatePageName = (title) => {
    let url = title.replace(/\W+/g, '-').toLowerCase();
    // Length of random is 13
    let random = crypto
        .randomBytes(8)
        .toString('base64')
        .replace(/\//g, '_') // Make url safe: replace / and + with _ and -
        .replace(/\+/g, '-');
    url = url + '-' + random + 'z';
    return url;
};

exports.generatePageName = generatePageName;

exports.verifyCollaboraters = async (creator, collaboraters) => {
    if (Array.isArray(collaboraters) && collaboraters.length > 0) {
        const allExists = await Creator.find({
            _id: {
                $in: collaboraters,
                $ne: creator.id,
            },
        }).exec();
        if (allExists.length != collaboraters.length) {
            throw new BadRequest(
                'one or more invalid collaboraters',
                'CRPL106',
            );
        }
    }
};

// File Operations for long form
exports.createEmptyFile = async ({ creatorId, projectId }) => {
    const s3Prefix = `${creatorId}/${C.MODELS.LONG_FORM}/${projectId}/content.txt`;
    await uploadFile(env.S3_BUCKET_USER_DATA, s3Prefix, 'init');
    const fileUrl = env.S3_BUCKET_USER_DATA_URL + '/' + s3Prefix;
    return fileUrl;
};

exports.updateFile = async ({ creatorId, projectId, content }) => {
    const s3Prefix = `${creatorId}/${C.MODELS.LONG_FORM}/${projectId}/content.txt`;
    await uploadFile(env.S3_BUCKET_USER_DATA, s3Prefix, content);
};

// File Operations for project block
// v3.1
exports.createEmptyProjectFile = async ({ creatorId, projectId }) => {
    const s3Prefix = `${creatorId}/${C.MODELS.PROJECT_BLOCK}/${projectId}/content.txt`;
    await uploadFile(env.S3_BUCKET_USER_DATA, s3Prefix, 'init');
    const fileUrl = s3Prefix;
    return fileUrl;
};

const updateFileV3 = async ({ creatorId, projectId, content }) => {
    const s3Prefix = `${creatorId}/${C.MODELS.PROJECT_BLOCK}/${projectId}/content.txt`;
    await uploadFile(env.S3_BUCKET_USER_DATA, s3Prefix, content);
    const fileUrl = s3Prefix;
    return fileUrl;
};
exports.updateFileV3 = updateFileV3;

// File operations for Text Editor
exports.createEmptyTextEditorFile = async ({ userId, editorId }) => {
    const s3Prefix = `text-editor/${userId}-${editorId}`;
    await uploadFile(env.S3_BUCKET_USER_DATA, s3Prefix, ' ');
};

exports.textEditorSaveContent = async ({ userId, editorId, content }) => {
    const s3Prefix = `text-editor/${userId}-${editorId}`;
    await uploadFile(env.S3_BUCKET_USER_DATA, s3Prefix, content);
};

// Sort Experience
// Sort Comapre Function
exports.expSort = (ele1, ele2) => {
    let en1 = ele1.end instanceof Date;
    let en2 = ele2.end instanceof Date;
    let end1 = ele1.end;
    let end2 = ele2.end;
    let start1 = ele1.start;
    let start2 = ele2.start;
    if (en1 && en2) {
        if (end1 < end2) return 1; // ele2 comes first
        if (end1 == end2) {
            if (start1 <= start2) return 1;
            // ele2 comes first
            else return -1; // ele1 comes first
        }
        return -1; // ele1 comes first
    } else if (en1 || en2) {
        if (!en1) return -1;
        // ele1 comes first
        else return 1;
    } else {
        if (start1 <= start2) return 1;
        // ele2 comes first
        else return -1; // ele1 comes first
    }
};

// Version3 helpers

exports.checkIfValidSampleIds = async ({ writer, contentSamples }) => {
    // contentSamples should contain ids of projects that are either imported by PM or created by PM
    const writerImported = new Set();
    for (let pid of writer.impr) {
        writerImported.add(pid.toString());
    }
    const notImportedIds = [];
    for (let pid of contentSamples) {
        if (!writerImported.has(pid.toString())) {
            notImportedIds.push(pid);
        }
    }
    if (notImportedIds.length > 0) {
        const findNotImported = await Project.find({
            cid: writer._id,
            _id: { $in: notImportedIds },
            $or: [
                // For all except longForm
                { lst: { $exists: false } },
                //  For long form
                {
                    $and: [
                        { __t: C.MODELS.LONG_FORM },
                        { lst: C.LONG_FORM_STATES.SAVED },
                        { pblc: true },
                    ],
                },
            ],
        }).exec();
        if (findNotImported.length !== notImportedIds.length) return false;
    }

    return true;
};

exports.checkIfExists = async ({ domain }) => {
    if (!domain) return false;
    domain = domain.toLowerCase();
    const creator = await Creator.findOne({
        cdn: domain,
    })
        .select('pn')
        .exec();
    if (creator) return true;
    return false;
};
// Deep Copy a mongoose document object by removing the id fields from doc, array of subdocs
exports.cleanId = function cleanId(obj) {
    if (Array.isArray(obj)) obj.forEach(cleanId);
    else if (typeof obj == 'object') {
        if (obj && obj._id) delete obj['_id'];
        // delete obj['id'];
        for (let key in obj) if (typeof obj[key] == 'object') cleanId(obj[key]);
    }
};

const midString = (prev, next) => {
    var p, n, pos, str;
    for (pos = 0; p == n; pos++) {
        // find leftmost non-matching character
        p = pos < prev.length ? prev.charCodeAt(pos) : 96;
        n = pos < next.length ? next.charCodeAt(pos) : 123;
    }
    str = prev.slice(0, pos - 1); // copy identical part of string
    if (p == 96) {
        // prev string equals beginning of next
        while (n == 97) {
            // next character is 'a'
            n = pos < next.length ? next.charCodeAt(pos++) : 123; // get char from next
            str += 'a'; // insert an 'a' to match the 'a'
        }
        if (n == 98) {
            // next character is 'b'
            str += 'a'; // insert an 'a' to match the 'b'
            n = 123; // set to end of alphabet
        }
    } else if (p + 1 == n) {
        // found consecutive characters
        str += String.fromCharCode(p); // insert character from prev
        n = 123; // set to end of alphabet
        while ((p = pos < prev.length ? prev.charCodeAt(pos++) : 96) == 122) {
            // p='z'
            str += 'z'; // insert 'z' to match 'z'
        }
    }
    return str + String.fromCharCode(Math.ceil((p + n) / 2)); // append middle character
};

exports.midString = midString;

exports.assignPercentLabel = (percent) => {
    if (percent <= 30) return 'Low';
    else if (percent >= 70) return 'High';
    else return 'Moderate';
};

exports.calculatePercentile = (values, num) => {
    if (num == 0) return 0;

    if (values.length == 0) return 100;

    values = values.sort(function (a, b) {
        return a - b;
    });

    let low = 0,
        high = values.length - 1;

    let res = -1;

    while (low <= high) {
        mid = Math.floor((low + high) / 2);

        if (num >= values[mid]) {
            low = mid + 1;
            res = mid + 1;
        } else {
            high = mid - 1;
        }
    }

    if (res == -1) return 0;

    let percentile = (res / values.length) * 100;

    return percentile;
};

exports.getFirstPositionInPage = async (pageId) => {
    const blocks = await Block.find({
        pid: pageId,
    })
        .select('pos')
        .sort('pos')
        .limit(1)
        .exec();

    if (blocks.length > 0) {
        return midString('', blocks[0].position);
    } else return 'n';
};
exports.getLastNewPagePosition = async ({ userId }) => {
    const pages = await Page.find({
        uid: userId,
    })
        .select('pos')
        .sort('pos')
        .exec();

    if (pages.length > 0) {
        return midString(pages[pages.length - 1].pos, '');
    }
    return 'n';
};

/**
 * Template Helpers
 */

async function createImageBlock({ blockMeta }) {
    const images = blockMeta['images'];
    if (!images || !Array.isArray(images) || images.length <= 0) {
        throw new BadRequest('Images required for image block');
    }

    let imageBlockData = {
        imgs: [],
        ci: '',
    };

    const assetKeys = _.map(images, (image) =>
        image.original.replace(`${env.S3_BUCKET_WEBSITE_URL}/`, ''),
    );
    const thumbKeys = _.map(images, (image) =>
        image.thumbnail
            ? image.thumbnail.replace(`${env.S3_BUCKET_WEBSITE_URL}/`, '')
            : '',
    );
    const filteredThumb = thumbKeys.filter((key) => !!key);

    const newKeys = await copyFiles({ keys: [...assetKeys, ...filteredThumb] });

    // Create image subdocs
    for (let i = 0; i < images.length; i++) {
        imageBlockData.imgs.push({
            _id: mongoose.Types.ObjectId().toHexString(),
            iu: `${newKeys[assetKeys[i]]}-webp.webp`,
            og: `${newKeys[assetKeys[i]]}`,
            tb: thumbKeys[i] ? `${newKeys[thumbKeys[i]]}` : '',
        });
    }

    imageBlockData.ci = imageBlockData.imgs[0].iu;

    return imageBlockData;
}

async function createPagebreak({ blockMeta }) {
    const {
        breakType,
        breakHeight,
        textAlign,
        layout,
        textFont,
        textSize,
        textStyle,
        bold,
        italics,
    } = blockMeta;
    let pageBreakData = {
        bty: breakType,
        brh: breakHeight,
        tli: textAlign,
        lay: layout,
        tfo: textFont,
        tsz: textSize,
        tsy: textStyle,
        bo: bold,
        it: italics,
    };
    return pageBreakData;
}

async function createServiceBlock({ blockMeta }) {
    const {
        feesType,
        price,
        rateUnit,
        deliveryTime,
        currency,
        customMessage,
        askMoreFields,
    } = blockMeta;
    let serviceData = {
        // prepaid gigs required payment gateway to be setup
        // so changing to Fixed for now
        ft:
            feesType == C.SERVICE_BLOCK_FEES_TYPE.PREPAID
                ? C.SERVICE_BLOCK_FEES_TYPE.FIXED
                : feesType,
        prc: price,
        ru: rateUnit,
        dt: deliveryTime,
        curr: currency,
        cmsg: customMessage,
        askm: askMoreFields,
    };
    return serviceData;
}

async function createExperience({ blockMeta }) {
    let experiences = blockMeta['experiences'];
    if (
        !experiences ||
        !Array.isArray(experiences) ||
        experiences.length <= 0
    ) {
        throw new BadRequest(
            'At least one experiences required for image block',
        );
    }
    let experienceData = {
        exps: [],
    };
    let expPos = 'n';
    const keysToCopy = [];
    _.forEach(experiences, (exp) => {
        let {
            company,
            designation,
            start,
            end,
            isWorkingHere,
            logo,
            description,
        } = exp;
        if (logo.includes(env.S3_BUCKET_FILE_FOLDER)) {
            // If logo was uploaded
            // make a copy for experience
            keysToCopy.push(
                logo
                    .replace(`${env.S3_BUCKET_WEBSITE_URL}/`, '')
                    .replace('-webp.webp', ''),
            );
        }
        experienceData.exps.push({
            _id: mongoose.Types.ObjectId().toHexString(),
            c: company,
            dsg: designation,
            s: start,
            e: end,
            iwh: isWorkingHere,
            l: logo,
            desc: description,
            pos: expPos,
        });
        expPos = midString(expPos, '');
    });

    if (keysToCopy.length > 0) {
        const newKeys = await copyFiles({ keys: keysToCopy });
        _.forEach(experienceData.exps, (exp) => {
            let { l } = exp;
            if (l.includes(env.S3_BUCKET_FILE_FOLDER)) {
                const assetKey = l
                    .replace(`${env.S3_BUCKET_WEBSITE_URL}/`, '')
                    .replace('-webp.webp', '');
                exp.l = `${env.S3_BUCKET_WEBSITE_URL}/${newKeys[assetKey]}-webp.webp`;
            }
        });
    }
    return experienceData;
}

async function createLinkBlock({ blockMeta }) {
    const { url, coverImage } = blockMeta;
    let linkData = {
        url,
        ci: '',
    };

    // Is coverImage is an uploaded image
    if (coverImage.includes(env.S3_BUCKET_WEBSITE_URL)) {
        const assetKey = coverImage
            .replace(`${env.S3_BUCKET_WEBSITE_URL}/`, '')
            .replace('-webp.webp', '');
        const newKeys = await copyFiles({
            keys: [assetKey],
        });
        linkData.ci = `${env.S3_BUCKET_WEBSITE_URL}/${newKeys[assetKey]}-webp.webp`;
    } else {
        linkData.ci = coverImage;
    }

    return linkData;
}

async function createTestimonialBlock({ blockMeta }) {
    const { testimonials } = blockMeta;
    if (
        !testimonials ||
        !Array.isArray(testimonials) ||
        testimonials.length <= 0
    ) {
        throw new BadRequest(
            'At least one testimonial is required for image block',
        );
    }
    let testimonialData = {
        tstm: [],
    };
    let tstPos = 'n';
    const keysToCopy = [];

    _.forEach(testimonials, (tst) => {
        let { type, requested, verified, company, image, reviewText } = tst;
        if (
            type == C.TESTIMONIAL_TYPE.LOGO &&
            image.includes(env.S3_BUCKET_FILE_FOLDER)
        ) {
            // If logo was uploaded
            // make a copy for testimonial
            keysToCopy.push(image.replace(`${env.S3_BUCKET_WEBSITE_URL}/`, ''));
        }
        testimonialData.tstm.push({
            _id: mongoose.Types.ObjectId().toHexString(),
            t: type,
            req: requested,
            vf: verified,
            cmp: company,
            img: image,
            rvt: reviewText,
            pos: tstPos,
        });
        tstPos = midString(tstPos, '');
    });

    if (keysToCopy.length > 0) {
        const newKeys = await copyFiles({ keys: keysToCopy });
        _.forEach(testimonialData.tstm, (tst) => {
            let { t, img } = tst;
            if (
                t == C.TESTIMONIAL_TYPE.LOGO &&
                img.includes(env.S3_BUCKET_FILE_FOLDER)
            ) {
                const assetKey = img.replace(
                    `${env.S3_BUCKET_WEBSITE_URL}/`,
                    '',
                );
                tst.img = `${env.S3_BUCKET_WEBSITE_URL}/${newKeys[assetKey]}`;
            }
        });
    }

    return testimonialData;
}

async function createProject({ blockMeta, userId, blockId }) {
    const { fileUrl, images, coverImage } = blockMeta;

    let projectBlockData = {
        imgs: [],
        ci: '',
        fu: '',
        pst: C.PROJECT_BLOCK_STATES.SAVED,
    };

    let oldContent = await getObject(env.S3_BUCKET_USER_DATA, fileUrl);

    if (images.length > 0) {
        const assetKeys = _.map(images, (image) =>
            image.original.replace(`${env.S3_BUCKET_WEBSITE_URL}/`, ''),
        );

        const newKeys = await copyFiles({ keys: assetKeys });

        // Create image subdocs
        _.forEach(assetKeys, (oldKey) => {
            projectBlockData.imgs.push({
                _id: mongoose.Types.ObjectId().toHexString(),
                iu: `${newKeys[oldKey]}-webp.webp`,
                og: `${newKeys[oldKey]}`,
            });
        });

        // replace <img> src with new copied urls
        for (let i = 0; i < images.length; i++) {
            let find = `${images[i].original}-webp.webp`;
            var re = new RegExp(find, 'g');

            oldContent = oldContent.replace(
                re,
                `${env.S3_BUCKET_WEBSITE_URL}/${projectBlockData.imgs[i].iu}`,
            );
        }

        if (coverImage) {
            // coverImage is always one of the imageUrl url from the 'images' array
            // find index at which it exists in the images array
            // we need to compare original-webp.webp == coverImage
            const indexOfCover = images.findIndex(
                (ele) => `${ele.original}-webp.webp` == coverImage,
            );
            if (indexOfCover >= 0) {
                // As compared to ImageBlock, coverImage here is the full path and not just the key
                // Set to new copied url found at the same index in 'imgs' array which has the copied urls
                projectBlockData.ci = `${env.S3_BUCKET_WEBSITE_URL}/${projectBlockData.imgs[indexOfCover].iu}`;
            }
        }
    }

    // Create a new file for the project block
    const newFileUrl = await updateFileV3({
        creatorId: userId,
        projectId: blockId,
        content: oldContent,
    });
    projectBlockData.fu = newFileUrl;

    return projectBlockData;
}

async function createBlock({ blockMeta, pageId, userId, blockPos }) {
    const type = blockMeta['__t'];

    // Common to all blocks
    const id = mongoose.Types.ObjectId().toHexString();

    const title = blockMeta['title'];
    const tags = blockMeta['tags'];
    const highlight = blockMeta['highlight'];
    const customize = blockMeta['customize'];

    let blockDocData = {
        _id: id,
        __t: type,
        t: title ?? '',
        uid: userId,
        pid: pageId,
        pos: blockPos,
        desc: blockMeta['description'] ?? '',
        tg: tags ?? [],
        highlight: !!highlight,
        ...(!!customize && {customize})
    };

    if (
        ![
            C.MODELS.TESTIMONIAL_BLOCK,
            C.MODELS.EXPERIENCE_BLOCK,
            C.MODELS.PAGE_BREAK,
        ].includes(type)
    ) {
        // Title is required and needed to generate a public url for this block
        if (!title || typeof title !== 'string')
            throw new BadRequest('Title was required for this block');
        blockDocData = {
            ...blockDocData,
            t: title,
            pul: await generatePublicUrl(title, id),
        };
    }

    let blockTypeSpecificData = {};
    switch (type) {
        case C.MODELS.IMAGE_BLOCK:
            blockTypeSpecificData = await createImageBlock({
                blockMeta,
                userId,
            });
            break;
        case C.MODELS.PAGE_BREAK:
            blockTypeSpecificData = await createPagebreak({
                blockMeta,
                userId,
            });
            break;
        case C.MODELS.SERVICE_BLOCK:
            blockTypeSpecificData = await createServiceBlock({
                blockMeta,
                userId,
            });
            break;
        case C.MODELS.EXPERIENCE_BLOCK:
            blockTypeSpecificData = await createExperience({
                blockMeta,
                userId,
            });
            break;
        case C.MODELS.TESTIMONIAL_BLOCK:
            blockTypeSpecificData = await createTestimonialBlock({
                blockMeta,
                userId,
            });
            break;
        case C.MODELS.LINK_BLOCK:
            blockTypeSpecificData = await createLinkBlock({
                blockMeta,
                userId,
            });
            break;
        case C.MODELS.PROJECT_BLOCK:
            blockTypeSpecificData = await createProject({
                blockMeta,
                userId,
                blockId: blockDocData._id,
            });
            break;

        default:
            throw new BadRequest('Unhandled block type');
    }
    return {
        ...blockDocData,
        ...blockTypeSpecificData,
    };
}

async function fetchTemplate({ templateId }) {
    const user = await Creator.findOne({
        pn: templateId,
    })
        .select('pn')
        .exec();
    if (!user) throw new BadRequest('Template not found');
 
    const pages = await Page.find({ uid: user.id })
    // add fields
        .select('pos n lay pfc cth ctz sb udet.n udet.img udet.bio')
        .sort('pos')
        .exec();
    let allPagesToCreate = {};
    for (let page of pages) {
        let pageDetails = page.toJSON();
        allPagesToCreate[pageDetails.id] = {
            pageDetails,
            blocks: [],
        };
    }
    const pageIds = _.map(pages, (page) => page.id);
    let blocks = await Block.find({
        pid: {
            $in: pageIds,
        },
        __t: {
            $nin: [C.MODELS.PDF_BLOCK, 'ImportedService'],
        },
    })
    // add fields
        .select(
            'pos t pid desc fu imgs.og imgs.tb ci exps bty brh tli lay tfo tsz tsy bo it ft prc ru dt curr cmsg askm tg url tstm high ctz',
        )
        .sort('pos')
        .exec();

    for (let block of blocks) {
        let blockJson = block.toJSON();

        allPagesToCreate[blockJson.pageId].blocks.push(blockJson);
    }
    allPagesToCreate = Object.values(allPagesToCreate);
    allPagesToCreate.sort((a, b) => {
        if (a.pageDetails.position > b.pageDetails.position) return 1;
        else if (a.pageDetails.position < b.pageDetails.position) return -1;
        else return 0;
    });
    return allPagesToCreate;
}

exports.createPagesFromTemplate = async ({
    user,
    templateId,
    firstPagePos = 'n',
    publicPages = false,
}) => {
    if (!Object.keys(templateData).includes(templateId))
        throw new BadRequest('This template was not found');

    const allPagesToCreate = await fetchTemplate({ templateId });
    /* console.dir(allPagesToCreate, { depth: null }); */

    const createPageDocs = [];
    const blockDocs = [];

    let pagePos = firstPagePos;

    for (let pageToCreate of allPagesToCreate) {
        const pageDetails = pageToCreate['pageDetails'];

        // Create page
        const pageId = mongoose.Types.ObjectId().toHexString();

        const pageDataForDoc = {
            _id: pageId,
            uid: user.id,
            name: pageDetails['name'],
            lay: pageDetails['layout'],
            pfc: pageDetails['profileColor'],
            cth: pageDetails["customTheme"],
            ctz: pageDetails["customize"],
            un: generatePageName(pageDetails['name']),
            pbl: publicPages,
            pos: pagePos,
            sb: pageDetails['showBio'],
            udet: {
                img: '',
                n: pageDetails['userDetails']['name'],
                bio: pageDetails['userDetails']['bio'],
            },
        };
        let image = pageDetails['userDetails']['image'];

        if (image && image.includes(env.S3_BUCKET_FILE_FOLDER)) {
            const assetKey = image
                .replace(`${env.S3_BUCKET_WEBSITE_URL}/`, '')
                .replace(`-150x150.webp`, '');
            const newKeys = await copyFiles({
                keys: [assetKey],
            });
            pageDataForDoc.udet.img = `${env.S3_BUCKET_WEBSITE_URL}/${newKeys[assetKey]}-150x150.webp`;
        }

        createPageDocs.push(pageDataForDoc);
        pagePos = midString(pagePos, '');

        // Create blocks for page
        let blockPos = 'n';
        for (let blockMeta of pageToCreate['blocks']) {
            const blockDoc = await createBlock({
                blockMeta,
                userId: user.id,
                pageId,
                blockPos,
            });

            blockDocs.push(blockDoc);
            blockPos = midString(blockPos, '');
        }
    }
    /*  console.dir({ blockDocs, createPageDocs }, { depth: null }); */
    await Page.insertMany(createPageDocs);
    await Block.insertMany(blockDocs);
};

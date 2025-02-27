/**
 * Module dependencies
 */

const mongoose = require('mongoose');
const moment = require('moment');
const C = require('../../lib/constants');
const env = require('../../config/env');
const _ = require('lodash');

/**
 * Utilities
 */

const jwt = require('../../lib/jwt');
const {
    emptyS3Directory,
    deleteMultiple,
    getObject,
} = require('../../utils/s3-operations');
const sanitizeHtml = require('sanitize-html');

/**
 * Models
 */

const Creator = mongoose.model(C.MODELS.WRITER_C);
const Client = mongoose.model(C.MODELS.CLIENT_C);
const TestimonialBlock = mongoose.model(C.MODELS.TESTIMONIAL_BLOCK);
const ImageBlock = mongoose.model(C.MODELS.IMAGE_BLOCK);
const LinkBlock = mongoose.model(C.MODELS.LINK_BLOCK);
const ProjectBlock = mongoose.model(C.MODELS.PROJECT_BLOCK);
const ExperienceBlock = mongoose.model(C.MODELS.EXPERIENCE_BLOCK);
const ServiceBlock = mongoose.model(C.MODELS.SERVICE_BLOCK);
const ImportedService = mongoose.model(C.MODELS.IMPORTED_SERVICE);
const PDFBlock = mongoose.model(C.MODELS.PDF_BLOCK);
const Block = mongoose.model(C.MODELS.BLOCK);
const TextEditor = mongoose.model(C.MODELS.TEXT_EDITOR);
const PageBreak = mongoose.model(C.MODELS.PAGE_BREAK);
const Page = mongoose.model(C.MODELS.PAGE);
const Theme = mongoose.model(C.MODELS.THEME);

/**
 * External Services
 */

const { notification } = require('../../messaging/index');
const {
    updateStateAndPersist,
    deleteSingleFileVersions,
    deleteFilesByKey,
    copyFiles,
} = require('../fileStore');
const scraperService = require('../../services/scraper');
const { checkDns, checkHTTPS } = require('../../services/checkDns');
const userService = require('../../services/db/user');
const agenda = require('../../services/agenda');

/*
 * Helpers
 */

const {
    generatePublicUrl,
    createEmptyProjectFile,
    updateFileV3,
    createEmptyTextEditorFile,
    textEditorSaveContent,
    generatePageName,
    cleanId,
    midString,
    createPagesFromTemplate,
    getLastNewPagePosition,
} = require('../helpers/writerHelper');

const {
    validatePhoneNumber,
    emailForAdminOnSignUp,
    onWriterOnboardOperations,
} = require('../helpers/userHelper');

const { createEmailFindRegex } = require('../../services/db/user');

// External Controllers

const collabControllers = require('./collab-v1.0');

// Errors
const { BadRequest } = require('../../lib/errors');

/**
 * Portfolio Controllers
 */

async function createTestimonial(testimonials, creatorId, curPos) {
    if (testimonials.length < 1) {
        return {
            testimonial: null,
            nextPos: curPos,
        };
    }
    let nextPos = curPos;
    const testimonial = {
        __t: C.MODELS.TESTIMONIAL_BLOCK,
        uid: creatorId,
        position: nextPos,
        tstm: [],
    };
    nextPos = midString(nextPos, '');
    const positions = ['n', 'u', 'x', 'z'];
    for (let i = 0; i < testimonials.length; i++) {
        testimonial.tstm.push({
            t: C.TESTIMONIAL_TYPE.LOGO,
            req: false,
            vf: true,
            cmp: '',
            img: '',
            rvt: '',
            pos: positions[i],
            cmp: testimonials[i].name,
            img: testimonials[i].logo,
        });
    }
    return { testimonial, nextPos };
}

async function createLinks(sampleLinks, creatorId, curPos) {
    const linksWithData = [];
    await Promise.all(
        _.map(sampleLinks, async (link) => {
            try {
                const data = await scraperService.scrapeArticle({
                    targetUrl: link,
                });
                linksWithData.push({ ...data });
            } catch (err) {
                // Error in fetching link
            }
        }),
    );
    let nextPos = curPos;
    const links = [];
    for (let i = 0; i < linksWithData.length; i++) {
        const newId = mongoose.Types.ObjectId().toHexString();
        links.push({
            _id: newId,
            __t: C.MODELS.LINK_BLOCK,
            uid: creatorId,
            t: linksWithData[i].title ? linksWithData[i].title : 'link',
            pul: await generatePublicUrl(
                linksWithData[i].title ? linksWithData[i].title : 'link',
                newId,
            ),
            ci: linksWithData[i].image ? linksWithData[i].image : '',
            url: linksWithData[i].url,
            desc: linksWithData[i].description
                ? linksWithData[i].description
                : '',
            pos: nextPos,
        });
        nextPos = midString(nextPos, '');
    }
    return { links, nextPos };
}

async function createImageBlocks(images, creatorId, curPos) {
    if (images.length < 1) {
        return {
            imageBlock: null,
            nextPos: curPos,
        };
    }
    const fileKeys = await updateStateAndPersist({
        fileIds: images,
        allowedTypes: ['image'],
    });
    let nextPos = curPos;

    const newId = mongoose.Types.ObjectId().toHexString();
    const imageBlock = {
        _id: newId,
        __t: C.MODELS.IMAGE_BLOCK,
        uid: creatorId,
        pos: nextPos,
        t: 'Work Sample',
        pul: await generatePublicUrl('title', newId),
        imgs: [],
        ci: '',
    };
    _.forEach(fileKeys, (file) => {
        imageBlock.imgs.push({
            iu: `${file.key}-webp.webp`,
            og: `${file.key}`,
        });
    });
    imageBlock.ci = imageBlock.imgs[0].iu;
    nextPos = midString(nextPos, '');

    return { imageBlock, nextPos };
}

async function createPdfBlocks(pdfs, creatorId, curPos) {
    const blocks = [];
    let nextPos = curPos;
    const fileIds = [];
    for (let ff of pdfs) {
        fileIds.push(ff.fileId, ff.coverId);
    }
    const fileKeys = await updateStateAndPersist({
        fileIds,
        allowedTypes: ['pdf', 'image'],
    });
    for (let i = 0; i < fileKeys.length - 1; i += 2) {
        const newId = mongoose.Types.ObjectId().toHexString();
        blocks.push({
            _id: newId,
            __t: C.MODELS.PDF_BLOCK,
            uid: creatorId,
            pos: nextPos,
            t: 'Work Sample',
            pul: await generatePublicUrl('title', newId),
            floc: fileKeys[i].key,
            ci: fileKeys[i + 1].key,
        });
        nextPos = midString(nextPos, '');
    }
    return { blocks, nextPos };
}

function linkFromDomain({ link }) {
    const positions = {
        facebook: 'b',
        linkedin: 'c',
        instagram: 'd',
        twitter: 'e',
        medium: 'f',
        behance: 'g',
        dribbble: 'h',
        youtube: 'i',
    };
    const fieldNames = [
        'facebook.com',
        'linkedin.com',
        'instagram.com',
        'twitter.com',
        'medium.com',
        'behance.com',
        'dribbble.com',
        'youtube.com',
    ];
    for (let field of fieldNames) {
        if (link.includes(field)) {
            return {
                [field.replace('.com', '')]: {
                    lnk: link,
                    pos: positions[field.replace('.com', '')],
                },
            };
        }
    }
    return {
        yw: {
            lnk: link,
            pos: 'a',
        },
    };
}

exports.setupPortfolio = async ({ user, data, templateId }) => {
    if (user.obs !== C.V3_CREATOR_ONBOARDING_STATES.STEP_SETUP) {
        throw new BadRequest(
            'Profile is already setup. Onboarding is complete',
        );
    }

    // Update basic details
    const {
        fullname,
        country,
        city,
        designation,
        role,
        skills,
        mobileCountry,
        mobile,
        theme,
    } = data;
    // First check validity if mobile number
    const validateMobile = validatePhoneNumber({ mobile, mobileCountry });
    if (!validateMobile) throw new BadRequest('Invalid mobile number');
    const mobileExists = await userService.mobileExists({
        mobileCountry,
        mobile,
    });
    if (mobileExists) throw new BadRequest('User with mobile already exists');

    user.n = { f: fullname, l: '' };
    user.adr.co = country;
    user.adr.ci = city;
    // for designation
    // In user schema use first value from role
    // In pages, use it from input
    user.pdg = role[0];
    user.mo = mobile;
    user.moc = mobileCountry;
    // Other data points
    // Not shown to user
    const { medium, experience, niche } = data;
    user.bio = niche;
    user.othd = {
        medium,
        experience,
        niche,
        roles: role,
        skills,
    };

    if (!templateId) {
        // Data we use to build the portfolio
        const { link, testimonials, sampleLinks, sampleUploads } = data;
        if (sampleLinks.length == 0 && sampleUploads.length == 0)
            throw new BadRequest(
                'Please provide one of sampleLinks or sampleUploads',
            );
        // The first position
        let curPos = 'n';
        // Create Testimonials
        let { testimonial, nextPos } = await createTestimonial(
            testimonials,
            user.id,
            curPos,
        );
        // Position of next block
        curPos = nextPos;

        // Create links
        let newLinks = await createLinks(sampleLinks, user.id, curPos);
        let links = newLinks.links;
        // will be position of next block
        curPos = newLinks.nextPos;

        // Separate images and pdfs
        const images = [];
        const pdfs = [];
        _.forEach(sampleUploads, (upload) => {
            if (upload.fileType == 'image') {
                images.push(upload.fileId);
            } else
                pdfs.push({ fileId: upload.fileId, coverId: upload.coverId });
        });

        // Create Image Blocks
        const newImageBlocks = await createImageBlocks(images, user.id, curPos);
        let imageBlock = newImageBlocks.imageBlock;
        // will be position of next block
        curPos = newImageBlocks.nextPos;

        // Create PDF Blocks
        const newPdfBlocks = await createPdfBlocks(pdfs, user.id, curPos);
        let pdfBlocks = newPdfBlocks.blocks;
        // will be position of next block
        curPos = newPdfBlocks.nextPos;

        // Create Service Block
        let serviceBlock = [];
        if (data.service) {
            const { title, description, price, currency } = data.service;
            const newId = mongoose.Types.ObjectId().toHexString();
            serviceBlock = [
                {
                    _id: newId,
                    __t: C.MODELS.SERVICE_BLOCK,
                    uid: user.id,
                    pos: curPos,
                    t: title,
                    desc:
                        description ||
                        'Hey, Thanks for showing interest in my content services. I will get back to you on this shortly!',
                    prc: price,
                    ru: '',
                    pul: await generatePublicUrl(title, newId),
                    curr: currency,
                    ft: C.SERVICE_BLOCK_FEES_TYPE.FIXED,
                },
            ];
        }
        const createDoc = [];
        if (testimonial) {
            createDoc.push(testimonial);
        }
        if (imageBlock) {
            createDoc.push(imageBlock);
        }
        if (links.length > 0) {
            createDoc.push(...links);
        }
        if (pdfBlocks.length > 0) {
            createDoc.push(...pdfBlocks);
        }
        if (serviceBlock.length > 0) {
            createDoc.push(...serviceBlock);
        }

        // Create page if not exists
        // For backwards compatibility with older users
        let page = await Page.findOne({
            uid: user.id,
        }).exec();
        if (!page) {
            page = new Page({
                uid: user.id,
                name: 'Homepage',
                un: generatePageName('Homepage'),
                pbl: true,
                pos: 'n',
            });
        }
        page.udet = {
            n: user.fullname,
            dsg: designation,
            bio: niche,
            scl: linkFromDomain({ link }),
        };
        if (theme) page.pfc = theme;
        await page.save();
        // Create Blocks
        const createDocWithPage = _.map(createDoc, (doc) => {
            return { ...doc, pid: page.id };
        });
        let result = [];
        if (createDocWithPage.length > 0) {
            result = await Block.insertMany(createDocWithPage);
        }
        user.obs = C.V3_CREATOR_ONBOARDING_STATES.STEP_NEW;
    } else {
        // Delete existing empty page
        await Page.deleteMany({
            uid: user.id,
        });
        // Create new pages using template
        await createPagesFromTemplate({
            user,
            templateId,
            firstPagePos: 'n',
            publicPages: true,
        });
        user.obs = C.V3_CREATOR_ONBOARDING_STATES.STEP_DONE;
    }

    await user.save();

    await onWriterOnboardOperations({ user });

    return {
        id: user.id,
        email: user.email,
        firstName: user.name ? user.name.first : null,
        lastName: user.name ? user.name.last : null,
        country: user.adr.co,
        penname: user.pn ? user.pn : null,
        mobileCountry: user.moc,
        mobile: user.mo,
        level: user.lv,
        onboardState: user.obs,
        role: user.__t,
        status: user.accountStatus,
        image: user.image,
    };
};

exports.updateSubmit = async ({ user }) => {
    const blocks = await Block.countDocuments({
        uid: user.id,
        __t: {
            $nin: [
                C.MODELS.SERVICE_BLOCK,
                C.MODELS.TESTIMONIAL_BLOCK,
                C.MODELS.EXPERIENCE_BLOCK,
            ],
        },
    }).exec();
    if (blocks < 5) {
        throw new BadRequest('Add at least 5 samples to submit portfolio');
    }
    const service = await ServiceBlock.countDocuments({
        uid: user.id,
    }).exec();
    if (service < 1)
        throw new BadRequest('Add atleast 1 service to submit portfolio');
    user.sbmt = true;
    await user.save();
    return {
        msg: 'Submitted',
    };
};

exports.updatePenname = async ({ user, penname }) => {
    /*  let exists = await User.exists({
        pn: penname,
    });
    exists = exists || C.EXCLUDE_USERNAMES.includes(penname); */
    const exists = await userService.pennameExists({ penname });
    if (exists) throw new BadRequest('Username already in use');
    user.pn = penname;
    await user.save();
    return {
        msg: 'username changed successfully',
        penname,
    };
};

exports.udpateUserDetails = async ({ user, data }) => {
    const { name, bio, designation, preferCollab } = data;
    if (typeof name == 'string') user.n.f = name;
    user.n.l = '';
    if (typeof bio == 'string') user.bio = bio;
    if (typeof designation == 'string') user.pdg = designation;
    if (typeof preferCollab == 'string') user.preferCollab = preferCollab;

    await user.save();

    return {
        msg: 'User details updated',
        ...data,
    };
};

exports.fetchUserDetails = async ({ user }) => {
    let experiences = user.experiences;
    experiences.sort(sortByPosition);
    return {
        image: user.image,
        name: user.fullname,
        bio: user.bio,
        designation: user.designation,
        experiences,
        preferCollab: user.preferCollab,
    };
};

exports.updateOnboardState = async ({ user, state, type }) => {
    if (type === 'onboardState') user.obs = state;
    else if (type == 'dnd') {
        // Only move in this order
        // not_done -> start -> done
        if (
            (user.onboarding.dd == 'not_done' && state == 'start') ||
            state == 'done'
        ) {
            user.onboarding[type] = state;
        }
    } else {
        user.onboarding[type] = state;
    }
    await user.save();
    return {
        msg: 'onboarding state changed',
        state,
    };
};

exports.seenReport = async ({ user }) => {
    user.otherDetails.report.reportSeen = true;
    await user.save();
    return {
        msg: 'Report marked seen',
    };
};

exports.setCustomDomain = async ({ user, domain }) => {
    domain = domain.toLowerCase();
    if (user.cdn !== domain) {
        if (domain.includes('passionbits.io'))
            throw new BadRequest('Domain not allowed');
        const findDomain = await Creator.findOne({
            cdn: domain,
        })
            .select('cdn')
            .exec();
        if (findDomain)
            throw new BadRequest(
                'Domain is already registered with another creator',
            );
        user.cdn = domain;
        await user.save();
    }

    return {
        msg: 'Custom domain set',
        domain,
    };
};

exports.customDomainCheck = async ({ user }) => {
    // Custom domain is added
    let added = typeof user.cdn == 'string' && user.cdn.length > 0;
    let dns = false,
        https = false;
    if (added) {
        // DNS and HTTPS connectivity
        dns = await checkDns({ domain: user.cdn });
        if (dns) https = await checkHTTPS({ domain: user.cdn });
    }

    return { added, dns, https, domain: user.cdn };
};

exports.deleteCustomDomain = async ({ user }) => {
    user.cdn = undefined;
    await user.save();
    return {
        msg: 'domain removed',
        domain: user.cdn,
    };
};

/**
 * * Page Controllers
 */

exports.createPage = async ({ user, name }) => {
    const count = await Page.countDocuments({
        uid: user.id,
    }).exec();
    if (count >= 100)
        throw new BadRequest('Currently maximum of 4 versions can be created');
    let page = new Page({
        uid: user.id,
        name,
        un: generatePageName(name),
        pbl: false,
        udet: {
            n: user.fullname,
            dsg: user.pdg,
        },
    });
    await page.save();
    page = page.toJSON();
    // Social Media links to be sent sorted by position
    const socialLinks = Object.keys(page.userDetails.socialLinks).map((key) => {
        return {
            [key]: page.userDetails.socialLinks[key],
        };
    });
    page.userDetails.socialLinks = socialLinks;
    page.customize.profileBackground = true;
    return {
        msg: 'New Page created',
        ...page,
    };
};

exports.updatePage = async ({ user, id, name }) => {
    const page = await Page.findOne({
        uid: user.id,
        _id: id,
    }).exec();
    if (!page) throw new BadRequest('No page was found with this id');
    // Are we updating page name
    if (name && page.name !== name) {
        page.name = name;
        page.un = generatePageName(name);
    }
    /*  // ! Or are we setting this page as homepage
    if (homepage) {
        page.homepage = true;
        // Take necessary fields from homepage and set in user schema
        user.n = { f: page.userDetails.name, l: '' };
        user.pdg = page.userDetails.dsg;
        user.img = page.userDetails.img;
        // If another page was set as homepage for this creator unset it
        const pageHome = await Page.findOneAndUpdate(
            {
                uid: user.id,
                hpg: true,
            },
            {
                $set: {
                    hpg: false,
                },
            },
        ).exec();
    } */

    await page.save();
    return {
        msg: 'Page Updated',
        id: page.id,
        name: page.name,
        homepage: page.homepage,
        urlName: page.un,
    };
};

exports.getPortfolioPages = async ({ user }) => {
    const pages = await Page.find({
        uid: user.id,
        pst: C.PAGE_STATES.CREATED,
    })
        .select('n uid un hpg')
        .exec();
    return {
        pages,
    };
};

function sortByPosition(a, b) {
    if (a.position > b.position) return 1;
    else if (a.position < b.position) return -1;
    else return 0;
}

exports.copyPage = async ({ user, pageId, position }) => {
    const page = await Page.findOne(
        { _id: pageId, uid: user.id },
        {},
        { lean: true },
    ).exec();
    if (!page)
        throw new BadRequest('Unable to copy. No page found with this id');
    if (page.pst == C.PAGE_STATES.COPYING)
        throw new BadRequest(
            'Cannot copy page when its still in copying state',
        );
    const count = await Page.countDocuments({
        uid: user.id,
    }).exec();
    if (count >= 100)
        throw new BadRequest('Currently maximum of 4 versions can be created');

    // * 1. Copy Page -- Fields to modify [name, un, userDetails.image, position]
    let pageObject = page;
    cleanId(pageObject);
    const newPageObj = pageObject;
    const newPage = new Page(newPageObj);
    newPage.pst = C.PAGE_STATES.COPYING;
    newPage.name = `${newPage.name} Copy`;
    newPage.un = generatePageName(`${newPage.name}`);
    // newPage.hpg = false;
    newPage.udet.img = '';
    newPage.pos = position;
    newPage.pbl = false;

    let keysToCopy = [];
    const oldPageImage = page.udet.img
        .replace(`${env.S3_BUCKET_WEBSITE_URL}/`, '')
        .replace(`-150x150.webp`, '');
    if (
        oldPageImage.length > 0 &&
        // Older image path was /profile-150x150.webp
        oldPageImage.includes(env.S3_BUCKET_FILE_FOLDER)
    ) {
        const keysToCopy = [oldPageImage];
        keysToCopy.push(oldPageImage);
    }

    if (
        page.ctz &&
        page.ctz.pbi &&
        typeof page.ctz.pbi == 'string' &&
        page.ctz.pbi.length > 0
    ) {
        let oldPbi = page.ctz.pbi.replace(`${env.S3_BUCKET_WEBSITE_URL}/`, '');
        keysToCopy.push(oldPbi);
    }

    const newKeys = await copyFiles({ keys: keysToCopy });

    if (
        oldPageImage.length > 0 &&
        // Older image path was /profile-150x150.webp
        oldPageImage.includes(env.S3_BUCKET_FILE_FOLDER)
    ) {
        newPage.userDetails.image = `${env.S3_BUCKET_WEBSITE_URL}/${newKeys[oldPageImage]}-150x150.webp`;
    }

    if (
        page.ctz &&
        page.ctz.pbi &&
        typeof page.ctz.pbi == 'string' &&
        page.ctz.pbi.length > 0
    ) {
        let oldPbi = page.ctz.pbi.replace(`${env.S3_BUCKET_WEBSITE_URL}/`, '');
        newPage.customize.backgroundImage = `${env.S3_BUCKET_WEBSITE_URL}/${newKeys[oldPbi]}`;
    }

    await newPage.save();

    // Schedule agenda for now and copy all blocks of page asynchronously
    agenda.now('copy_page', {
        pageId,
        newPageId: newPage.id,
        userId: user.id,
    });

    /*  console.log(pageObject, newPage); */

    const toSet = {
        ...newPage.toJSON(),
        experiences: [],
        testimonials: [],
        blocks: [],
        hidden: [],
    };
    // Social Media links to be sent sorted by position
    const socialLinks = Object.keys(toSet.userDetails.socialLinks).map(
        (key) => {
            return {
                [key]: toSet.userDetails.socialLinks[key],
            };
        },
    );
    socialLinks.sort((a, b) => {
        a = a[Object.keys(a)[0]].position;
        b = b[Object.keys(b)[0]].position;

        if (a > b) return 1;
        else if (a < b) return -1;
        else return 0;
    });
    toSet.userDetails.socialLinks = socialLinks;

    return {
        msg: 'Page Copied',
        page: toSet,
    };
};

exports.getPageState = async ({ user, id }) => {
    const page = await Page.findOne({
        _id: id,
        uid: user.id,
    })
        .select('pst')
        .exec();
    return {
        pageState: page.pageState,
    };
};

exports.deletePage = async ({ user, id }) => {
    const page = await Page.findOne({ _id: id, uid: user.id }).exec();
    if (!page) throw new BadRequest('No page found with this id');

    const totalPages = await Page.countDocuments({
        uid: user.id,
        pbl: true,
    });
    if (totalPages <= 1 && page.public)
        throw new BadRequest('Must have atleast one public page on portfolio');

    // If page has a imported service block don't delete
    const findImported = await Block.countDocuments({
        pid: id,
        __t: C.MODELS.IMPORTED_SERVICE,
    }).exec();
    if (findImported > 0)
        throw new BadRequest('Page has imported block, cannot be deleted');

    // ?? Delete page image
    // ?? Delete page customize background image
    // if (page.homepage) throw new BadRequest('Homepage cannot be deleted');
    if (page.pst == C.PAGE_STATES.COPYING)
        throw new BadRequest(
            'Cannot delete page when its still in copying state',
        );
    const blocksInPage = await Block.find({
        pid: id,
    })
        .select('__t ci floc imgs')
        .exec();

    const deletedBlocks = await Block.deleteMany({
        pid: id,
    }).exec();
    const deletedPage = await Page.deleteOne({
        _id: id,
    }).exec();
    let files = [];
    const toDelete = [];
    // Delete stored files of blocks from s3
    _.forEach(blocksInPage, async (block) => {
        if (
            block.type == C.MODELS.IMAGE_BLOCK ||
            block.type == C.MODELS.PROJECT_BLOCK
        ) {
            // Remove Image objects from S3

            await Promise.all(
                _.map(block.imgs, async (img) => {
                    if (img) {
                        // original
                        const originalKey = img.og;
                        files.push(originalKey);
                        // Remove all versions of image
                        const versions = Object.values(
                            C.PORTFOLIO_IMAGE_VERSIONS,
                        );
                        for (let vr of versions) {
                            files.push(`${originalKey}-${vr}.webp`);
                        }
                    }
                }),
            );
        }
        if (block.type == C.MODELS.PROJECT_BLOCK) {
            // Remove content file from bucket
            await emptyS3Directory(
                env.S3_BUCKET_USER_DATA,
                `${user.id}/${C.MODELS.PROJECT_BLOCK}/${block.id}/`,
            );
        }
        if (block.type == C.MODELS.PDF_BLOCK) {
            toDelete.push(block.floc);
            if (block.ci.length > 0) {
                toDelete.push(block.ci);
            }
        }
    });
    // Find text editor of this page
    const editor = await TextEditor.findOne({
        uid: user.id,
        pid: id,
    }).exec();
    if (editor) {
        // Delete editor images
        await Promise.all(
            _.map(editor.imgs, async (img) => {
                if (img) {
                    // original
                    const originalKey = img.og;
                    files.push(originalKey);
                    // Remove all versions of image
                    const versions = Object.values(C.PORTFOLIO_IMAGE_VERSIONS);
                    for (let vr of versions) {
                        files.push(`${originalKey}-${vr}.webp`);
                    }
                }
            }),
        );
        // Delete editor file
        files.push(`text-editor/${user.id}-${editor.id}`);
        // Delete document
        await TextEditor.deleteOne({
            uid: user.id,
            pid: id,
        }).exec();
    }
    if (files.length > 0) {
        // Remove from s3 (tortoise); delete documents
        await deleteMultiple(env.S3_BUCKET_USER_DATA, files);

        // Remove text-editor file
        files = files.filter((key) => !key.includes('text-editor/'));

        await deleteFilesByKey({ keys: files });
    }
    if (toDelete.length > 0) {
        await deleteSingleFileVersions({ keys: toDelete });
    }
    return {
        msg: 'Page removed',
    };
};

exports.updatePageImage = async ({ user, fileId, pageId }) => {
    const page = await Page.findOne({ _id: pageId, uid: user.id }).exec();
    if (!page) throw new BadRequest('No page found with this id');
    // First remove older image files
    if (page.userDetails.img) {
        let oldImgOriginal = page.userDetails.img.replace(
            env.S3_BUCKET_WEBSITE_URL + '/',
            '',
        );
        oldImgOriginal = oldImgOriginal.replace('-150x150.webp', '');
        const filesToRemove = [];
        // This condition is checked for backwards compatibility
        // Old Image path: userId/profile
        if (oldImgOriginal.includes(env.S3_BUCKET_FILE_FOLDER)) {
            filesToRemove.push(oldImgOriginal);
            // Remove resized versions of older image
            const versions = Object.values(C.PORTFOLIO_IMAGE_VERSIONS);
            for (let vr of versions) {
                filesToRemove.push(`${oldImgOriginal}-${vr}.webp`);
            }
        }
        if (filesToRemove.length > 0) {
            // Remove from s3 (tortoise); delete documents
            await deleteMultiple(env.S3_BUCKET_USER_DATA, filesToRemove);
            await deleteFilesByKey({ keys: filesToRemove });
        }
        // also update in db, so that if for some reason setting new image files operation fails, we are not left with the case where -
        // image was deleted in s3 but its url is set in database
        page.userDetails.img = '';
        await page.save();
    }
    // Now save new image using new fileId
    const fileIds = [fileId];
    // Create Image sub documents
    // Update state of files in db and move objects from 'mayfly' to 'tortoise' directory
    const fileKeys = await updateStateAndPersist({
        fileIds,
        allowedTypes: ['image'],
    });
    _.forEach(fileKeys, (file) => {
        const originalPath = `${env.S3_BUCKET_WEBSITE_URL}/${file.key}`;
        page.userDetails.img = `${originalPath}-150x150.webp`;
    });
    await page.save();
    /*   if (page.homepage) {
        // ! If page is homepage set this image as users image
        user.img = page.userDetails.img;
        await user.save();
    } */
    return {
        location: page.userDetails.img,
    };
};

exports.deletePageImage = async ({ user, pageId }) => {
    const page = await Page.findOne({ _id: pageId, uid: user.id }).exec();
    if (!page) throw new BadRequest('No page found with this id');
    // First remove older image files
    if (page.userDetails.img) {
        let oldImgOriginal = page.userDetails.img.replace(
            env.S3_BUCKET_WEBSITE_URL + '/',
            '',
        );
        oldImgOriginal = oldImgOriginal.replace('-150x150.webp', '');
        const filesToRemove = [];
        // This condition is checked for backwards compatibility
        if (oldImgOriginal.includes(env.S3_BUCKET_FILE_FOLDER)) {
            filesToRemove.push(oldImgOriginal);
            // Remove resized versions of older image
            const versions = Object.values(C.PORTFOLIO_IMAGE_VERSIONS);
            for (let vr of versions) {
                filesToRemove.push(`${oldImgOriginal}-${vr}.webp`);
            }
        }
        if (filesToRemove.length > 0) {
            // Remove from s3 (tortoise); delete documents
            await deleteMultiple(env.S3_BUCKET_USER_DATA, filesToRemove);
            await deleteFilesByKey({ keys: filesToRemove });
        }
        page.userDetails.img = '';
        await page.save();
        /*   if (page.homepage) {
            // ! If page is homepage, remove user image also
            user.img = '';
            await user.save();
        } */
    }
    return {
        msg: 'image removed',
    };
};

exports.updatePageDetails = async ({ data, user, pageId }) => {
    const page = await Page.findOne({
        uid: user.id,
        _id: pageId,
    }).exec();
    if (!page)
        throw new BadRequest('No Page found with this pageId for this creator');
    const { name, bio, designation, socialLink } = data;
    page.userDetails.name = name;
    page.userDetails.bio = bio;
    page.userDetails.designation = designation;
    if (Array.isArray(socialLink) && socialLink.length > 0) {
        for (let soc of socialLink) {
            page.userDetails.socialLinks[soc.field] = {
                link: soc.link,
                pos: page.userDetails.socialLinks[soc.field].pos,
            };
        }
    }
    // ! Remove
    /* if (page.homepage) {
        // If we are updating homepage
        // Reflect necessary fields in user schema also
        user.n.f = name;
        user.pdg = designation;
    } */
    await page.save();
    await user.save();
    return {
        msg: 'profile updated',
        ...data,
    };
};

exports.updatePageSocialLinkPosition = async ({ user, data, pageId }) => {
    const page = await Page.findOne({
        uid: user.id,
        _id: pageId,
    }).exec();
    if (!page)
        throw new BadRequest('No Page found with this pageId for this creator');
    const { field, position } = data;
    page.userDetails.socialLinks[field] = {
        position,
        link: page.userDetails.socialLinks[field].link,
    };
    await page.save();
    return {
        field,
        position,
    };
};

exports.updatePageLayoutAndColor = async ({ user, data, pageId }) => {
    const page = await Page.findOne({
        uid: user.id,
        _id: pageId,
    }).exec();
    if (!page)
        throw new BadRequest('No Page found with this pageId for this creator');
    const { layout, profileColor, themeId } = data;
    if (layout) page.layout = layout;
    if (profileColor) {
        page.profileColor = profileColor;
        page.cth = null;
    }

    if (themeId) {
        const theme = await Theme.findOne({
            uid: user.id,
            _id: themeId,
        })
            .select('_id')
            .exec();
        if (!theme) throw new BadRequest('Theme not found');
        page.cth = themeId;
    }

    await page.save();
    return { msg: 'update success', ...data };
};

exports.customizePage = async ({ user, data, pageId }) => {
    const page = await Page.findOne({
        uid: user.id,
        _id: pageId,
    })
        .select('ctz')
        .exec();
    if (!page)
        throw new BadRequest('No Page found with this pageId for this creator');
    for (let key of Object.keys(data)) {
        if (key !== 'backgroundImage' && data[key] !== null) {
            page.customize[key] = data[key];
        }
    }

    const { borderColor, profileBorder } = data;
    if (borderColor !== null && profileBorder === null) {
        // If borderColor is being set, make profileBorder 'true' if profileBorder === null (when profileBorder is not explicity being set)
        page.customize.profileBorder = true;
    }

    // Handling background image separately
    const backgroundImage = data.backgroundImage;
    if (backgroundImage) {
        // intended operation - new image upload
        if (page.customize.backgroundImage) {
            // if a image is already set
            // remove it
            const key = page.customize.backgroundImage;
            await deleteSingleFileVersions({ key });
        }
        const [file] = await updateStateAndPersist({
            fileIds: [backgroundImage],
            allowedTypes: ['image'],
        });
        page.customize.backgroundImage = file.key;
        if (data.profileBackground === null) {
            // if profileBackground is not explicitly being changed, make it true
            page.customize.profileBackground = true;
        }
    } else if (backgroundImage === '') {
        // intended operation - unset previously set image
        if (page.customize.backgroundImage) {
            // if a image is already set
            // remove it
            const key = page.customize.backgroundImage;
            await deleteSingleFileVersions({ key });
        }
        page.customize.backgroundImage = '';
    }
    await page.save();
    return {
        msg: 'Fields changed',
        ...page.customize.toJSON(),
        backgroundImage: page.customize.backgroundImage
            ? `${env.S3_BUCKET_WEBSITE_URL}/${page.customize.backgroundImage}`
            : page.customize.backgroundImage,
    };
};

exports.resetCustomize = async ({ user, pageId }) => {
    const page = await Page.findOne({
        uid: user.id,
        _id: pageId,
    })
        .select('ctz')
        .exec();
    if (!page)
        throw new BadRequest('No Page found with this pageId for this creator');
    const pageAsJson = page.toJSON();
    const backgroundImage = pageAsJson.customize.backgroundImage;

    for (let key of Object.keys(pageAsJson.customize)) {
        if (!['blockHighlight', 'highlightColor'].includes(key))
            page.customize[key] = null;
    }

    if (backgroundImage) {
        const key = backgroundImage;
        await deleteSingleFileVersions({ key });
    }
    await page.save();
    return {
        msg: 'Page customization reset to default',
    };
};

exports.createNewTheme = async ({ user, data }) => {
    const backgroundImage = data.backgroundImage;
    delete data.backgroundImage;

    const newTheme = new Theme({
        uid: user.id,
        ...data,
    });
    if (backgroundImage) {
        const [file] = await updateStateAndPersist({
            fileIds: [backgroundImage],
            allowedTypes: ['image'],
        });
        newTheme.backgroundImage = file.key;
    }
    await newTheme.save();
    return {
        msg: 'new theme created successfully',
        ...newTheme.toJSON(),
        backgroundImage: newTheme.backgroundImage
            ? `${env.S3_BUCKET_WEBSITE_URL}/${newTheme.backgroundImage}`
            : newTheme.backgroundImage,
    };
};

exports.updateTheme = async ({ user, data, id }) => {
    const theme = await Theme.findOne({
        _id: id,
        uid: user.id,
    }).exec();
    if (!theme) throw new BadRequest('Theme not found');
    const {
        name,
        backgroundImage,

        ...themeFields
    } = data;

    theme.name = name;

    for (let key of Object.keys(themeFields)) {
        theme[key] = themeFields[key];
    }

    if (
        backgroundImage &&
        backgroundImage.length == 24 &&
        mongoose.isValidObjectId(backgroundImage)
    ) {
        // If backgroundImage is of type objectId (a fileUpload id)

        if (theme.backgroundImage) {
            // delete existing
            const key = theme.backgroundImage;
            await deleteSingleFileVersions({ key });
        }
        // Update to a new background image
        const [file] = await updateStateAndPersist({
            fileIds: [backgroundImage],
            allowedTypes: ['image'],
        });
        theme.backgroundImage = file.key;
    } else if (!!!backgroundImage) {
        // delete existing image
        if (theme.backgroundImage) {
            // delete existing
            const key = theme.backgroundImage;
            await deleteSingleFileVersions({ key });
        }
    }

    await theme.save();
    return {
        msg: 'Theme updated',
        ...theme.toJSON(),
        backgroundImage: theme.backgroundImage
            ? `${env.S3_BUCKET_WEBSITE_URL}/${theme.backgroundImage}`
            : theme.backgroundImage,
    };
};

exports.deleteTheme = async ({ user, id }) => {
    const theme = await Theme.findOne({
        _id: id,
        uid: user.id,
    })
        .select('pbi')
        .exec();
    if (!theme) throw new BadRequest('Theme not found');

    // to be deleted
    const backgroundImage = theme.backgroundImage;

    // For all pages using this theme, set to default ClassicBlue and customTheme to null
    await Page.updateMany(
        {
            uid: user.id,
            cth: id,
        },
        {
            $set: {
                cth: null,
                pfc: C.PORTFOLIO_THEMES.CLASSIC_BLUE,
            },
        },
    ).exec();

    // Now delete this theme
    await Theme.deleteOne({ _id: id, uid: user.id });

    if (backgroundImage) {
        const key = backgroundImage;
        await deleteSingleFileVersions({ key });
    }

    return {
        msg: 'theme deleted',
        id,
    };
};

exports.fetchAllThemes = async ({ user }) => {
    const themes = await Theme.find({
        uid: user.id,
    }).exec();
    return {
        themes,
    };
};

exports.selectThemeForPage = async ({ user, pageId, themeId }) => {
    const theme = await Theme.findOne({
        uid: user.id,
        _id: themeId,
    })
        .select('_id')
        .exec();
    if (!theme) throw new BadRequest('Theme not found');

    const page = await Page.findOneAndUpdate(
        {
            _id: pageId,
            uid: user.id,
        },
        {
            $set: {
                cth: themeId,
            },
        },
    ).exec();
    if (!page) throw new BadRequest('Page not found');

    return {
        msg: 'page theme changed',
    };
};

exports.useTemplate = async ({ user, templateId }) => {
    const lastPagePosition = await getLastNewPagePosition({ userId: user.id });

    await createPagesFromTemplate({
        user,
        templateId,
        firstPagePos: lastPagePosition,
    });

    return {
        msg: 'template set up success',
    };
};

exports.changePageVisibility = async ({ user, pageId, public, position }) => {
    const page = await Page.findOne({ _id: pageId, uid: user.id }).exec();
    if (!page) throw new BadRequest('No page found with this id');

    page.position = position;

    if (page.pst == C.PAGE_STATES.COPYING)
        throw new BadRequest(
            'Cannot perform this operation on page when its still in copying state',
        );

    if (public) {
        if (!position)
            throw new BadRequest('Position is required to make page public');
        // Page should have atleast one visible component
        const totalBlocks = await Block.countDocuments({
            uid: user.id,
            pid: pageId,
            __t: {
                $nin: [C.MODELS.EXPERIENCE_BLOCK, C.MODELS.TESTIMONIAL_BLOCK],
            },
        }).exec();
        const experienceBlock = await ExperienceBlock.findOne({
            uid: user.id,
            pid: pageId,
        })
            .select('exps')
            .exec();
        const testimonialBlock = await TestimonialBlock.findOne({
            uid: user.id,
            pid: pageId,
        })
            .select('tstm')
            .exec();
        const hasVisibleTestimonials = false;
        if (testimonialBlock) {
            _.find(testimonialBlock.tstm, (tstm) => {
                return tstm.req == false;
            });
        }
        if (
            page.showBio ||
            totalBlocks > 0 ||
            (experienceBlock && experienceBlock.exps.length > 0) ||
            hasVisibleTestimonials
        ) {
            page.public = true;
        } else
            throw new BadRequest(
                'Page should have atleast one visible components in public view',
            );
    } else {
        // Atleast one page should be public
        const totalPublic = await Page.countDocuments({
            uid: user.id,
            pbl: true,
        }).exec();
        if (totalPublic <= 1 && page.public) {
            throw new BadRequest(
                'Atleast one page should be public on portflio',
            );
        }
        page.public = false;
    }
    await page.save();
    return {
        msg: 'Page visibility changed',
        public,
    };
};

exports.showHidePageBioSection = async ({ user, pageId, showBio }) => {
    const page = await Page.findOne({ _id: pageId, uid: user.id }).exec();
    if (!page) throw new BadRequest('No page found with this id');

    page.showBio = showBio;
    await page.save();
    return {
        msg: 'Page bio visibility changed',
        showBio,
    };
};

exports.changePagePosition = async ({ user, pageId, position }) => {
    const page = await Page.findOneAndUpdate(
        {
            _id: pageId,
            uid: user.id,
        },
        {
            $set: {
                pos: position,
            },
        },
    ).exec();
    if (!page) throw new BadRequest('Page not found by this id for this user');
    return {
        msg: 'Page position changed',
        position,
    };
};

exports.fetchAllPageNames = async ({ user }) => {
    const pages = await Page.find({
        uid: user.id,
    })
        .select('n udet.n')
        .exec();

    return {
        pages,
    };
};

/**
 * Testimonial Controllers
 */

exports.testimonialViaEmail = async ({
    creator,
    email,
    reqMessage,
    position,
    pageId,
    id,
}) => {
    const page = await Page.findOne({
        uid: creator.id,
        _id: pageId,
    }).exec();
    if (!page)
        throw new BadRequest('No page found by this pageId for this creator');
    if (page.pst == C.PAGE_STATES.COPYING)
        throw new BadRequest('Please wait while we complete copying your page');

    let testimonialBlock;
    if (id) {
        // We want to append to an existing testimonial block
        // Find the testimonial block to append
        testimonialBlock = await TestimonialBlock.findOne({
            uid: creator.id,
            _id: id,
        }).exec();
        if (!testimonialBlock)
            throw new BadRequest('Testimonial block was not found');
    } else {
        // We want to create a new testimonial block on the page by pageId
        testimonialBlock = new TestimonialBlock({
            uid: creator.id,
            pid: pageId,
            // position of new block
            position,
        });
    }

    // check if creator has already requested from email
    for (let tr of testimonialBlock.tstm) {
        if (tr.email.toLowerCase() === email.toLowerCase())
            throw new BadRequest('Already requested testimonial', 'CRPL107');
    }

    // Find a client on-platform with this email
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
        link: '',
    };

    /**
     * * If client with email is present, this testimonial is for an on-platform client
     */
    if (onPlatformClient) {
        clientType = 'on-platform';

        notificationType = C.NOTIF_USECASES[C.ROLES.WRITER_C].TESTIMONIAL_ON;
        notificationDetails = {
            email: onPlatformClient.e,
            clientName: onPlatformClient.n.f,
            creatorName: creator.fullname,
            // TODO: Fix this
            projectName: '',
            reqMessage,
            link: '',
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
    // console.log(token);
    notificationDetails.link = link;

    const doc = testimonialBlock.tstm.create({
        _id: testimonialId,
        t: C.TESTIMONIAL_TYPE.TEXT,
        e: email,
        req: true,
        vf: false,
        // If it is a new testimonial block
        // Initial position of this testimonial is 'n'. Algorithm returns 'n' for two empty strings
        // Otherwise use 'field' from request
        pos: testimonialBlock.isNew ? 'n' : position,
    });

    testimonialBlock.tstm.push(doc);

    await notification.send({
        usecase: notificationType,
        role: C.ROLES.WRITER_C,
        email: notificationDetails,
    });

    let response = { ...doc.toJSON() };
    if (testimonialBlock.isNew) {
        response = { ...testimonialBlock.toJSON() };
    }
    await testimonialBlock.save();
    return {
        msg: 'testimonial request email sent',
        ...response,
        block_id: testimonialBlock.id,
    };
};

exports.addBrandLogo = async ({
    creator,
    customize,
    company,
    logo,
    position,
    fileId,
    reviewText,
    pageId,
    id,
}) => {
    const page = await Page.findOne({
        uid: creator.id,
        _id: pageId,
    }).exec();
    if (!page)
        throw new BadRequest('No page found by this pageId for this creator');
    if (page.pst == C.PAGE_STATES.COPYING)
        throw new BadRequest('Please wait while we complete copying your page');
    // We allow both options
    // Upload logo or use external url of logo

    let testimonialBlock;
    if (id) {
        // We want to append to an existing testimonial block
        // Find the testimonial block to append
        testimonialBlock = await TestimonialBlock.findOne({
            uid: creator.id,
            _id: id,
        }).exec();
        if (!testimonialBlock)
            throw new BadRequest('Testimonial block was not found');
    } else {
        // We want to create a new testimonial block on the page by pageId
        testimonialBlock = new TestimonialBlock({
            uid: creator.id,
            pid: pageId,
            // position of new block
            position,
        });
    }

    const { highlight, customTitle, blockTitle, layout, slideshowTime } =
        customize;
    testimonialBlock.highlight = highlight;
    testimonialBlock.customize.customTitle = customTitle;
    testimonialBlock.customize.blockTitle = blockTitle;
    testimonialBlock.customize.layout = layout;
    testimonialBlock.customize.slideshowTime = slideshowTime;

    const logo_testimonaial = testimonialBlock.tstm.create({
        t: C.TESTIMONIAL_TYPE.LOGO,
        req: false,
        vf: true,
        cmp: '',
        img: '',
        rvt: reviewText,
        // If it is a new testimonial block
        // Initial position of this testimonial is 'n'. Algorithm returns 'n' for two empty strings
        // Otherwise use 'field' from request
        pos: testimonialBlock.isNew ? 'n' : position,
    });
    logo_testimonaial.cmp = company;
    // If we are uploaded logo
    if (fileId) {
        // Create Image sub documents
        // Update state of files in db and move objects from 'mayfly' to 'tortoise' directory
        const [file] = await updateStateAndPersist({
            fileIds: [fileId],
            allowedTypes: ['image'],
        });
        const originalPath = `${env.S3_BUCKET_WEBSITE_URL}/${file.key}`;
        logo_testimonaial.img = originalPath;
    } else {
        // If we used external url for logo
        logo_testimonaial.img = logo;
    }

    testimonialBlock.tstm.push(logo_testimonaial);

    let response = { ...logo_testimonaial.toJSON() };
    if (testimonialBlock.isNew) {
        response = { ...testimonialBlock.toJSON() };
    }
    await testimonialBlock.save();
    return {
        msg: 'logo added',
        ...response,
        block_id: testimonialBlock.id,
    };
};

exports.updateBrandLogo = async ({ creator, logoId, id, reviewText }) => {
    let testimonialBlock = await TestimonialBlock.findOne({
        uid: creator.id,
        _id: id,
    }).exec();
    if (!testimonialBlock)
        throw new BadRequest('Testimonial Block not found on this page');
    const testimonial = testimonialBlock.tstm.id(logoId);
    if (!testimonial) throw new BadRequest('Testimonial not found');
    if (testimonial.t !== C.TESTIMONIAL_TYPE.LOGO)
        throw new BadRequest('Description of only brand logos can be changed');
    testimonial.reviewText = reviewText;
    await testimonial.save();
    await testimonialBlock.save();
    return {
        msg: 'Description of testimonial updated',
        id,
        logoId,
        reviewText,
        block_id: testimonialBlock.id,
    };
};

exports.deleteTestimonial = async ({ creator, testimonialId, id }) => {
    // Find the testimonial block of this creator
    let testimonialBlock = await TestimonialBlock.findOne({
        uid: creator.id,
        _id: id,
        'tstm._id': testimonialId,
    }).exec();
    if (!testimonialBlock)
        throw new BadRequest(
            'No testimonial block found with this testimonial',
        );
    const doc = testimonialBlock.tstm.id(testimonialId);
    if (!doc) throw new BadRequest('testimonial not found');
    await doc.remove();
    await testimonialBlock.save();
    // Delete testimonial block
    if (testimonialBlock.tstm.length == 0) {
        await TestimonialBlock.findOneAndRemove({
            _id: testimonialBlock.id,
        }).exec();
    }
    // If we  uploaded logo
    // delete logo from bucket
    if (
        doc.t === C.TESTIMONIAL_TYPE.LOGO &&
        doc.img.includes(env.S3_BUCKET_WEBSITE_URL)
    ) {
        const key = doc.img.replace(env.S3_BUCKET_WEBSITE_URL + '/', '');
        await deleteSingleFileVersions({ key });
    }
    return {
        msg: 'testimonial removed',
        id: testimonialId,
        block_id: testimonialBlock.id,
    };
};

exports.changeTestimonialPosition = async ({ creator, id, position }) => {
    // ?? Include pageId in find for faster search
    let testimonialBlock = await TestimonialBlock.findOne({
        uid: creator.id,
        'tstm._id': id,
    }).exec();
    if (!testimonialBlock)
        throw new BadRequest(
            'No testimonial block found with this testimonial',
        );
    const doc = testimonialBlock.tstm.id(id);
    if (!doc) throw new BadRequest('testimonial not found');
    doc.pos = position;
    await doc.save();
    await testimonialBlock.save();
    return {
        msg: 'testimonial position changed',
        id,
        position,
        block_id: testimonialBlock.id,
    };
};

exports.customizeTestimonial = async ({ user, data, id }) => {
    const block = await TestimonialBlock.findOne({
        _id: id,
        uid: user.id,
    })
        .select('ctz high')
        .exec();

    if (!block) throw new BadRequest('Block not found');
    const { highlight, customTitle, blockTitle, layout, slideshowTime } = data;
    block.highlight = highlight;
    block.customize.customTitle = customTitle;
    block.customize.blockTitle = blockTitle;
    block.customize.layout = layout;
    block.customize.slideshowTime = slideshowTime;

    await block.save();
    return {
        msg: 'customization saved',
        ...data,
    };
};

/**
 * Image Block Controllers
 */

exports.addNewImageBlock = async ({ user, data, customize }) => {
    const { pageId, position, title, description, tags, fileIds, category } =
        data;
    const page = await Page.findOne({
        uid: user.id,
        _id: pageId,
    }).exec();
    if (!page)
        throw new BadRequest('No page found by this pageId for this creator');
    if (page.pst == C.PAGE_STATES.COPYING)
        throw new BadRequest('Please wait while we complete copying your page');
    const newId = mongoose.Types.ObjectId().toHexString();
    // Create public url from title
    const publicUrl = await generatePublicUrl(title, newId);
    // Create image block document
    const block = new ImageBlock({
        _id: newId,
        uid: user.id,
        pos: position,
        t: title,
        desc: description,
        tg: tags,
        pul: publicUrl,
        ctg: category,
        pid: pageId,
    });
    // Create Image sub documents
    // Update state of files in db and move objects from 'mayfly' to 'tortoise' directory

    // Split image and thumb into two arrays
    const imageFileIds = [];
    const thumbnailIds = [];
    _.forEach(fileIds, (file) => {
        imageFileIds.push(file.fileId);
        thumbnailIds.push(file.thumbId);
    });

    // Upload images
    const imageKeys = await updateStateAndPersist({
        fileIds: imageFileIds,
        allowedTypes: ['image'],
    });

    const thumbKeys = await updateStateAndPersist({
        fileIds: thumbnailIds,
        allowedTypes: ['image'],
    });

    _.forEach(imageKeys, (file, index) => {
        block.imgs.push({
            iu: `${file.key}-webp.webp`,
            og: `${file.key}`,
            tb: `${thumbKeys[index].key}`,
        });
    });

    // Cover image of ImageBlock is the first image of block
    block.ci = block.imgs[0].iu;

    // Customize
    const { highlight, blockFormat } = customize;
    block.highlight = highlight;
    block.customize.blockFormat = blockFormat;

    await block.save();

    let prefix = env.S3_BUCKET_WEBSITE_URL;
    const images = _.map(block.images, (image) => {
        return {
            original: image.original ? `${prefix}/${image.original}` : '',
            imageUrl: image.imageUrl ? `${prefix}/${image.imageUrl}` : '',
            thumbnail: image.thumbnail ? `${prefix}/${image.thumbnail}` : '',
            extension: `${image.extension}`,
            id: image.id,
        };
    });
    return {
        msg: 'image block added',
        id: block.id,
        pageId,
        position,
        title,
        description,
        tags,
        category,
        images,
        type: block.type,
        userId: block.userId,
        coverImage: `${env.S3_BUCKET_WEBSITE_URL}/${block.ci}`,
        public_url: block.pul,
        block_id: block.id,
        customize,
        highlight
    };
};

exports.updateImageBlock = async ({ id, user, data }) => {
    const { title, description, tags, fileIds, newThumbs, category } = data;

    let block = await ImageBlock.findOne({ uid: user.id, _id: id }).exec();
    if (!block) throw new BadRequest('Image block not found');
    if (block.title !== title) {
        // If title changed, change public url
        const publicUrl = await generatePublicUrl(title, id, true, block.pul);
        block.pul = publicUrl;
    }
    // Update other fields
    block.t = title;
    block.desc = description;
    block.tg = tags;
    block.ctg = category;

    if (C.MAX_IN_IMAGE_BLOCK - block.imgs.length < fileIds.length) {
        throw new BadRequest(
            `Maximum ${C.MAX_IN_IMAGE_BLOCK} images can be added to image block`,
        );
    }
    if (fileIds.length > 0) {
        // Create Image sub documents
        // Update state of files in db and move objects from 'mayfly' to 'tortoise' directory
        /*   const fileKeys = await updateStateAndPersist({
            fileIds,
            allowedTypes: ['image'],
        });
        _.forEach(fileKeys, (file) => {
            block.imgs.push({
                iu: `${file.key}-webp.webp`,
                og: `${file.key}`,
            });
        }); */

        // Split image and thumb into two arrays
        const imageFileIds = [];
        const thumbnailIds = [];
        _.forEach(fileIds, (file) => {
            imageFileIds.push(file.fileId);
            thumbnailIds.push(file.thumbId);
        });

        // Upload images
        const imageKeys = await updateStateAndPersist({
            fileIds: imageFileIds,
            allowedTypes: ['image'],
        });

        const thumbKeys = await updateStateAndPersist({
            fileIds: thumbnailIds,
            allowedTypes: ['image'],
        });

        _.forEach(imageKeys, (file, index) => {
            block.imgs.push({
                iu: `${file.key}-webp.webp`,
                og: `${file.key}`,
                tb: `${thumbKeys[index].key}`,
            });
        });
    }
    if (newThumbs.length > 0) {
        // Perform thumbnail updates on existing images

        const thumbnailIds = [];
        _.forEach(newThumbs, (file) => {
            const img = block.imgs.id(file.imageId);
            if (img) thumbnailIds.push(file.thumbId);
        });

        const thumbKeys = await updateStateAndPersist({
            fileIds: thumbnailIds,
            allowedTypes: ['image'],
        });

        const files = [];
        _.forEach(newThumbs, (file, index) => {
            const img = block.imgs.id(file.imageId);
            if (img) {
                // First take older thumb to delete
                if (img.tb) {
                    files.push(img.tb);
                    // Remove all versions of image
                    const versions = Object.values(C.PORTFOLIO_IMAGE_VERSIONS);
                    for (let vr of versions) {
                        files.push(`${img.tb}-${vr}.webp`);
                    }
                }
                // Set new thumbnail url
                img.tb = `${thumbKeys[index].key}`;
            }
        });
        if (files.length > 0) {
            // Remove from s3 (tortoise); delete documents
            await deleteMultiple(env.S3_BUCKET_USER_DATA, files);
            await deleteFilesByKey({ keys: files });
        }
    }

    // Cover image of ImageBlock is the first image of block
    block.ci = block.imgs[0].iu;
    await block.save();
    let prefix = env.S3_BUCKET_WEBSITE_URL;

    const images = _.map(block.images, (image) => {
        return {
            original: image.original ? `${prefix}/${image.original}` : '',
            imageUrl: image.imageUrl ? `${prefix}/${image.imageUrl}` : '',
            thumbnail: image.thumbnail ? `${prefix}/${image.thumbnail}` : '',
            extension: `${image.extension}`,
            id: image.id,
        };
    });

    return {
        msg: 'image block updated',
        id: block.id,
        pageId: block.pid,
        title,
        description,
        tags,
        category,
        position: block.pos,
        images,
        type: block.type,
        userId: block.userId,
        coverImage: `${env.S3_BUCKET_WEBSITE_URL}/${block.ci}`,
        public_url: block.pul,
        block_id: block.id,
    };
};

exports.customizeImage = async ({ user, data, id }) => {
    const block = await ImageBlock.findOne({
        _id: id,
        uid: user.id,
    })
        .select('ctz high')
        .exec();

    if (!block) throw new BadRequest('Block not found');
    const { highlight } = data;
    block.highlight = highlight;

    await block.save();
    return {
        msg: 'customization saved',
        ...data,
    };
};

/**
 * Link Block controllers
 */

exports.addLinkBlock = async ({ user, data, customize }) => {
    let { pageId, title, url, fileId } = data;
    const page = await Page.findOne({
        uid: user.id,
        _id: pageId,
    }).exec();
    if (!page)
        throw new BadRequest('No page found by this pageId for this creator');
    if (page.pst == C.PAGE_STATES.COPYING)
        throw new BadRequest('Please wait while we complete copying your page');

    // Since we allow urls without the protocol
    // Add protocol if not present so that we can redirect properly on the client

    url = `https://${url.replace('https://', '').replace('http://', '')}`;

    // Create public url from title
    const newId = mongoose.Types.ObjectId().toHexString();

    const publicUrl = await generatePublicUrl(title, newId);

    const block = new LinkBlock({
        _id: newId,
        uid: user.id,
        pul: publicUrl,
        ...data,
        url,
    });

    if (fileId) {
        // Instead of coverImage use uploaded image
        const [file] = await updateStateAndPersist({
            fileIds: [fileId],
            allowedTypes: ['image'],
        });
        block.coverImage = `${env.S3_BUCKET_WEBSITE_URL}/${file.key}-webp.webp`;
    }

    // customize
    const { highlight, showLinkIcon } = customize;
    block.highlight = highlight;
    block.customize.showLinkIcon = showLinkIcon;

    await block.save();
    return {
        msg: 'Link block added',
        id: block.id,
        ...data,
        url,
        coverImage: block.ci,
        public_url: block.pul,
        type: block.type,
        userId: block.userId,
        block_id: block.id,
        highlight,
        customize
    };
};

exports.updateLinkBlock = async ({ id, user, data }) => {
    let { title, description, tags, url, coverImage, category, fileId } = data;
    const block = await LinkBlock.findOne({
        uid: user.id,
        _id: id,
    }).exec();
    if (!block) throw new BadRequest('Link block not found');

    // Since we allow urls without the protocol
    // Add protocol if not present so that we can redirect properly on the client

    url = `https://${url.replace('https://', '').replace('http://', '')}`;

    if (block.title !== title) {
        const publicUrl = await generatePublicUrl(title, id, true, block.pul);
        block.pul = publicUrl;
    }
    block.title = title;
    block.description = description;
    block.tags = tags;
    block.url = url;
    block.category = category;
    let oldCoverImage = block.coverImage;
    block.coverImage = coverImage;
    if (fileId) {
        // Change coverImage with uploaded file
        const [file] = await updateStateAndPersist({
            fileIds: [fileId],
            allowedTypes: ['image'],
        });
        block.coverImage = `${env.S3_BUCKET_WEBSITE_URL}/${file.key}-webp.webp`;
    }
    if (oldCoverImage != block.coverImage) {
        // Cover Image was changed
        // Delete older image if coverImage was uploaded

        const toDelete = [];
        if (oldCoverImage.length > 0) {
            toDelete.push(
                oldCoverImage
                    .replace('-webp.webp', '')
                    .replace(`${env.S3_BUCKET_WEBSITE_URL}/`, ''),
            );
        }
        await deleteSingleFileVersions({ keys: toDelete });
    }
    await block.save();
    return {
        msg: 'Link block updated',
        id: block.id,
        ...data,
        url,
        coverImage: block.ci,
        position: block.pos,
        public_url: block.pul,
        type: block.type,
        userId: block.userId,
        block_id: block.id,
    };
};

exports.customizeLink = async ({ user, data, id }) => {
    const block = await LinkBlock.findOne({
        _id: id,
        uid: user.id,
    })
        .select('ctz high')
        .exec();

    if (!block) throw new BadRequest('Block not found');
    const { highlight, showLinkIcon } = data;
    block.highlight = highlight;
    block.customize.showLinkIcon = showLinkIcon;

    await block.save();
    return {
        msg: 'customization saved',
        ...data,
    };
};

/**
 * Text Editor Controllers
 */

// Create text editor for creator

exports.createTextEditor = async ({ user, pageId }) => {
    const page = await Page.findOne({
        uid: user.id,
        _id: pageId,
    }).exec();
    if (!page)
        throw new BadRequest('No page found by this pageId for this creator');
    let editor = await TextEditor.findOne({
        uid: user.id,
        pid: pageId,
    })
        .select('imgs')
        .exec();
    let content = ' ';
    if (editor) {
        const prefixS3 = `text-editor/${user.id}-${editor.id}`;
        content = await getObject(env.S3_BUCKET_USER_DATA, prefixS3);
    } else {
        editor = new TextEditor({
            uid: user.id,
            pid: pageId,
        });
        await editor.save();
        await createEmptyTextEditorFile({
            userId: user.id,
            editorId: editor.id,
        });
    }
    return {
        msg: 'Text editor data',
        content,
        editorId: editor.id,
    };
};

exports.saveTextEditorContent = async ({ user, content, id }) => {
    const editor = await TextEditor.findOne({
        uid: user.id,
        pid: id,
    })
        .select('imgs')
        .exec();
    if (!editor) {
        throw new BadRequest(
            'Text Editor does not exists for this creator for this page. Create first before save',
        );
    }
    // Sanitize Html
    const sanitizedContent = sanitizeHtml(content, {
        allowedTags: false,
        allowedAttributes: false,
    });
    editor.ls = Date.now();
    await editor.save();
    // Save content to file
    await textEditorSaveContent({
        userId: user.id,
        editorId: editor.id,
        content: sanitizedContent,
    });
    return {
        msg: 'saved',
    };
};

exports.addImageToTextEditor = async ({ user, fileIds, id }) => {
    const editor = await TextEditor.findOne({
        uid: user.id,
        pid: id,
    })
        .select('imgs')
        .exec();
    if (!editor) {
        throw new BadRequest(
            'Text Editor does not exists for this creator for this page. Create first before save',
        );
    }
    const newImages = [];
    // Create Image sub documents
    // Update state of files in db and move objects from 'mayfly' to 'tortoise' directory
    const fileKeys = await updateStateAndPersist({
        fileIds,
        allowedTypes: ['image'],
    });
    _.forEach(fileKeys, (file) => {
        const doc = editor.imgs.create({
            iu: `${file.key}-webp.webp`,
            og: `${file.key}`,
        });
        editor.imgs.push(doc);
        newImages.push({
            url: `${env.S3_BUCKET_WEBSITE_URL}/${file.key}-webp.webp`,
            id: doc.id,
        });
    });
    await editor.save();
    return { msg: 'Image(s) uploaded', newImages };
};

// For Image and project block
exports.deleteImagesFromTextEditor = async ({ user, imageIds, id }) => {
    const editor = await TextEditor.findOne({
        uid: user.id,
        pid: id,
    })
        .select('imgs')
        .exec();
    if (!editor) {
        throw new BadRequest(
            'Text Editor does not exists for this creator for this page. Create first before save',
        );
    }
    // Objects to Remove
    let files = [];
    await Promise.all(
        _.map(imageIds, async (img) => {
            const doc = editor.imgs.id(img);
            if (doc) {
                // original
                const originalKey = doc.og;
                files.push(originalKey);
                // Remove all versions of image
                const versions = Object.values(C.PORTFOLIO_IMAGE_VERSIONS);
                for (let vr of versions) {
                    files.push(`${originalKey}-${vr}.webp`);
                }

                // remove from collection
                await doc.remove();
            }
        }),
    );
    await editor.save();
    if (files.length > 0) {
        // Remove from s3 (tortoise); delete documents
        await deleteMultiple(env.S3_BUCKET_USER_DATA, files);
        await deleteFilesByKey({ keys: files });
    }
    return {
        msg: 'image(s) deleted',
    };
};

/**
 * Project Block controllers
 */

exports.createProjectBlock = async ({ user, data, customize }) => {
    const editor = await TextEditor.findOne({
        uid: user.id,
        pid: data.pageId,
    }).exec();
    if (!editor) {
        throw new BadRequest(
            'Text Editor does not exists for this creator for this page. Create first before creating a new project block',
        );
    }
    const page = await Page.findOne({
        uid: user.id,
        _id: data.pageId,
    }).exec();
    if (!page)
        throw new BadRequest('No page found by this pageId for this creator');
    if (page.pst == C.PAGE_STATES.COPYING)
        throw new BadRequest('Please wait while we complete copying your page');
    let coverImage = data.coverImage;

    const newId = mongoose.Types.ObjectId().toHexString();

    const block = new ProjectBlock({
        _id: newId,
        uid: user.id,
        ...data,
        coverImage,
    });
    block.pul = await generatePublicUrl(data.title, newId);

    const { highlight } = customize;
    block.highlight = highlight;

    // Transfer images from editor to block
    for (let images of editor.imgs) {
        block.imgs.push({
            iu: images.iu,
            og: images.og,
            ext: images.ext,
        });
    }
    // Create content file for block using contents of editor

    // First extract content from editor
    const editorContent = await getObject(
        env.S3_BUCKET_USER_DATA,
        `text-editor/${user.id}-${editor.id}`,
    );

    // Save editorContent to block file
    const fileUrl = await updateFileV3({
        creatorId: user.id,
        projectId: block.id,
        content: editorContent,
    });
    block.fu = fileUrl;

    // Revert editor to empty state

    // Replace editor file with empty file
    await createEmptyTextEditorFile({
        userId: user.id,
        editorId: editor.id,
    });

    // Set images to empty array
    editor.imgs = [];
    await block.save();
    await editor.save();

    return {
        msg: 'Project block created',
        id: block.id,
        ...data,
        coverImage: data.coverImage,
        public: block.public,
        public_url: block.pul,
        type: block.type,
        userId: block.userId,
        block_id: block.id,
        highlight
    };
};

// ! Project block is initialized so as to allow adding images to a unsaved document
/* exports.initializeProjectBlock = async ({ user, position }) => {
    // KEEP at most one Project Block in database with state INIT
    let block = await ProjectBlock.findOne({
        uid: user._id,
        pst: C.PROJECT_BLOCK_STATES.INIT,
    }).exec();
    if (block) {
        // If block with init state exists
        // remove older content file
        await emptyS3Directory(
            env.S3_BUCKET_USER_DATA,
            `${user.id}/${C.MODELS.PROJECT_BLOCK}/${block.id}/`,
        );
        block.imgs = [];
        // TODO: Images exists in S3
        // TODO: Delete these images
        // TODO: IF we can delete them asynchronously, it would be better
    } else {
        // otherwise
        // Create new block
        // default title is 'untitled'
        block = new ProjectBlock({ t: 'untitled', uid: user._id });
        block.pul = await generatePublicUrl('untitled');
    }
    // Create File
    const fileUrl = await createEmptyProjectFile({
        creatorId: user.id,
        projectId: block.id,
    });
    block.fu = fileUrl;
    block.pos = position;
    await block.save();
    return {
        id: block.id,
        public_url: block.pul,
        image: '',
        projectState: C.LONG_FORM_STATES.INIT,
        type: block.type,
        userId: block.userId,
    };
}; */

// Update project block
exports.saveProjectBlock = async ({ id, user, data }) => {
    let { title, description, tags, content, public, category, coverImage } =
        data;
    const block = await ProjectBlock.findOne({
        _id: id,
        uid: user._id,
    }).exec();
    if (!block) throw new BadRequest('Project Block Not found');
    if (block.t !== title) {
        // If title changes
        // change public_url as well
        block.pul = await generatePublicUrl(title, id, true, block.pul);
    }
    block.pblc = public;
    block.t = title;
    block.desc = description;
    block.tg = tags;
    block.ctg = category;
    block.ci = coverImage;
    // update state, significant for INIT projects
    block.pst = C.PROJECT_BLOCK_STATES.SAVED;
    await block.save();
    // Sanitize Html
    const sanitizedContent = sanitizeHtml(content, {
        allowedTags: false,
        allowedAttributes: false,
    });
    // Save content to file
    await updateFileV3({
        creatorId: user.id,
        projectId: id,
        content: sanitizedContent,
    });
    return {
        msg: 'saved',
        id: block.id,
        title,
        description,
        tags,
        coverImage: data.coverImage,
        public,
        public_url: block.pul,
        projectState: C.PROJECT_BLOCK_STATES.SAVED,
        type: block.type,
        position: block.pos,
        userId: block.userId,
        block_id: block.id,
    };
};

exports.customizeProject = async ({ user, data, id }) => {
    const block = await ProjectBlock.findOne({
        _id: id,
        uid: user.id,
    })
        .select('high')
        .exec();

    if (!block) throw new BadRequest('Block not found');
    const { highlight } = data;
    block.highlight = highlight;

    await block.save();
    return {
        msg: 'customization saved',
        ...data,
    };
};

exports.addImageToBlock = async ({ user, fileIds, id }) => {
    const block = await ProjectBlock.findOne({
        uid: user.id,
        _id: id,
    }).exec();
    if (!block) throw new BadRequest('Project block not found by this id');
    const newImages = [];
    // Create Image sub documents
    // Update state of files in db and move objects from 'mayfly' to 'tortoise' directory
    const fileKeys = await updateStateAndPersist({
        fileIds,
        allowedTypes: ['image'],
    });
    _.forEach(fileKeys, (file) => {
        const doc = block.imgs.create({
            iu: `${file.key}-webp.webp`,
            og: `${file.key}`,
        });
        block.imgs.push(doc);
        newImages.push({
            url: `${env.S3_BUCKET_WEBSITE_URL}/${file.key}-webp.webp`,
            id: doc.id,
        });
    });
    await block.save();
    return { msg: 'Image(s) uploaded', newImages, block_id: block.id };
};

// For Image and project block
exports.deleteImagesFromBlock = async ({ user, imageIds, id }) => {
    const block = await Block.findOne({
        uid: user.id,
        _id: id,
        __t: { $in: [C.MODELS.PROJECT_BLOCK, C.MODELS.IMAGE_BLOCK] },
    }).exec();
    if (!block) throw new BadRequest('Block not found');
    // Objects to Remove
    let files = [];
    await Promise.all(
        _.map(imageIds, async (img) => {
            const doc = block.imgs.id(img);
            if (doc) {
                // original
                const originalKey = doc.og;
                files.push(originalKey);

                // thumbnail for image blocks
                let thumbKey = '';
                if (block.type == C.MODELS.IMAGE_BLOCK && doc.tb) {
                    thumbKey = doc.tb;
                    files.push(thumbKey);
                }
                // Remove all versions of image
                const versions = Object.values(C.PORTFOLIO_IMAGE_VERSIONS);
                for (let vr of versions) {
                    files.push(`${originalKey}-${vr}.webp`);
                    if (thumbKey) files.push(`${thumbKey}-${vr}.webp`);
                }

                // remove from collection
                await doc.remove();
            }
        }),
    );
    if (block.type == C.MODELS.IMAGE_BLOCK) {
        // Cover image of ImageBlock is the first image of block
        block.ci = '';
        if (block.imgs.length > 0) {
            block.ci = block.imgs[0].iu;
        }
    }
    if (block.type == C.MODELS.PROJECT_BLOCK) {
        // If we delete an image which is also the coverImage
        // unset coverImage of block
        // console.log(files, block);
        if (files.includes(block.ci)) {
            block.ci = '';
        }
    }
    await block.save();
    if (files.length > 0) {
        // Remove from s3 (tortoise); delete documents
        await deleteMultiple(env.S3_BUCKET_USER_DATA, files);
        await deleteFilesByKey({ keys: files });
    }
    return {
        msg: 'image(s) deleted',
        block_id: block.id,
    };
};

/**
 * Experience Controllers
 */

exports.addExperience = async ({ user, data, pageId, id, customize }) => {
    // Experience can be:
    // 1. A block in a page
    // 2. Part of user details in user schema
    // This controller works for both

    let experienceIn;

    if (pageId) {
        // If page id was provided we are performing operation on experience block on a page
        const page = await Page.findOne({
            uid: user.id,
            _id: pageId,
        }).exec();
        if (!page)
            throw new BadRequest(
                'No page found by this pageId for this creator',
            );
        if (page.pst == C.PAGE_STATES.COPYING)
            throw new BadRequest(
                'Please wait while we complete copying your page',
            );

        let block;
        if (id) {
            // Find the experience block of user by id
            block = await ExperienceBlock.findOne({
                uid: user.id,
                _id: id,
            }).exec();
            if (!block) throw new BadRequest('Block not found');
        } else {
            // Experience block has a position as well as individual experiences have a position
            // Create a new block if id was not provided in API
            // in this case, 'position' is position of entire block
            block = new ExperienceBlock({
                uid: user.id,
                pid: pageId,
                pos: data.position,
            });

            // setting new position for the individual experience
            // since this is the experience, default position is 'n'
            data.position = 'n';
        }

        // const { highlight, customTitle, blockTitle } = customize;
        // block.highlight = highlight;
        // block.customize.customTitle = customTitle;
        // block.customize.blockTitle = blockTitle;

        experienceIn = block;
    } else {
        // otherwise performing operation in user schema
        experienceIn = user;
    }

    if (data.isWorkingHere === false) {
        const isAfter = moment(data.end).isSameOrAfter(data.start);
        if (!isAfter) {
            throw new BadRequest('End Date should be after Start Date');
        }
    }

    const { fileId, logo } = data;

    // If we have uploaded logo
    if (fileId) {
        // Create Image sub documents
        // Update state of files in db and move objects from 'mayfly' to 'tortoise' directory
        const [file] = await updateStateAndPersist({
            fileIds: [fileId],
            allowedTypes: ['image'],
        });
        const originalPath = `${env.S3_BUCKET_WEBSITE_URL}/${file.key}-webp.webp`;
        data.logo = originalPath;
    } else {
        // If we used external url for logo
        data.logo = logo;
    }

    const doc = experienceIn.exps.create(data);
    experienceIn.exps.push(doc);

    let response = {};
    if (pageId && experienceIn.isNew) {
        response = { ...experienceIn.toJSON() };
    } else {
        response = { ...doc.toJSON() };
    }

    await experienceIn.save();
    return { msg: 'Experience added', ...response, pageId };
};

exports.updateExperience = async ({ id, expId, user, data, pageId }) => {
    // Experience can be:
    // 1. A block in a page
    // 2. Part of user details in user schema
    // This controller works for both

    let experienceIn;

    if (pageId && id) {
        // If page id was provided we are performing operation on experience block on a page
        const block = await ExperienceBlock.findOne({
            uid: user.id,
            _id: id,
        }).exec();
        if (!block) throw new BadRequest('Experience block not found');
        experienceIn = block;
    } else {
        // otherwise performing operation in user schema
        experienceIn = user;
    }

    if (data.isWorkingHere === false) {
        const isAfter = moment(data.end).isSameOrAfter(data.start);
        if (!isAfter) {
            throw new BadRequest('End Date should be after Start Date');
        }
    }

    const doc = experienceIn.exps.id(expId);
    if (!doc) throw new BadRequest('No experience exists with this id');
    const {
        company,
        isWorkingHere,
        start,
        end,
        logo,
        fileId,
        description,
        designation,
    } = data;
    doc.company = company;
    doc.isWorkingHere = isWorkingHere;
    doc.start = start;
    doc.end = end;
    doc.description = description;
    doc.dsg = designation;

    const oldLogo = doc.logo;
    doc.logo = logo;

    if (fileId) {
        // Change logo with uploaded file
        const [file] = await updateStateAndPersist({
            fileIds: [fileId],
            allowedTypes: ['image'],
        });
        doc.logo = `${env.S3_BUCKET_WEBSITE_URL}/${file.key}-webp.webp`;
    }
    if (oldLogo != doc.logo) {
        // Logo was changed
        // Delete older image if logo was uploaded

        const toDelete = [];
        if (oldLogo.length > 0) {
            toDelete.push(
                oldLogo
                    .replace('-webp.webp', '')
                    .replace(`${env.S3_BUCKET_WEBSITE_URL}/`, ''),
            );
        }
        await deleteSingleFileVersions({ keys: toDelete });
    }

    await doc.save();
    await experienceIn.save();
    return {
        msg: 'Experience updated',
        id: doc.id,
        pageId,
        position: doc.position,
        ...data,
        logo: doc.logo,
    };
};

exports.updateExperiencePosition = async ({
    user,
    id,
    expId,
    position,
    pageId,
}) => {
    // Experience can be:
    // 1. A block in a page
    // 2. Part of user details in user schema
    // This controller works for both

    let experienceIn;

    if (pageId) {
        // If page id was provided we are performing operation on a experience block on a page
        const block = await ExperienceBlock.findOne({
            uid: user.id,
            pid: pageId,
            _id: id,
        }).exec();
        if (!block) throw new BadRequest('Experience block not found');
        experienceIn = block;
    } else {
        // otherwise performing operation in user schema
        experienceIn = user;
    }

    const doc = experienceIn.exps.id(expId);
    if (!doc) throw new BadRequest('No experience exists with this id');
    doc.position = position;
    await doc.save();
    await experienceIn.save();
    return {
        msg: 'Experience position updated',
        id: doc.id,
        pageId,
        position,
    };
};

exports.customizeExperience = async ({ user, data, id }) => {
    const block = await ExperienceBlock.findOne({
        _id: id,
        uid: user.id,
    })
        .select('ctz high')
        .exec();

    if (!block) throw new BadRequest('Block not found');
    const { highlight, customTitle, blockTitle } = data;
    block.highlight = highlight;
    block.customize.customTitle = customTitle;
    block.customize.blockTitle = blockTitle;

    await block.save();
    return {
        msg: 'customization saved',
        ...data,
    };
};

exports.deleteExperience = async ({ id, expId, user, pageId }) => {
    // Experience can be:
    // 1. A block in a page
    // 2. Part of user details in user schema
    // This controller works for both

    let experienceIn;
    if (pageId && id) {
        // If pageId was provided we are performing operation on a experience block

        const block = await ExperienceBlock.findOne({
            uid: user.id,
            pid: pageId,
            _id: id,
        }).exec();
        if (!block)
            throw new BadRequest('User has no experience block on this page');
        experienceIn = block;
        // otherwise performing operation in user schema
    } else {
        experienceIn = user;
    }

    const doc = experienceIn.exps.id(expId);
    if (!doc) throw new BadRequest('Experience not found');
    doc.remove();
    await experienceIn.save();

    // If block has no experience, delete block
    if (pageId && id && experienceIn.exps.length == 0) {
        await ExperienceBlock.findOneAndRemove({
            uid: user.id,
            pid: pageId,
            _id: id,
        }).exec();
    }

    // If we are uploaded logo
    // delete logo from bucket
    if (doc.logo.includes(env.S3_BUCKET_WEBSITE_URL)) {
        const key = doc.logo
            .replace(env.S3_BUCKET_WEBSITE_URL + '/', '')
            .replace('-webp.webp', '');
        await deleteSingleFileVersions({ key });
    }
    return {
        msg: 'Experience deleted',
        id,
        pageId,
    };
};

/**
 * Service Block Controllers
 */

exports.addServiceBlock = async ({ user, data, customize }) => {
    const { title, feesType, currency, pageId } = data;
    const page = await Page.findOne({
        uid: user.id,
        _id: pageId,
    }).exec();
    if (!page)
        throw new BadRequest('No page found by this pageId for this creator');
    if (page.pst == C.PAGE_STATES.COPYING)
        throw new BadRequest('Please wait while we complete copying your page');
    const newId = mongoose.Types.ObjectId().toHexString();

    const block = new ServiceBlock({ _id: newId, uid: user.id, ...data });
    block.pul = await generatePublicUrl(title, newId);
    if (feesType == C.SERVICE_BLOCK_FEES_TYPE.PREPAID) {
        /*   if (user.adr.co !== 'India')
            throw new BadRequest(
                'Prepaid gigs currently allowed only for Indian users',
            ); */
        if (currency !== C.CURRENCY.INR && user.pgs == C.PAYMENT_GATEWAY.RP) {
            throw new BadRequest(
                'Only INR currency is allowed when Razorpay is selected for receiving payments',
            );
        }
        if (
            user.pgs == C.PAYMENT_GATEWAY.STRP &&
            user.stripeInfo.connectionStatus !==
                C.STRIPE_CONNECTION_STATUS.COMPLETED
        ) {
            throw new BadRequest(
                'Please onboard on stripe to create this service',
            );
        }
        if (
            user.pgs == C.PAYMENT_GATEWAY.RP &&
            user.razorpayInfo.onboardStatus !==
                C.RZPY_CONNECTION_STATUS.ONBOARDED
        ) {
            throw new BadRequest(
                'Please onboard on razorpay to create this service',
            );
        }
        block.pg = user.pgs;
    }

    // Customize
    const { highlight, customTitle, gitTitle, calendlyTitle } = customize;
    block.highlight = highlight;
    block.customize.customTitle = customTitle;
    block.customize.gitTitle = gitTitle;
    block.customize.calendlyTitle = calendlyTitle;

    await block.save();
    return {
        msg: 'new block added',
        id: block.id,
        ...data,
        public_url: block.pul,
        type: block.type,
        userId: block.userId,
        block_id: block.id,
        customize,
        highlight
    };
};

async function checkPaymentGateway({ currency, user }) {
    if (currency !== C.CURRENCY.INR && user.pgs == C.PAYMENT_GATEWAY.RP) {
        throw new BadRequest(
            'Only INR currency is allowed when Razorpay is selected for receiving payments',
        );
    }
    if (
        user.pgs == C.PAYMENT_GATEWAY.STRP &&
        user.stripeInfo.connectionStatus !==
            C.STRIPE_CONNECTION_STATUS.COMPLETED
    ) {
        throw new BadRequest('Please onboard on stripe to create this service');
    }
    if (
        user.pgs == C.PAYMENT_GATEWAY.RP &&
        user.razorpayInfo.onboardStatus !== C.RZPY_CONNECTION_STATUS.ONBOARDED
    ) {
        throw new BadRequest(
            'Please onboard on razorpay to create this service',
        );
    }
}

exports.updateServiceBlock = async ({ user, data, id }) => {
    const {
        title,
        description,
        tags,
        feesType,
        currency,
        price,
        calendly,
        rateUnit,
        deliveryTime,
        customMessage,
        askMoreFields,
    } = data;
    const block = await ServiceBlock.findOne({
        uid: user.id,
        _id: id,
    }).exec();
    if (!block) throw new BadRequest('Block not found with given id');
    if (block.title !== title) {
        block.pul = await generatePublicUrl(title, id, true, block.pul);
    }
    block.t = title;
    block.desc = description;
    block.tg = tags;
    block.cmsg = customMessage;
    block.ft = feesType;
    block.curr = currency;
    block.prc = price;
    block.ru = rateUnit;
    block.dt = deliveryTime;
    block.cln = calendly;
    block.askMoreFields = askMoreFields;
    if (feesType == C.SERVICE_BLOCK_FEES_TYPE.PREPAID) {
        await checkPaymentGateway({ currency, user });
        block.pg = user.pgs;
    }
    await block.save();
    return {
        msg: 'Block updated',
        id,
        ...data,
        public_url: block.pul,
        type: block.type,
        position: block.pos,
        userId: block.userId,
        block_id: block.id,
    };
};

exports.updateManagedImported = async ({ user, data, id }) => {
    const {
        title,
        description,
        tags,
        feesType,
        currency,
        price,
        calendly,
        rateUnit,
        deliveryTime,
        customMessage,
        askMoreFields,
    } = data;
    const block = await ImportedService.findOne({
        uid: user.id,
        _id: id,
    }).exec();
    if (!block) throw new BadRequest('Block not found with given id');

    if (block.collabType !== C.COLLAB_TYPE.MANAGE)
        throw new BadRequest('Only managed imported blocks can be edited');

    block.t = title;
    block.desc = description;
    block.tg = tags;
    block.details.cmsg = customMessage;
    block.details.ft = feesType;
    block.details.curr = currency;
    block.details.prc = price;
    block.details.ru = rateUnit;
    block.details.dt = deliveryTime;
    block.details.cln = calendly;
    block.details.askMoreFields = askMoreFields;

    if (feesType == C.SERVICE_BLOCK_FEES_TYPE.PREPAID) {
        await checkPaymentGateway({ currency, user });
        block.details.pg = user.pgs;
    }

    await block.save();

    return {
        msg: 'imported block updated',
        id: block.id,
        public_url: block.pul,
        type: block.type,
        userId: block.userId,
        block_id: block.id,
        title: block.title,
        description: block.description,
        tags: block.tags,
        ...block.toJSON().details,
    };
};

exports.fetchEachPageServices = async ({ user }) => {
    // ?? write a aggregate query for this
    // ?? filter hidden services

    const services = await Block.find({
        uid: user.id,
        __t: {
            $in: [C.MODELS.SERVICE_BLOCK, C.MODELS.IMPORTED_SERVICE],
        },
    })
        .select('t pid  pul ft prc ru curr sref')
        .populate([
            {
                path: 'pid',
                select: 'n',
            },
            {
                path: 'sref',
                select: 't pid pul ft prc ru curr',
            },
        ])
        .exec();
    let pages = new Map();

    for (let service of services) {
        service = service.toJSON();

        let has = pages.has(service.pageId.id);

        let page;

        if (has) {
            page = pages.get(service.pageId.id);
            page.services.push(service);
        } else {
            page = {
                ...service.pageId,
                services: [service],
            };
        }
        pages.set(service.pageId.id, page);
    }

    pages = Array.from(pages.values());

    return {
        pages,
    };
};

exports.customizeService = async ({ user, data, id }) => {
    let block = null
    if(data.isCollab){
        const iService = ImportedService.findOne({
            _id: id,
            uid: user.id,
        }).populate({
            path: 'sref',
            select: '-ctz -high',
        })
        .exec();
        if (!iService) throw new BadRequest('Block not found');
        block = iService.sref
    } else
     block = await ServiceBlock.findOne({
        _id: id,
        uid: user.id,
    })
        .select('ctz high')
        .exec();

    if (!block) throw new BadRequest('Block not found');
    const { highlight, customTitle, gitTitle, calendlyTitle } = data;
    block.highlight = highlight;
    block.customize.customTitle = customTitle;
    block.customize.gitTitle = gitTitle;
    block.customize.calendlyTitle = calendlyTitle;

    await block.save();
    return {
        msg: 'customization saved',
        ...data,
    };
};

/**
 * PDF Block controllers
 */

exports.addUpdatePdfBlock = async ({ user, data, id, customize }) => {
    const { fileId, coverId, ...blockData } = data;
    let block;
    // If id was provided this should be an update operation of an existing block
    if (id) {
        block = await PDFBlock.findOne({
            uid: user.id,
            _id: id,
        }).exec();
        if (!block) throw new BadRequest('No Block found with this id');
        if (block.title !== blockData.title) {
            block.pul = await generatePublicUrl(
                blockData.title,
                id,
                true,
                block.pul,
            );
        }
        block.title = blockData.title;
        block.category = blockData.category;
        block.tags = blockData.tags;
        block.description = blockData.description;
    } else {
        const page = await Page.findOne({
            uid: user.id,
            _id: blockData.pageId,
        }).exec();
        if (!page)
            throw new BadRequest(
                'No page found by this pageId for this creator',
            );
        if (page.pst == C.PAGE_STATES.COPYING)
            throw new BadRequest(
                'Please wait while we complete copying your page',
            );

        const newId = mongoose.Types.ObjectId().toHexString();
        block = new PDFBlock({ _id: newId, uid: user.id, ...blockData });
        block.pul = await generatePublicUrl(blockData.title, newId);

        const { highlight } = customize;
        block.highlight = highlight;
    }
    // fileId and coverId can be provided both in 'add new block' and 'update pdf block'
    if (fileId && coverId) {
        let oldFloc, oldCi;
        if (id) {
            // If this is an update operation and we want to also update file and cover Image
            // store file and cover for delete
            oldFloc = block.floc;
            oldCi = block.ci;

            // We dont perform delete operation here immediately, as if for some reason
            // delete is success but settting new file/cover fails, we will be left with the state where
            // file was deleted in s3 but url is still set in database
        }
        // Create new images
        const fileIds = [fileId, coverId];
        const [fileKey, coverKey] = await updateStateAndPersist({
            fileIds,
            allowedTypes: ['image', 'pdf'],
        });
        // console.log(fileKey, coverKey);
        block.floc = fileKey.key;
        block.ci = coverKey.key;

        if (id && oldFloc && oldCi) {
            // delete older files now that new urls have been set successfully
            await deleteSingleFileVersions({ keys: [oldFloc, oldCi] });
        }
    }
    await block.save();
    return {
        msg: 'block updated',
        id: block.id,
        ...data,
        pageId: block.pid,
        position: block.pos,
        public_url: block.pul,
        coverImage: `${env.S3_BUCKET_WEBSITE_URL}/${block.ci}`,
        fileLocation: `${env.S3_BUCKET_WEBSITE_URL}/${block.floc}`,
        type: block.type,
        userId: block.userId,
        block_id: block.id,
        highlight, customize
    };
};

exports.customizePdf = async ({ user, data, id }) => {
    const block = await PDFBlock.findOne({
        _id: id,
        uid: user.id,
    })
        .select('high')
        .exec();

    if (!block) throw new BadRequest('Block not found');
    const { highlight } = data;
    block.highlight = highlight;

    await block.save();
    return {
        msg: 'customization saved',
        ...data,
    };
};

/**
 * Page Break Controllers
 */

exports.addPageBreak = async ({ user, data }) => {
    let { pageId } = data;
    const page = await Page.findOne({
        uid: user.id,
        _id: pageId,
    }).exec();
    if (!page)
        throw new BadRequest('No page found by this pageId for this creator');
    if (page.pst == C.PAGE_STATES.COPYING)
        throw new BadRequest('Please wait while we complete copying your page');

    let block = new PageBreak({
        uid: user.id,
        ...data,
    });

    await block.save();

    return {
        msg: 'Page break added',
        ...block.toJSON(),
        block_id: block.id,
    };
};

exports.updatePageBreak = async ({ user, id, data }) => {
    const {
        breakType,
        breakHeight,
        textAlign,
        textFont,
        textSize,
        textStyle,
        title,
        italics,
        bold,
        layout,
    } = data;

    const block = await PageBreak.findOne({
        uid: user.id,
        _id: id,
    }).exec();
    if (!block) throw new BadRequest('Page break block not found');

    if (breakType) block.breakType = breakType;
    if (breakHeight) block.breakHeight = breakHeight;
    if (textAlign) block.textAlign = textAlign;
    if (textFont) block.textFont = textFont;
    if (textSize) block.textSize = textSize;
    if (textStyle) block.textStyle = textStyle;
    if (title) block.title = title;
    if (layout) block.layout = layout;

    if (typeof italics == 'boolean') {
        block.italics = italics;
    }
    if (typeof bold == 'boolean') {
        block.bold = bold;
    }

    await block.save();

    return {
        msg: 'Page break updated',
        ...block.toJSON(),
        block_id: block.id,
    };
};

/**
 * Common controllers to all block types
 */

// Update position block
exports.updateBlockPosition = async ({ user, id, position }) => {
    const block = await Block.findOneAndUpdate(
        {
            _id: id,
            uid: user.id,
        },
        {
            $set: {
                pos: position,
            },
        },
    ).exec();
    if (!block) throw new BadRequest('Block not found');
    return {
        msg: 'block position updated',
        id,
        position,
        block_id: block.id,
    };
};

exports.changeBlockVisibility = async ({ user, id, hidden, position }) => {
    const setFields = {
        hid: hidden,
    };
    if (position && !hidden) {
        setFields.pos = position;
    }
    await Block.findOneAndUpdate(
        {
            uid: user.id,
            _id: id,
            __t: {
                $nin: [C.MODELS.PAGE_BREAK],
            },
        },
        setFields,
    ).exec();

    return {
        msg: 'block visibility changed',
        hidden,
    };
};

exports.changePageOfBlock = async ({ user, id, pageId, position }) => {
    const page = await Page.findOne({
        _id: pageId,
        uid: user.id,
    })
        .select('_id')
        .exec();

    if (!page) throw new BadRequest('Page not found');

    const block = await Block.findOneAndUpdate(
        {
            _id: id,
            uid: user.id,
            __t: {
                $nin: [C.MODELS.PAGE_BREAK],
            },
        },
        {
            $set: {
                pid: pageId,
                pos: position,
            },
        },
    );

    if (!block) throw new BadRequest('Block not found');

    return {
        msg: 'block page changed',
        pageId,
        block_id: block.id,
    };
};

exports.deleteBlock = async ({ user, id }) => {
    const block = await Block.findOne({
        uid: user.id,
        _id: id,
    }).exec();
    if (!block) throw new BadRequest('Block not found');

    if (block.type == C.MODELS.IMPORTED_SERVICE) {
        // For imported service blocks
        // dont directly delete, call remove import controller
        const res = await collabControllers.removeImport({
            user,
            id: block.imp,
        });
        return res;
    }

    if (block.type == C.MODELS.SERVICE_BLOCK) {
        try {
            // Find and remove all imports of this service block
            // Only delete block if all imports were removed
            await collabControllers.removeAllImportsOfBlock({ user, id });
        } catch (err) {
            throw new BadRequest(
                'Unable to remove some or all imports of service block. try again..',
            );
        }
    }

    await Block.findOneAndDelete({
        _id: id,
    }).exec();

    if (
        block.type == C.MODELS.IMAGE_BLOCK ||
        block.type == C.MODELS.PROJECT_BLOCK
    ) {
        // Remove Image objects from S3

        // contains Object keys to Remove
        let files = [];
        await Promise.all(
            _.map(block.imgs, async (img) => {
                if (img) {
                    // original
                    const originalKey = img.og;
                    files.push(originalKey);

                    // thumbnail for image blocks
                    let thumbKey = '';
                    if (block.type == C.MODELS.IMAGE_BLOCK && img.tb) {
                        thumbKey = img.tb;
                        files.push(thumbKey);
                    }

                    // Remove all versions of image
                    const versions = Object.values(C.PORTFOLIO_IMAGE_VERSIONS);
                    for (let vr of versions) {
                        files.push(`${originalKey}-${vr}.webp`);
                        if (thumbKey) files.push(`${thumbKey}-${vr}.webp`);
                    }
                    // remove from collection
                    await img.remove();
                }
            }),
        );
        if (files.length > 0) {
            // Remove from s3 (tortoise); delete documents
            await deleteMultiple(env.S3_BUCKET_USER_DATA, files);
            await deleteFilesByKey({ keys: files });
        }
    }
    if (block.type == C.MODELS.PROJECT_BLOCK) {
        // Remove content file from bucket
        await emptyS3Directory(
            env.S3_BUCKET_USER_DATA,
            `${user.id}/${C.MODELS.PROJECT_BLOCK}/${block.id}/`,
        );
    }
    if (block.type == C.MODELS.PDF_BLOCK) {
        const toDelete = [block.floc];
        if (block.ci.length > 0) {
            toDelete.push(block.ci);
        }
        await deleteSingleFileVersions({ keys: toDelete });
    }

    if (block.type == C.MODELS.LINK_BLOCK) {
        const toDelete = [];
        if (block.ci.length > 0) {
            toDelete.push(
                block.ci
                    .replace('-webp.webp', '')
                    .replace(`${env.S3_BUCKET_WEBSITE_URL}/`, ''),
            );
        }
        await deleteSingleFileVersions({ keys: toDelete });
    }

    if (block.type == C.MODELS.TESTIMONIAL_BLOCK) {
        const keysToDelete = [];
        for (let tst of block.tstm) {
            if (
                tst.t === C.TESTIMONIAL_TYPE.LOGO &&
                tst.img.includes(env.S3_BUCKET_WEBSITE_URL)
            ) {
                const key = tst.img.replace(
                    env.S3_BUCKET_WEBSITE_URL + '/',
                    '',
                );
                keysToDelete.push(key);
            }
        }

        // Delete logo keys
        if (keysToDelete.length > 0) {
            await deleteSingleFileVersions({ keys: keysToDelete });
        }
    }

    if (block.type == C.MODELS.EXPERIENCE_BLOCK) {
        const keysToDelete = [];
        for (let exp of block.exps) {
            if (exp.logo.includes(env.S3_BUCKET_WEBSITE_URL)) {
                const key = exp.logo
                    .replace(env.S3_BUCKET_WEBSITE_URL + '/', '')
                    .replace('-webp.webp', '');
                keysToDelete.push(key);
            }
        }
        if (keysToDelete.length > 0) {
            await deleteSingleFileVersions({ keys: keysToDelete });
        }
    }

    return {
        msg: 'Block removed',
        block_id: block.id,
    };
};

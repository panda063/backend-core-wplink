const mongoose = require('mongoose');
const _ = require('lodash');
const C = require('../../lib/constants');
const env = require('../../config/env');
const { BadRequest, InternalServerError } = require('../../lib/errors');

/**
 * Models
 */

const Creator = mongoose.model(C.MODELS.WRITER_C);
const PM = mongoose.model(C.MODELS.PM_C);
const Page = mongoose.model(C.MODELS.PAGE);
const Block = mongoose.model(C.MODELS.BLOCK);
const CollabImport = mongoose.model(C.MODELS.COLLAB_IMPORT);

// Custom sort function for docs with 'position' field
// Sorts in ascending order of 'position' field

const sortByPosition = (a, b) => {
    if (a.position > b.position) return 1;
    else if (a.position < b.position) return -1;
    else return 0;
};

exports.sortByPosition = sortByPosition;

const customWrapper = (doc, email) => {
    const testEmails = [
        'test_3_palakjain030@gmail.com',
        'test_3_chowhduryanirban537@gmail.com',
        'test_3_mahimapareek23@gmail.com',
        'test_3_unnatigandhi9@gmail.com',
        'test_3_athyasreerajeeth@gmail.com',
        'test_3_Udayraghav1802@gmail.com',
        'test_3_mudgalsparsh@gmail.com',
        'test_3_dishabwrites@gmail.com',
        'test_3_hi5shrenik@gmail.com',
        'test_3_jhashivani333@gmail.com',
        'test_3_jackvatsal@gmail.com',
        'test_3_rohanborgohain12@gmail.com',
        'test_3_e.suryadathan@gmail.com',
        'test_3_foreverjoy7296@gmail.com',
        'test_3_hiteshmaniyar86@gmail.com',
        'test_3_adrija.141@gmail.com',
        'test_3_shweta.ranshur@gmail.com',
    ];
    if (env.NODE_ENV == 'stage' && testEmails.includes(email)) {
        let prefix =
            'http://passionbits-prod-user.s3-website-us-east-1.amazonaws.com';
        if (doc && Array.isArray(doc.images) && doc.images.length > 0) {
            for (let imgSubDoc of doc.images) {
                imgSubDoc.imageUrl = imgSubDoc.imageUrl.replace(
                    env.S3_BUCKET_WEBSITE_URL,
                    prefix,
                );
                imgSubDoc.original = imgSubDoc.original.replace(
                    env.S3_BUCKET_WEBSITE_URL,
                    prefix,
                );
                // In image block each image has a thumbnail
                if (imgSubDoc.thumbnail) {
                    imgSubDoc.thumbnail = imgSubDoc.thumbnail.replace(
                        env.S3_BUCKET_WEBSITE_URL,
                        prefix,
                    );
                }
            }
        }
        // Also create full path of coverImage for ImageBlock
        if (
            doc &&
            doc.__t == C.MODELS.IMAGE_BLOCK &&
            doc.coverImage &&
            doc.coverImage.length > 0
        ) {
            doc.coverImage = doc.coverImage.replace(
                env.S3_BUCKET_WEBSITE_URL,
                prefix,
            );
        }
        // For PDF Block - File location and cover image
        if (doc && doc.__t == C.MODELS.PDF_BLOCK) {
            if (doc.coverImage && doc.coverImage.length > 0)
                doc.coverImage = doc.coverImage.replace(
                    env.S3_BUCKET_WEBSITE_URL,
                    prefix,
                );
            if (doc.fileLocation && doc.fileLocation.length > 0)
                doc.fileLocation = doc.fileLocation.replace(
                    env.S3_BUCKET_WEBSITE_URL,
                    prefix,
                );
        }
        return doc;
    }
    return doc;
};

exports.customWrapper = customWrapper;

exports.buildQuery = ({ pul, id }) => {
    if (!(id || pul)) {
        throw new BadRequest('id or pul is required');
    }
    let query = {};
    if (id) {
        query._id = id;
        return query;
    }

    const idFromPUL = pul.substring(pul.length - 24);
    if (idFromPUL.length == 24 && mongoose.isValidObjectId(idFromPUL)) {
        // ?? If length is less than 24 isValidObjectId returns true
        query._id = idFromPUL;
    } else {
        // to handle old url structure which did not have id at the end
        randomFromPUL = pul.substring(pul.length - 8);
        query.pul = {
            $regex: randomFromPUL,
        };
    }
    return query;
};

exports.fetchPublicPrivateView = async ({
    user,
    publicView,
    userDashboardView,
    urlName,
}) => {
    /*
    Single Page structure (publicView && userDashboardView)

    page = {
        id,
        name,
        userDetails: {},
        profileColor,
        layout,
        experiences: [], keeping for backwards compatibility, to be removed
        ?? Why do we have a separate testimonials array
        testimonials: [],
        blocks: [], 
        hidden: [],
    };
    */

    let pages = new Map();
    let pageQuery = {
        uid: user.id,
    };

    if (publicView) {
        // In public view only fetch public pages and pages not in copying state
        pageQuery = { ...pageQuery, pst: C.PAGE_STATES.CREATED, pbl: true };

        if (urlName) {
            // If urlName was provided
            const pageByUrl = await Page.findOne({
                un: urlName,
            })
                .select('pbl')
                .exec();
            if (pageByUrl && pageByUrl.public === false) {
                // If urlName is a private page
                // Fetch this page only and no other pages
                pageQuery.pbl = false;
                pageQuery.un = urlName;
            }
        }
    }

    // Other details for user to complete portfolio
    let samplesAdded = false;
    let servicesAdded = false;
    let workExAdded = false;
    let testimonialAdded = false;
    let socialsAdded = false;
    let photoAdded = false;
    const allPages = await Page.find(pageQuery)
        .populate({
            path: 'cth',
        })
        .exec();
    if (allPages.length == 0)
        throw new BadRequest('No Pages to fetch for this portfolio');
    _.forEach(allPages, (page) => {
        let toSet = {
            ...page.toJSON(),
            // ! experiences kept for backwards compatibility, to be removed
            experiences: [],
            testimonials: [],
            blocks: [],
            hidden: [],
        };
        photoAdded = photoAdded || toSet.userDetails.image.length > 0;
        // Social Media links to be sent sorted by position
        const socialLinks = Object.keys(toSet.userDetails.socialLinks).map(
            (key) => {
                socialsAdded =
                    socialsAdded ||
                    toSet.userDetails.socialLinks[key].link.length > 0;
                return {
                    [key]: toSet.userDetails.socialLinks[key],
                };
            },
        );
        // console.log(socialLinks);
        socialLinks.sort((a, b) => {
            a = a[Object.keys(a)[0]].position;
            b = b[Object.keys(b)[0]].position;

            if (a > b) return 1;
            else if (a < b) return -1;
            else return 0;
        });
        toSet.userDetails.socialLinks = socialLinks;
        pages.set(page.id, toSet);
    });
    let query = {
        uid: user.id,
        pid: { $in: Array.from(pages.keys()) },
    };
    if (publicView) {
        query.hid = false;
    }
    let allBlocks = await Block.find(query)
        .select('-fu')
        // populate imported service block fields
        .populate([
            {
                path: 'sref',
                select: 't desc prc ru dt curr ft cmsg askm cln pg',
            },
            {
                path: 'uref',
                select: 'n pn img strp.acid',
            },
        ])
        .sort('pos')
        .exec();
    if (allBlocks.length > 0) {
        for (let block of allBlocks) {
            block = customWrapper(block.toJSON(), user.email);
            let pageData = pages.get(block.pageId.toString());

            // * Keep images array only in Image block
            if (
                block.type !== C.MODELS.IMAGE_BLOCK &&
                Array.isArray(block.images)
            ) {
                delete block.images;
            }

            // * If Image Block
            if (block.type == C.MODELS.IMAGE_BLOCK) {
                // * Doing this for backwards compatibility
                // * Older images might not have cover image
                for (let image of block.images) {
                    if (!image.thumbnail) {
                        image.thumbnail = image.original;
                    }
                }
            }

            // * If testimonial Block
            if (block.type == C.MODELS.TESTIMONIAL_BLOCK) {
                if (publicView) {
                    block.testimonials = block.testimonials.filter(
                        (t) => t.requested == false,
                    );
                }
                block.testimonials.sort(sortByPosition);
                pageData.testimonials = [
                    ...pageData.testimonials,
                    ...block.testimonials,
                ];
                testimonialAdded =
                    testimonialAdded || block.testimonials.length > 0;
            }
            // * If Experience Block
            if (block.type == C.MODELS.EXPERIENCE_BLOCK) {
                let experiences = block.experiences;
                experiences.sort(sortByPosition);
                pageData.experiences = experiences;
                block.experiences = experiences;
                workExAdded = workExAdded || experiences.length > 0;
            }
            // * Service Block
            if (block.type === C.MODELS.SERVICE_BLOCK) {
                if (block.feesType === C.SERVICE_BLOCK_FEES_TYPE.PREPAID) {
                    // For direct charge on stripe, on FE load stripe with account Id
                    // So we include stripe account Id of creator with this block
                    block.stripeAccountId = user.strp.acid;
                }
            }

            // * Imported Service Block
            if (block.type === C.MODELS.IMPORTED_SERVICE) {
                let service = {
                    title: '',
                    description: '',
                    price: 0,
                    feesType: '',
                    rateUnit: null,
                    deliveryTime: '',
                    currency: 'inr',
                    customMessage:
                        'Hey, Thanks for showing interest in my content services. I will get back to you on this shortly!',
                    askMoreFields: [],
                    calendly: '',
                    paymentGateway: '',
                };
                if (block.collabType == C.COLLAB_TYPE.REFER) {
                    service = { ...block.serviceRef };
                } else {
                    service.title = block.title;
                    service.description = block.description;
                    service = { ...service, ...block.details };
                }
                delete block.details;
                delete block.serviceRef;
                delete block.title;
                delete block.description;
                delete block.tags;
                delete block.category;
                block.service = service;

                if (
                    block.service.feesType === C.SERVICE_BLOCK_FEES_TYPE.PREPAID
                ) {
                    // For direct charge on stripe, on FE load stripe with account Id
                    // So we include stripe account Id of service owner with this block
                    block.service.stripeAccountId =
                        block.collabType == C.COLLAB_TYPE.REFER
                            ? block.userRef.stripeInfo.accountId
                            : user.strp.acid;
                }
            }

            if (block.hidden) pageData.hidden.push(block);
            else pageData.blocks.push(block);

            pages.set(block.pageId.toString(), pageData);

            // Update other detail variables
            if (block.type == C.MODELS.SERVICE_BLOCK) {
                servicesAdded = true;
            }
            if (
                ![
                    C.MODELS.SERVICE_BLOCK,
                    C.MODELS.TESTIMONIAL_BLOCK,
                    C.MODELS.EXPERIENCE_BLOCK,
                ].includes(block.type)
            ) {
                samplesAdded = true;
            }
        }
    }
    pages = Array.from(pages.values());
    pages.sort(sortByPosition);
    return {
        pages,
        rewardFields: {
            samplesAdded,
            servicesAdded,
            workExAdded,
            testimonialAdded,
            socialsAdded,
            photoAdded,
        },
    };
};

/**
 * @returns
 * page{}
 * allPages[]
 */

exports.fetchPublicPrivateViewPage = async ({ publicView, user, urlName }) => {
    // Find all pages of porfolio
    let pageQuery = {
        uid: user.id,
    };

    if (publicView) {
        // In public view only fetch public pages and pages not in copying state
        pageQuery = { ...pageQuery, pst: C.PAGE_STATES.CREATED, pbl: true };
    }

    let allPages = await Page.find(pageQuery)
        .populate({
            path: 'cth',
        })
        .exec();
    if (allPages.length == 0)
        throw new BadRequest('No page found for this user');
    allPages = _.map(allPages, (p) => {
        let data = p.toJSON();
        const socialLinks = Object.keys(data.userDetails.socialLinks).map(
            (key) => {
                return {
                    [key]: data.userDetails.socialLinks[key],
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
        data.userDetails.socialLinks = socialLinks;
        return data;
    });
    allPages.sort(sortByPosition);

    // The current page

    let thisPageDetails;

    if (urlName) {
        const idx = allPages.findIndex((p) => p.urlName == urlName);
        if (idx == -1) throw new BadRequest('The requested page was not found');

        thisPageDetails = allPages[idx];

        if (thisPageDetails.public == false) {
            // If urlName is of a private page
            // allPages array should return only the page which is private
            allPages = [thisPageDetails];
        }
    } else {
        // If no urlName then select first page
        thisPageDetails = allPages[0];
    }

    // page object with blocks
    /** page = {
        id,
        name,
        userDetails: {},
        profileColor,
        layout,
        customTheme,
        blocks: [], 
        hidden: [],
        };
     */
    let page = {
        ...thisPageDetails,
        blocks: [],
        hidden: [],
    };

    let blockQuery = { uid: user.id, pid: thisPageDetails.id };
    let allBlocks = await Block.find(blockQuery)
        .select('-fu')
        .sort('pos')
        .exec();
    for (let block of allBlocks) {
        // * Keep images array only in Image block
        if (
            block.type !== C.MODELS.IMAGE_BLOCK &&
            Array.isArray(block.images)
        ) {
            delete block.images;
        }

        // * If Image Block
        if (block.type == C.MODELS.IMAGE_BLOCK) {
            // * Doing this for backwards compatibility
            // * Older images might not have cover image
            for (let image of block.images) {
                if (!image.thumbnail) {
                    image.thumbnail = image.original;
                }
            }
        }

        // * If testimonial Block
        if (block.type == C.MODELS.TESTIMONIAL_BLOCK) {
            if (publicView) {
                block.testimonials = block.testimonials.filter(
                    (t) => t.requested == false,
                );
            }
            block.testimonials.sort(sortByPosition);
        }
        // * If Experience Block
        if (block.type == C.MODELS.EXPERIENCE_BLOCK) {
            block.experiences.sort(sortByPosition);
        }
        // * Service Block
        if (block.type === C.MODELS.SERVICE_BLOCK) {
            if (block.feesType === C.SERVICE_BLOCK_FEES_TYPE.PREPAID) {
                // For direct charge on stripe, on FE load stripe with account Id
                // So we include stripe account Id of creator with this block
                block.stripeAccountId = user.strp.acid;
            }
        }

        if (block.hidden) page.hidden.push(block);
        else page.blocks.push(block);
    }

    return {
        allPages,
        page,
    };
};

exports.fetchCommunityView = async ({
    pageIds,
    user,
    portfolio_owner,
    visitorId,
}) => {
    /*

    These two fields are not part of page
    They are returned separtely

    experiences: [], -> from user schema
    testimonials: [], -> combined from all pages
    
    Single Page structure (communityView)

    page = {
        services: [], 
        collabServices: [],
        blocks: [], // exclude experience, testimonial, services, imported service
    };
    */

    let pages = new Map();

    let pageQuery = {
        uid: user.id,
        pst: C.PAGE_STATES.CREATED,
    };

    if (Array.isArray(pageIds) && pageIds.length > 0) {
        // First check if all pageIds exist
        const checkPages = await Page.find({
            ...pageQuery,
            _id: {
                $in: pageIds,
            },
        })
            .select('_id')
            .exec();
        if (checkPages.length > 0) {
            // If atleast one page from pageIds array exists, we fetch those pages only
            pageQuery = {
                ...pageQuery,
                _id: {
                    $in: pageIds,
                },
            };
        } else {
            // Otherwise we only fetch the public pages
            pageQuery = {
                ...pageQuery,
                pbl: true,
            };
        }
    }
    const allPages = await Page.find(pageQuery)
        .select('-sb -lay -pfc -udet')
        .exec();
    if (allPages.length == 0)
        throw new BadRequest('No Pages to fetch for this portfolio');

    _.forEach(allPages, (page) => {
        let toSet = {
            ...page.toJSON(),
            services: [],
            collabServices: [],
            blocks: [],
        };
        pages.set(page.id, toSet);
    });

    const blockQuery = {
        uid: user.id,
        pid: { $in: Array.from(pages.keys()) },
        __t: {
            $nin: [C.MODELS.EXPERIENCE_BLOCK, C.MODELS.PAGE_BREAK],
        },
    };

    let experiences = [];
    let testimonials = [];

    if (!portfolio_owner) {
        blockQuery.hid = false;
    }

    let allBlocks = await Block.find(blockQuery)
        .select('-fu -cmsg -askm -cln -pg')
        // populate imported service block fields
        .populate([
            {
                path: 'sref',
                select: '-cmsg -askm -cln -pg',
            },
            {
                path: 'uref',
                select: 'n pn img',
            },
        ])
        .sort('pos')
        .exec();

    // Find all services visitor has already imported from this user's portfolio
    const imported = await CollabImport.find({
        u: visitorId,
        svo: user.id,
        st: C.COLLAB_IMPORT_STATES.ACTIVE,
    })
        .select('sv')
        .exec();
    const importedServices = new Set();
    for (let service of imported) {
        importedServices.add(service.sv.toString());
    }
    // each block
    for (let block of allBlocks) {
        block = block.toJSON();

        let pageData = pages.get(block.pageId.toString());

        // * If Image Block
        if (block.type == C.MODELS.IMAGE_BLOCK) {
            // * Doing this for backwards compatibility
            // * Older images might not have cover image
            for (let image of block.images) {
                if (!image.thumbnail) {
                    image.thumbnail = image.original;
                }
            }
        }
        // * Keep images array only in Image block
        if (
            block.type !== C.MODELS.IMAGE_BLOCK &&
            Array.isArray(block.images)
        ) {
            delete block.images;
        }

        // * If Image Block
        if (block.type == C.MODELS.IMAGE_BLOCK) {
            // * Doing this for backwards compatibility
            // * Older images might not have cover image
            for (let image of block.images) {
                if (!image.thumbnail) {
                    image.thumbnail = image.original;
                }
            }
        }

        // * If testimonial Block
        if (block.type == C.MODELS.TESTIMONIAL_BLOCK) {
            // block.testimonials.sort(sortByPosition);
            let tstms = block.testimonials;
            tstms = tstms.filter((t) => t.requested == false);

            testimonials.push(...tstms);
        }
        // * Service Block
        if (block.type === C.MODELS.SERVICE_BLOCK) {
            /* if (block.feesType === C.SERVICE_BLOCK_FEES_TYPE.PREPAID) {
                // For direct charge on stripe, on FE load stripe with account Id
                // So we include stripe account Id of creator with this block
                block.stripeAccountId = user.strp.acid;
            } */
            block.serviceImported = false;
            if (importedServices.has(block.id)) {
                block.serviceImported = true;
            }
            pageData.services.push(block);
        }

        // * Imported Service block
        if (block.type == C.MODELS.IMPORTED_SERVICE) {
            let service = {
                title: '',
                description: '',
                price: 0,
                feesType: '',
                rateUnit: null,
                deliveryTime: '',
                currency: 'inr',
            };
            if (block.collabType == C.COLLAB_TYPE.REFER) {
                service = { ...block.serviceRef };
            } else {
                service.title = block.title;
                service.description = block.description;
                service = { ...service, ...block.details };
            }
            delete block.details;
            delete block.serviceRef;
            delete block.title;
            delete block.description;
            delete block.tags;
            delete block.category;
            block.service = service;
            pageData.collabServices.push(block);
        }

        if (
            block.type !== C.MODELS.TESTIMONIAL_BLOCK &&
            block.type !== C.MODELS.SERVICE_BLOCK &&
            block.type !== C.MODELS.IMPORTED_SERVICE
        ) {
            pageData.blocks.push(block);
        }
    }

    pages = Array.from(pages.values());
    pages.sort(sortByPosition);

    experiences = user.experiences;
    experiences.sort(sortByPosition);

    return {
        experiences,
        testimonials,
        pages,
    };
};

/**
 * Authentication check functions used inside the controllers,
 * Since routes corresponding to these controllers can be used by both authenticated and unauthenticated users
 */

// Returns owner object of requested portfolio and a boolean to shows if requester is owner or not
exports.ownerShipCheck = async ({ user, pn, creatorId }) => {
    let portfolio_owner = false;
    // Check if user is owner of requested profile
    if (user && user.__t === C.MODELS.WRITER_C) {
        if (pn && user.pn === pn) portfolio_owner = true;
        else if (creatorId && user.id == creatorId) portfolio_owner = true;
    }
    if (!portfolio_owner) {
        let query = {};
        if (pn) query.pn = pn;
        else if (creatorId) query._id = creatorId;
        else
            throw new InternalServerError('Either pn or creatorId is required');
        let getUser = await Creator.findOne(query).exec();
        if (!getUser) {
            throw new BadRequest('user not found', 'CRGN100');
        }
        return { portfolioOfUser: getUser, portfolio_owner };
    }
    return { portfolioOfUser: user, portfolio_owner };
};

// Returns owner object of requested portfolio and a boolean to shows if requester is owner or not
exports.studioOwnerShipCheck = async ({ user, stid }) => {
    let portfolio_owner = false;
    // Check if user is owner of requested profile
    if (user && user.__t === C.MODELS.PM_C && user.stid === stid) {
        portfolio_owner = true;
    }

    if (!portfolio_owner) {
        let getUser = await PM.findOne({ stid: stid }).exec();
        if (!getUser) {
            throw new BadRequest('user not found', 'CRGN100');
        }
        return { portfolioOfUser: getUser, portfolio_owner };
    }
    return { portfolioOfUser: user, portfolio_owner };
};

/*
 * Module Dependencies
 */

const mongoose = require('mongoose');
const _ = require('lodash');
const moment = require('moment');
const C = require('../lib/constants');
const env = require('../config/env');
const { v4: uuidv4 } = require('uuid');
const { BadRequest, InternalServerError } = require('../lib/errors');

// MODELS

const Creator = mongoose.model(C.MODELS.WRITER_C);
const PM = mongoose.model(C.MODELS.PM_C);
const ExtClient = mongoose.model(C.MODELS.EXT_CLIENT);
const Project = mongoose.model(C.MODELS.PROJECT);
const ConversationClient = mongoose.model(C.MODELS.CONVERSATION_CLIENT);
const ConversationPM = mongoose.model(C.MODELS.CONVERSATION_PM);
const ConversationExt = mongoose.model(C.MODELS.CONVERSATION_EXT);
const Message = mongoose.model(C.MODELS.MESSAGE);
const ExtRequest = mongoose.model(C.MODELS.EXT_REQUEST);
const Page = mongoose.model(C.MODELS.PAGE);

// v3.1
const Block = mongoose.model(C.MODELS.BLOCK);
const TestimonialBlock = mongoose.model(C.MODELS.TESTIMONIAL_BLOCK);
const ExperienceBlock = mongoose.model(C.MODELS.EXPERIENCE_BLOCK);
const ServiceBlock = mongoose.model(C.MODELS.SERVICE_BLOCK);
const InvoiceBill = mongoose.model(C.MODELS.INVOICE_BILL);

const CollabImport = mongoose.model(C.MODELS.COLLAB_IMPORT);

/**
 * Utility functions
 */
const { notification } = require('../messaging/index');
const { getObject } = require('../utils/s3-operations');
const { getPaymentGatewayCharge } = require('./helpers/clientHelpers');

/**
 * Services
 */

const userService = require('../services/db/user');
const stripeService = require('../services/stripe');
const razorpayService = require('../services/razorpay');
const rtService = require('../services/rt');

/**
 * Helpers
 */

const {
    fetchPublicPrivateView,
    fetchCommunityView,
    ownerShipCheck,
    studioOwnerShipCheck,
    sortByPosition,
    customWrapper,
    buildQuery,
    fetchPublicPrivateViewPage,
} = require('./helpers/commonHelpers');
const { createConversationCreator } = require('./helpers/chatHelpers');
const { sendLinkToExtClient } = require('./internal');

// Misc
const templateData = require('../assets/templates/templates.json')[
    env.NODE_ENV
];

/**
 *  Portfolio Controllers
 */

exports.portfolioGeneralInfo = async ({ user, pn }) => {
    let { portfolioOfUser, portfolio_owner } = await ownerShipCheck({
        user,
        pn,
    });
    // User who is visiting this profile (creator, client, pm, guest)
    let authenticatedUser = user;
    // user = creator portfolio user object
    user = portfolioOfUser;
    const personal = {
        image: user.img,
        firstname: user.n.f,
        lastname: user.n.l,
        email: user.e,
        bio: user.bio,
        designation: user.pdg,
        country: user.adr.co,
        city: user.adr.ci,
        connections: 13,
        proficiencies: user.sls,
    };
    const socialMediaLinks = user.sml;
    const experience = [];
    for (let exp of user.pfi) {
        exp = exp.toJSON();
        let toSend = { ...exp };
        toSend.image = toSend.logo;
        toSend.company = toSend.organization;
        delete toSend.organization;
        delete toSend.logo;
        experience.push(toSend);
    }
    //  Testimonials
    // Pending Requests
    let pending = [];
    // Bookmarked Testimonials
    const bookmarked = [];
    // All testimonials except bookmarked
    // When portfolio_owner is false send only public in all
    const all = [];
    for (let ts of user.tstm) {
        if (ts.isb) {
            bookmarked.push(ts);
            continue;
        }
        // for pending we have req (requested) field
        // req > means still it's in requested state
        // when client reply then req becomes false, means it's no more in requested state
        if (portfolio_owner == true && ts.req == true) {
            pending.push(ts.toJSON());
            continue;
        }
        if (ts.isp == true || portfolio_owner == true) {
            all.push(ts);
            continue;
        }
    }
    // for (let ts of user.rtstm) {
    //     if (ts.received == false) pending.push(ts.toJSON());
    // }
    let testimonials = {
        bookmarked,
        all,
        // brandLogos: user.bls,
    };
    // Send pending to portfolio owner only
    if (portfolio_owner) {
        testimonials = { ...testimonials, pending };
    }
    // Portfolio Completion Info
    let portfolioComplete = {
        invited: {
            refCount: user.rd.rc,
            maxRef: C.ACCOUNT_C.INVITE_MAX,
        },
        shared: false,
        projectCount: 0,
        projectAdded: false,
        submitted: user.sbmt,
    };
    if (
        user.ssd.tw == 'clicked' ||
        user.ssd.li == 'clicked' ||
        user.ssd.fb == 'clicked'
    )
        portfolioComplete.shared = true;
    // Get Creator Project counts
    let projectCount = await Project.countDocuments({ cid: user._id }).exec();
    portfolioComplete.projectCount = Math.min(projectCount, 3);
    if (projectCount >= 3) portfolioComplete.projectAdded = true;
    let userInfo = {
        personal,
        experience,
        testimonials,
        socialMediaLinks,
        portfolioComplete,
        portfolio_owner,
        id: user.id,
        level: user.lv,
    };
    if (portfolio_owner) userInfo = { ...userInfo, onboardingState: user.onbs };
    /**
     * If authenticated user is client get shortlisted and invited status
     * Also return inboxDetails of conversation if present
     */
    if (
        !portfolio_owner &&
        authenticatedUser &&
        authenticatedUser.__t == C.MODELS.CLIENT_C
    ) {
        let shortlisted = false,
            invited = false,
            accepted = false;
        if (authenticatedUser.shortlisted.includes(user.id)) shortlisted = true;
        const findConversation = await ConversationClient.findOne({
            u1: authenticatedUser.id,
            u2: user.id,
            st: C.CONVERSATION_STATUS.CREATED,
        }).exec();
        let inboxDetails = null;
        if (findConversation) {
            invited = true;
            inboxDetails = {
                fullname: user.fullname,
                state: findConversation.state,
                conversationId: findConversation.id,
                type:
                    findConversation.state == C.CONVERSATION_STATE.ACTIVE
                        ? C.CONVERSATION_TYPE.PROJECT
                        : C.CONVERSATION_TYPE.INBOX,
            };
            accepted = findConversation.state == C.CONVERSATION_STATE.ACTIVE;
        }
        userInfo = {
            ...userInfo,
            shortlisted,
            invited,
            accepted,
            isClient: true,
            inboxDetails,
            accepted,
        };
    }
    if (
        !portfolio_owner &&
        authenticatedUser &&
        authenticatedUser.__t == C.MODELS.PM_C
    ) {
        let shortlisted = false,
            invited = false,
            accepted = false;
        // Check if pm has shortlisted creator
        if (authenticatedUser.shortlisted.includes(user.id)) shortlisted = true;
        const findConversation = await ConversationPM.findOne({
            u1: authenticatedUser.id,
            u2: user.id,
            st: C.CONVERSATION_STATUS.CREATED,
        }).exec();
        if (findConversation) {
            // If conversation exists between PM and creator and that conversation
            // has a invite sent by pm or a request message sent by creator
            // mark invited to true
            // Note that conversation can be started via job board also, so it won't contain a invite or request message in that case
            const inviteOrRequest = await Message.find({
                convoId: findConversation.id,
                __t: {
                    $in: [C.MODELS.STUDIO_INVITE, C.MODELS.STUDIO_REQUEST],
                },
            }).exec();
            if (inviteOrRequest.length !== 0) {
                invited = true;
                if (
                    inviteOrRequest[0].st == C.STUDIO_REQUEST_STATES.ACCEPTED ||
                    inviteOrRequest[0].st == C.STUDIO_INVITE_STATES.ACCEPTED
                ) {
                    accepted = true;
                }
            }
        }
        userInfo = {
            ...userInfo,
            shortlisted,
            invited,
            accepted,
        };
    }
    let isPM = false;
    isPM =
        !portfolio_owner &&
        authenticatedUser &&
        authenticatedUser.__t == C.MODELS.PM_C;
    return { ...userInfo, isPM };
};

// Portfolio Projects
exports.getPortfolioProjects = async ({
    user,
    page,
    ptype,
    pn,
    // If true get all project types
    allTypes = false,
}) => {
    let { portfolioOfUser, portfolio_owner } = await ownerShipCheck({
        user,
        pn,
    });
    user = portfolioOfUser;
    const customLabels = {
        docs: 'posts',
    };
    let query = {
        cid: user._id,
        // $or: [{ del: { $exists: false } }, { del: false }],
        del: false,
    };
    if (allTypes) {
        let fetchPublicOnly = !portfolio_owner;
        if (fetchPublicOnly) {
            query = {
                ...query,
                $or: [
                    {
                        __t: C.MODELS.LONG_FORM,
                        lst: C.LONG_FORM_STATES.SAVED,
                        pblc: fetchPublicOnly,
                    },
                    {
                        __t: {
                            $in: [C.MODELS.CARDS, C.MODELS.PDF],
                        },
                    },
                ],
            };
        } else {
            query = {
                ...query,
                $or: [
                    { __t: C.MODELS.LONG_FORM, lst: C.LONG_FORM_STATES.SAVED },
                    {
                        __t: {
                            $in: [C.MODELS.CARDS, C.MODELS.PDF],
                        },
                    },
                ],
            };
        }
    } else {
        query = { ...query, __t: ptype };
        if (ptype == C.MODELS.LONG_FORM) {
            // Don't returned LongForm with state INIT
            query = { ...query, lst: C.LONG_FORM_STATES.SAVED };
            // Filter out private long form for portfolio_owner=false
            if (portfolio_owner == false) query = { ...query, pblc: true };
        }
    }
    const options = {
        sort: { createdAt: -1 },
        select: '-ful',
        customLabels,
        populate: { path: 'cid', select: 'cid n pn img' },
        page,
        limit: 6,
    };
    let allProjects = await Project.paginate(query, options);
    const posts = [];
    for (let post of allProjects.posts) {
        toSend = post.toJSON();
        toSend.creator = toSend.creatorId;
        // Only Send Cover Image for long form
        // Cover Image is first image
        if (toSend.__t == C.MODELS.LONG_FORM) {
            let coverImage = '';
            if (toSend.images.length > 0) {
                coverImage = toSend.images[0].thumbnail;
            }
            toSend.image = coverImage;
            delete toSend.images;
        }
        delete toSend.creatorId;
        posts.push(toSend);
    }
    const pageDetails = allProjects;
    delete pageDetails.posts;
    return { posts, pageDetails, portfolio_owner };
};

exports.getProjectFromUrl = async ({ user, pul }) => {
    let project = await Project.findOne({
        pul: pul,
        $or: [{ del: { $exists: false } }, { del: false }],
    })
        .populate('cid', 'cid n pn stid img')
        .exec();
    if (!project) throw new BadRequest('Project Not found', 'CRPL105');
    let portfolio_owner = false;
    if (project.cid.__t == C.ROLES.WRITER_C) {
        let temp = await ownerShipCheck({
            user,
            pn: project.cid.pn,
        });
        portfolio_owner = temp.portfolio_owner;
    }
    if (project.cid.__t == C.ROLES.PM_C) {
        let temp = await studioOwnerShipCheck({
            user,
            stid: project.cid.stid,
        });
        portfolio_owner = temp.portfolio_owner;
    }
    if (!portfolio_owner && project.pblc == false) {
        throw new BadRequest('Accessing Private Content', 'CRPL111');
    }
    // Create response
    let response = {};
    // If authenticated user is PM, they can import project if creator is part of the studio
    if (user && user.__t == C.ROLES.PM_C) {
        // check if pm has imported this project
        let imported = false;
        imported = user.impr.includes(project.id);
        // Check if project creator and member of studio to allow import
        const pmMemberIds = _.map(user.mmb, (member) => {
            return member.uid.toString();
        });
        let idx = pmMemberIds.indexOf(project.cid.id.toString());
        let canImport = idx !== -1 && imported == false;
        response = { ...response, imported, canImport, isPM: true };
    }
    // If long form send content
    if (project.__t == C.MODELS.LONG_FORM) {
        const prefixS3 = project.ful.replace(
            env.S3_BUCKET_USER_DATA_URL + '/',
            '',
        );
        const content = await getObject(env.S3_BUCKET_USER_DATA, prefixS3);
        // TODO: File content can be a stream. This will save memory
        response = { ...response, content };
    }
    project = project.toJSON();
    project.creator = project.creatorId;

    delete project.creatorId;
    delete project.fileUrl;
    response = { ...response, project, portfolio_owner };
    return response;
};

/**
 * * Portfolio v3.1 common APIs controllers
 */

exports.userAuthCheck = async ({ user }) => {
    let authenticated = false;
    if (user) authenticated = true;
    let response = {
        authenticated,
    };
    if (authenticated) {
        response = {
            ...response,
            role: user.__t,
            name: user.n.f,
            id: user.id,
        };
    }
    return response;
};

exports.getInTouchCreator = async ({
    user,
    email,
    sid,
    calendlyScheduled,
    formFields,
}) => {
    if (user && user.__t == C.ROLES.CLIENT_C) {
        // If user is authenticated and is a client, use email of client to get in touch if email was not provided
        if (!email) email = user.e;
    } else if (!email) {
        // Otherwise email is required
        // Throw error if email is not provided
        throw new BadRequest(
            'Email is required if authenticated user is not a client',
        );
    }
    user = await userService.getUserByEmail({ email });
    // If user by this email already exists on platform
    // Only Clients and ExtClients are allowed to get in touch
    if (
        user &&
        !(
            user.__t === C.ROLES.CLIENT_C ||
            user.__t === C.ROLES.EXT_CLIENT ||
            user.__t === C.ROLES.WRITER_C
        )
    ) {
        throw new BadRequest(
            `This email is already registered on passionbits as a ${user.__t}. You should be a client/ExtClient or writer to get in touch`,
        );
    }
    const service = await Block.findOne({
        _id: sid,
        __t: {
            $in: [C.MODELS.SERVICE_BLOCK, C.MODELS.IMPORTED_SERVICE],
        },
    })
        .select('imp uid svo uref sref clt t hmi')
        .populate({ path: 'sref', select: 't' })
        .exec();
    if (!service) throw new BadRequest('This service was not found');

    if (user && user.id == service.uid) {
        throw new BadRequest('You cannot get in touch on your own service');
    }

    if (
        service.__t == C.MODELS.IMPORTED_SERVICE &&
        service.userRef &&
        user &&
        user.id == service.userRef
    ) {
        throw new BadRequest(
            'Owners of service of imported service cannot get in touch',
        );
    }

    let extclient, convo, extRequest;
    let receiver = '',
        receiverPc = 0;

    let getInTouchUser,
        getInTouchTitle = '';
    if (service.__t == C.MODELS.IMPORTED_SERVICE) {
        if (service.collabType == C.COLLAB_TYPE.REFER) {
            getInTouchUser = service.userRef;
            getInTouchTitle = service.serviceRef.title;
        } else {
            getInTouchUser = service.uid;
            getInTouchTitle = service.title;
        }
    } else {
        getInTouchUser = service.uid;
        getInTouchTitle = service.title;
    }

    if (user && user.__t == C.ROLES.CLIENT_C) {
        // If on-platform client wants to get in touch
        convo = await ConversationClient.findOne({
            u1: user.id,
            u2: getInTouchUser,
        }).exec();
        if (!convo) {
            convo = new ConversationClient({
                u1: user.id,
                u2: getInTouchUser,
                st: C.CONVERSATION_STATUS.CREATED,
                ctw: C.CONVERSATION_CLIENT_U2.CREATOR,
                sta: C.CONVERSATION_STATE.ACTIVE,
            });
        } else if (convo.st == C.CONVERSATION_STATUS.INIT) {
            // If conversation is in the init state
            // ?? init state was added when old file upload flow was used to create conversations.
            // ?? ex when client sends brief to creator, we create conversation for file upload before invite is sent
            // ?? Find way to remove this state
            convo.st = C.CONVERSATION_STATUS.CREATED;
            convo.ctw = C.CONVERSATION_CLIENT_U2.CREATOR;
        }
        extRequest = new ExtRequest({
            convoId: convo.id,
            sd: user.id,
            sref: service.id,
            imp: service.imp ? service.imp : null,
            txt: calendlyScheduled
                ? `${email} scheduled a meet with you on ${moment()
                      .utc()
                      .format('YYYY-MM-DD')}`
                : `Hey, I'm interested in ${getInTouchTitle}.`,
            calendlyScheduled,
            minf: formFields,
        });
        convo.lmd = Date.now();
        convo.lmsg = extRequest.id;
        // ! This is read-modify-write transaction.
        convo.p2 = convo.p2 + 1;
        receiver = convo.u2;
        receiverPc = convo.p2;
    } else if (user && user.__t == C.ROLES.WRITER_C) {
        convo = await createConversationCreator({
            u1: getInTouchUser,
            u2: user.id,
        });
        extRequest = new ExtRequest({
            convoId: convo.id,
            sd: user.id,
            sref: service.id,
            imp: service.imp ? service.imp : null,
            txt: calendlyScheduled
                ? `${email} scheduled a meet with you on ${moment()
                      .utc()
                      .format('YYYY-MM-DD')}`
                : `Hey, I'm interested in ${getInTouchTitle}.`,
            calendlyScheduled,
            minf: formFields,
        });
        convo.lmd = Date.now();
        convo.lmsg = extRequest.id;
        // ! This is read-modify-write transaction.
        if (user.id == convo.u1) {
            convo.p2 = convo.p2 + 1;
            receiver = convo.u2;
            receiverPc = convo.p2;
        } else {
            convo.p1 = convo.p1 + 1;
            receiver = convo.u1;
            receiverPc = convo.p1;
        }
    } else if (user && user.__t == C.ROLES.EXT_CLIENT) {
        // When ExtClient wants to get in touch
        convo = await ConversationExt.findOne({
            u1: user.id,
            u2: getInTouchUser,
        }).exec();
        if (!convo) {
            convo = new ConversationExt({
                u1: user.id,
                u2: getInTouchUser,
                st: C.CONVERSATION_STATUS.CREATED,
            });
        }
        extRequest = new ExtRequest({
            convoId: convo.id,
            sd: user.id,
            sref: service.id,
            imp: service.imp ? service.imp : null,
            txt: calendlyScheduled
                ? `${email} scheduled a meet with you on ${moment()
                      .utc()
                      .format('YYYY-MM-DD')}`
                : `Hey, I'm interested in ${getInTouchTitle}.`,
            calendlyScheduled,
            minf: formFields,
        });
        convo.lmd = Date.now();
        convo.lmsg = extRequest.id;
        // ! This is read-modify-write transaction.
        convo.p2 = convo.p2 + 1;
        receiver = convo.u2;
        receiverPc = convo.p2;
    } else {
        // Create a new ExtClient who wants to get in touch
        extclient = new ExtClient({
            sgm: C.ACCOUNT_SIGNUP_MODE.EMAIL,
            n: { f: email, l: '' },
            e: email,
            // ?? In future when ExtClient wants to become a Client below fields should be set accordingly
            // Until then ExtClient can only access chat using a special link and token
            evt: undefined,
            iev: true,
            p: '',
            acst: C.ACCOUNT_STATUS.ACTIVE,
            refId: uuidv4(),
        });
        convo = new ConversationExt({
            u1: extclient.id,
            u2: getInTouchUser,
            st: C.CONVERSATION_STATUS.CREATED,
            p2: 1,
        });
        extRequest = new ExtRequest({
            convoId: convo.id,
            sd: extclient.id,
            sref: service.id,
            imp: service.imp ? service.imp : null,
            txt: calendlyScheduled
                ? `${email} scheduled a meet with you on ${moment()
                      .utc()
                      .format('YYYY-MM-DD')}`
                : `Hey, I'm interested in ${getInTouchTitle}.`,
            calendlyScheduled,
            minf: formFields,
        });
        convo.lmsg = extRequest.id;
        receiver = convo.u2;
        receiverPc = convo.p2;
        await extclient.save();
        user = extclient;
    }
    await convo.save();
    await extRequest.save();

    // * Post get in touch operations

    const receiverUser = await Creator.findOne({
        _id: receiver,
    })
        .select('n')
        .exec();
    // Send chat access link to client
    await sendLinkToExtClient({
        user,
        creatorName: receiverUser.fullname,
        usecase: 'get-in-touch',
    });

    // Push message to socket
    const sender = {
        name: user.name,
        company: '',
        fullname: user.fullname,
    };
    extRequest = extRequest.toJSON();
    extRequest.sender = sender;

    // TODO: Also push conversation first if its new

    // Send event to users for the new message which was created
    await rtService.sendNewMessage({
        // Receivers
        receivers: [receiver],
        // Message Data
        conversationId: convo.id,
        pendingCount: receiverPc,
        conversationType: C.CONVERSATION_TYPE.INBOX,
        message: extRequest,
    });

    // Push web notification to socket
    await notification.send({
        role: C.MODELS.WRITER_C,
        usecase: 'get_in_touch_writer',
        web: {
            for: {
                id: receiver,
                role: C.MODELS.WRITER_C,
            },
            by: {
                id: user.id,
                role: user.__t,
            },
            actions: {
                n: 'View get in touch',
                d: {
                    messageId: extRequest.id,
                    conversationId: convo.id,
                    fullname: sender.fullname,
                    type: C.CONVERSATION_TYPE.INBOX,
                    state: convo.sta,
                    __t: convo.__t,
                },
            },
            createdAt: Date.now(),
            clientEmail: email,
            serviceName: getInTouchTitle,
            image: '',
        },
    });

    // if imported service collect email
    if (service.__t == C.MODELS.IMPORTED_SERVICE) {
        await CollabImport.updateOne(
            { _id: service.imp },
            { $addToSet: { ecl: email } },
        ).exec();
    }

    return { msg: 'Enquiry submitted sucessfully!', messageId: extRequest.id };
};

exports.addMoreDetails = async ({ mid, data }) => {
    const extRequest = await ExtRequest.findOne({
        _id: mid,
    }).exec();
    if (!extRequest)
        throw new BadRequest('No Request message found by this id');
    extRequest.minf = data;
    for (let fieldValue of Object.values(data)) {
        if (fieldValue.length > 0) {
            extRequest.hmi = true;
            break;
        }
    }
    await extRequest.save();
    return {
        msg: 'Details submitted sucessfully!',
    };
};

exports.payService = async ({
    user,
    email,
    name,
    sid,
    clientCardCountry,
    message,
    formFields,
}) => {
    if (user && user.__t == C.ROLES.CLIENT_C) {
        // If user is authenticated and is a client, use email of client to pay service
        if (!email) email = user.e;
        if (!name) name = user.fullname;
    } else if (!email || !name) {
        // Otherwise email is required
        // Throw error if email is not provided
        throw new BadRequest(
            'Both email and name/company are required if authenticated user is not a client',
        );
    }
    user = await userService.getUserByEmail({ email });
    // If user by this email already exists on platform
    // Only Clients and ExtClients are allowed to get in touch
    if (
        user &&
        !(
            user.__t === C.ROLES.CLIENT_C ||
            user.__t === C.ROLES.EXT_CLIENT ||
            user.__t === C.ROLES.WRITER_C
        )
    ) {
        throw new BadRequest(
            `This email is already registered on passionbits as a ${user.__t}. You should be a client or ExtClient to get in touch`,
        );
    }
    const service = await ServiceBlock.findOne({
        _id: sid,
        ft: C.SERVICE_BLOCK_FEES_TYPE.PREPAID,
        uid: {
            $ne: user.id,
        },
    }).exec();
    if (!service)
        throw new BadRequest(
            'Service of prepaid type with this id was not found',
        );
    // Fetch Creator
    const receiver = await Creator.findOne({
        _id: service.uid,
    })
        .select('n rzpy strp adr.co')
        .exec();
    let response = {};
    if (service.pg == C.PAYMENT_GATEWAY.STRP) {
        /**
         * For stripe we process a direct charge to creators
         * On acknowledgement of request from creator we send chat access link to client
         */
        // Pay Using stripe
        if (!clientCardCountry)
            throw new BadRequest(
                'Country of the payer card country is required for making payments with stripe',
            );
        const recevierAccountId = receiver.strp.acid;
        if (
            !recevierAccountId ||
            receiver.strp.cns != C.STRIPE_CONNECTION_STATUS.COMPLETED
        )
            throw new BadRequest('User is not connected to stripe');
        // Create Payment Intent
        let paymentAmount = service.price;
        // extraCharge may include one or more of - gateway charge, tax and currency conversation charge
        // We pass this charge to the client
        const extraCharge = await getPaymentGatewayCharge({
            pg: C.PAYMENT_GATEWAY.STRP,
            total: paymentAmount,
            presentmentCurrency: service.currency,
            clientCardCountry,
            payeeCountry: C.CURRENCY_COUNTRY.INDIA,
        });
        paymentAmount += extraCharge;
        paymentAmount = Number(paymentAmount.toFixed(2));
        let paymentIntent = await stripeService.createPaymentIntent({
            amount: paymentAmount,
            currency: service.currency,
            metadata: {
                email,
                name,
                creatorId: service.uid.toString(),
                creatorName: receiver.fullname,
                serviceTitle: service.t,
                serviceId: sid,
                amount: service.price,
                currency: service.currency,
                usecase: 'service_pay',
                message,
                ...formFields,
            },
            receipt_email: email,
            asConnected: {
                stripeAccount: `${recevierAccountId}`,
            },
        });
        response = {
            clientSecret: paymentIntent.client_secret,
            amount: paymentAmount,
            accountId: recevierAccountId,
            currency: service.currency,
        };
    } else if (service.pg == C.PAYMENT_GATEWAY.RP) {
        // ! Below points not applicable. Payment is made directly from client to creator and transfer is initiated immediately
        // On razorpay payment is first captured on passionbits
        // After creator acknowledges payment, we initiate a transfer of the amount to creator
        // after which we send chat access link to creator

        const recevierAccountId = receiver.rzpy.acid;
        if (
            !recevierAccountId ||
            receiver.rzpy.obs != C.RZPY_CONNECTION_STATUS.ONBOARDED
        ) {
            throw new BadRequest('Payee is not connected to Razorpay');
        }
        // Create Payment order
        let paymentAmount = service.price;

        // add 2% extra to amount, which is the worst case of pg charges
        paymentAmount *= 1.02;
        paymentAmount = Number(paymentAmount.toFixed(2));

        const orderId = await razorpayService.createOrder({
            amount: paymentAmount,
            receipt: service.id,
            notes: {
                usecase: 'service_pay',
                email,
                creatorName: receiver.fullname,
                serviceTitle: service.t,
                serviceId: sid,
                amount: service.price,
                currency: service.currency,
                /*  email,
                name,
                creatorId: service.uid.toString(),
                creatorName: receiver.fullname,
                serviceTitle: service.t,
                amount: service.price,
                currency: service.currency,
                message, */
            },
            transfers: [
                {
                    account: recevierAccountId,
                    // transfer the service price to the service owner
                    // left amount is collected by us and is deducted as pg charges
                    amount: service.price * 100,
                    currency: 'INR',
                    notes: {
                        usecase: 'service_pay',
                        email,
                        name,
                        creatorId: service.uid.toString(),
                        creatorName: receiver.fullname,
                        serviceTitle: service.t,
                        serviceId: sid,
                        amount: service.price,
                        currency: service.currency,
                        message,
                        on_hold: 0,
                        ...formFields,
                    },
                },
            ],
        });
        response = {
            amount: paymentAmount,
            currency: service.currency,
            orderId,
        };
    } else throw new BadRequest('Unhandled payment gateway');
    await notification.send({
        usecase: 'pay-service-started',
        role: C.ROLES.CLIENT_C,
        email: {
            email,
            creatorName: receiver.fullname,
            serviceTitle: service.t,
            amount: service.price,
            currency: service.currency.toUpperCase(),
        },
    });
    return response;
};

exports.getPennameFromDomain = async ({ domain }) => {
    domain = domain.toLowerCase();
    const creator = await Creator.findOne({
        cdn: domain,
    })
        .select('pn')
        .exec();
    if (!creator)
        throw new BadRequest(
            'No creator was found registered with the custom domain',
        );
    return {
        penname: creator.penname,
    };
};

exports.checkIfDomainExits = async ({ domain }) => {
    domain = domain.toLowerCase();
    const creator = await Creator.findOne({
        cdn: domain,
    })
        .select('pn')
        .exec();
    if (!creator)
        throw new BadRequest(
            'No creator was found registered with the custom domain',
        );
    return {
        exists: true,
    };
};

exports.fetchPortfolio = async ({
    user,
    pn,
    pageIds,
    fetchPublic,
    fetchCommunity,
    // Below parameters provided if we want to fetch a private page
    urlName,
}) => {
    let { portfolioOfUser, portfolio_owner } = await ownerShipCheck({
        user,
        pn,
    });
    // User who is visiting this profile (creator, client, pm, guest)
    let authenticatedUser = user;
    // user = creator portfolio user object
    user = portfolioOfUser;

    // Fetching for public view fetchPublic = true

    let publicView = fetchPublic;

    // User dashboard view
    // 1. portfolio_owner = true
    // 2. fetchPublic = false and fetchCommunity = false

    let userDashboardView = portfolio_owner && !fetchPublic && !fetchCommunity;

    // Fetching for community view if fetchCommunity = true
    let communityView = fetchCommunity;

    // default
    if (!publicView && !userDashboardView && !communityView) {
        publicView = true;
    }

    // * 1. Common data for all view types'
    let experiences = user.experiences;
    experiences.sort(sortByPosition);
    // User Details
    let generalInfo = {
        id: user.id,
        penname: user.pn,
        level: user.lv,
        onboardState: user.obs,
        profile: {
            image: user.image,
            name: user.fullname,
            bio: user.bio,
            designation: user.designation,
            country: user.address.country,
            city: user.address.city,
            experiences,
        },
    };

    // The final pages array based on view type
    let returnPages = [];

    if (publicView) {
        const { pages } = await fetchPublicPrivateView({
            publicView,
            user,
            urlName,
        });
        returnPages = pages;
    } else if (userDashboardView) {
        const { pages, rewardFields } = await fetchPublicPrivateView({
            userDashboardView,
            user,
            urlName,
        });

        // Check if creator has a conversation with an external client
        /*  const convo = await ConversationExt.findOne({
            u2: user.id,
        }).exec(); */
        generalInfo = {
            ...generalInfo,
            isEmailVerified: user.iev,
            rewardFields,
            reportSeen: user.otherDetails.report.reportSeen,
            reportCreated: user.otherDetails.report.created,
            onboarding: user.onboarding,
        };
        returnPages = pages;
    } else if (communityView) {
        const { testimonials, pages, portfolio_owner } =
            await fetchCommunityView({
                user,
                pageIds,
                visitorId: authenticatedUser.id,
            });
        generalInfo.profile = {
            ...generalInfo.profile,
            testimonials,
        };
        returnPages = pages;
    } else throw new BadRequest('Unhandled View');

    // Build response
    let response = {
        isTemplate: Object.keys(templateData).includes(pn),
        portfolio_owner,
        visitor_id: authenticatedUser ? authenticatedUser.id : null,
        visitor_name: authenticatedUser
            ? authenticatedUser.fullname
            : 'anonymous',
        role:
            authenticatedUser && authenticatedUser.__t
                ? authenticatedUser.__t
                : 'public',
        generalInfo,
        pages: returnPages,
    };

    return response;
};

/**
 * @description
 * Only fetch blocks of one page
 */

exports.fetchPortfolioV2 = async ({ user, pn, fetchPublic, urlName }) => {
    // Check ownership

    let { portfolioOfUser, portfolio_owner } = await ownerShipCheck({
        user,
        pn,
    });

    // User who is visiting this profile (creator, client, pm, guest)
    let authenticatedUser = user;

    // user = creator portfolio user object of penname
    user = portfolioOfUser;

    // Fetching for public view if both these conditions are satisfied
    // 1. portfolio_owner = false
    // 2. authenticatedUser = undefined
    // OR if expicitly fetchPublic = true

    let publicView =
        fetchPublic || (portfolio_owner == false && !authenticatedUser);

    // User dashboard view
    // 1. portfolio_owner = true
    // 2. authenticatedUser = Writer

    let privateView = portfolio_owner;

    // User Details
    let generalInfo = {
        id: user.id,
        penname: user.pn,
        level: user.lv,
        onboardState: user.obs,
        profile: {
            image: user.image,
            name: user.fullname,
            bio: user.bio,
            designation: user.designation,
        },
    };

    // ?? reward fields to be added or not
    // ?? Same API to be used for community view
    let { allPages, page } = await fetchPublicPrivateViewPage({
        publicView,
        privateView,
        user,
        urlName,
    });

    // Additional info if fetching for dashboard
    if (privateView) {
        generalInfo = {
            ...generalInfo,
            isEmailVerified: user.iev,
            reportSeen: user.otherDetails.report.reportSeen,
            reportCreated: user.otherDetails.report.created,
            onboarding: user.onboarding,
        };
    }

    let response = {
        isTemplate: Object.keys(templateData).includes(pn),
        portfolio_owner,
        generalInfo,
        allPages,
        page,
        // Below fields are primarily used by posthog on the browser side
        visitor_id: authenticatedUser ? authenticatedUser.id : null,
        visitor_name: authenticatedUser
            ? authenticatedUser.fullname
            : 'anonymous',
        role:
            authenticatedUser && authenticatedUser.__t
                ? authenticatedUser.__t
                : 'public',
    };

    return response;
};

/**
 * @version 3.1
 * @apiName Get portfolio testimonials
 */

exports.getPortfolioTestimonials = async ({ user, pn, pageId }) => {
    let { portfolioOfUser, portfolio_owner } = await ownerShipCheck({
        user,
        pn,
    });
    user = portfolioOfUser;
    let query = { uid: user.id, pid: pageId };
    let testimonialBlock = await TestimonialBlock.findOne(query)
        .select('-tstm.e')
        .exec();
    let testimonials = [];
    if (testimonialBlock) {
        testimonials = testimonialBlock.tstm;
        if (portfolio_owner == false) {
            testimonials = testimonials.filter((t) => t.req == false);
        }
    }
    testimonials.sort(sortByPosition);
    return {
        testimonials,
        portfolio_owner,
    };
};

/**
 * @version 3.1
 * Fetch all services of user
 */

exports.getPortfolioServices = async ({ user, pn, pageId }) => {
    let { portfolioOfUser, portfolio_owner } = await ownerShipCheck({
        user,
        pn,
    });
    user = portfolioOfUser;
    let query = { uid: user.id, pid: pageId };
    const services = await ServiceBlock.find(query).sort('pos').exec();
    return {
        services,
        portfolio_owner,
    };
};

/**
 * @version 3.1
 * Fetch all experiences of user
 */

exports.getPortfolioExperiences = async ({ user, pn }) => {
    let { portfolioOfUser, portfolio_owner } = await ownerShipCheck({
        user,
        pn,
    });
    user = portfolioOfUser;
    let query = { uid: user.id };
    const experienceBlock = await ExperienceBlock.findOne(query).exec();
    let experiences = [];
    if (experienceBlock) experiences = experienceBlock.exps;
    experiences.sort(sortByPosition);
    return {
        experiences,
        portfolio_owner,
    };
};

/**
 * @version 3.1
 * @apiName Fetch Single block
 */

exports.getSingleBlock = async ({ user, pul, id }) => {
    let query = buildQuery({ pul, id });
    let block = await Block.findOne(query)
        // populate imported service block fields
        .populate([
            {
                path: 'sref',
                select: 't desc prc ru dt curr ft cmsg askm cln pg tg',
            },
            {
                path: 'uref',
                select: 'n pn img strp.acid',
            },
        ])
        .exec();
    if (!block) throw new BadRequest('Block not found');
    const page = await Page.findOne({
        _id: block.pid,
    })
        .select('pfc un udet cth')
        .populate({ path: 'cth' })
        .exec();
    // Check ownership of block for the authenticated user
    // user is null if no user is authenticated
    let { portfolioOfUser, portfolio_owner } = await ownerShipCheck({
        user,
        creatorId: block.uid,
    });
    let authenticatedUser = user;
    user = portfolioOfUser;
    // For project blocks
    /*  if (
        !portfolio_owner &&
        block.type == C.MODELS.PROJECT_BLOCK &&
        block.pblc == false
    ) {
        throw new BadRequest('Accessing Private ProjectBlock');
    } */
    block = customWrapper(block.toJSON(), user.email);
    // ! Ignoring now since testimonial and experience has no pul
    /*   if (block.type == C.MODELS.TESTIMONIAL_BLOCK) {
        block.testimonials.sort(sortByPosition);
    }
    if (block.type == C.MODELS.ExperienceBlock) {
        block.experiences.sort(sortByPosition);
    } */
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

    // * Service block
    if (
        block.type === C.MODELS.SERVICE_BLOCK &&
        block.feesType === C.SERVICE_BLOCK_FEES_TYPE.PREPAID
    ) {
        // For direct charge on stripe, on FE load stripe with account Id
        // So we include stripe account Id of creator with this block
        block.stripeAccountId = user.strp.acid;
    }

    // * If testimonial Block
    if (block.type == C.MODELS.TESTIMONIAL_BLOCK) {
        if (!portfolio_owner) {
            block.testimonials = block.testimonials.filter(
                (t) => t.requested == false,
            );
        }
        block.testimonials.sort(sortByPosition);
    }
    // * If Experience Block
    if (block.type == C.MODELS.EXPERIENCE_BLOCK) {
        let experiences = block.experiences;
        experiences.sort(sortByPosition);
        block.experiences = experiences;
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
            tags: [],
        };
        if (block.collabType == C.COLLAB_TYPE.REFER) {
            service = { ...block.serviceRef };
        } else {
            service.title = block.title;
            service.description = block.description;
            service.tags = block.tags;
            service = { ...service, ...block.details };
        }

        if (service.feesType === C.SERVICE_BLOCK_FEES_TYPE.PREPAID) {
            // For direct charge on stripe, on FE load stripe with account Id
            // So we include stripe account Id of service owner with this block
            service.stripeAccountId =
                block.collabType == C.COLLAB_TYPE.REFER
                    ? block.userRef.stripeInfo.accountId
                    : user.strp.acid;
        }

        delete service.id;
        delete service.__t;
        delete service.type;

        delete block.details;
        delete block.serviceRef;
        delete block.title;
        delete block.description;
        delete block.tags;
        delete block.category;

        block = { ...block, ...service };
    }

    block.profileColor = page.profileColor;
    block.customTheme = page.customTheme;
    block.urlName = page.urlName;
    let response = {
        portfolio_owner,
        role:
            authenticatedUser && authenticatedUser.__t
                ? authenticatedUser.__t
                : 'public',
        visitor_id: authenticatedUser ? authenticatedUser.id : null,
        visitor_name: authenticatedUser
            ? authenticatedUser.fullname
            : 'anonymous',
        block,
        user: {
            id: user.id,
            fullname: user.fullname,
            // sending image of page here
            image: page.userDetails.image,
            pn: user.pn,
            customDomain: user.customDomain,
        },
    };
    if (block.type == C.MODELS.PROJECT_BLOCK) {
        // If block is of type ProjectBlock
        // Get text editor content contents from s3
        const prefixS3 = block.fileUrl;
        const content = await getObject(env.S3_BUCKET_USER_DATA, prefixS3);
        response = { ...response, content };
        delete response.block.fileUrl;
    }
    return response;
};

/**
 * Fetch Invoice
 */

exports.fetchInvoice = async ({ id }) => {
    let invoice = await InvoiceBill.findById(id)
        .populate({
            path: 'uid',
            select: 'strp',
        })
        .exec();

    if (!invoice) throw new BadRequest('Invoice not found');

    let amountDue = invoice.getAmountDue();

    invoice = invoice.toJSON();
    invoice.amountDue = amountDue;
    invoice.stripeAccountId = invoice.userId.stripeInfo.accountId;
    delete invoice.userId;
    delete invoice.paymentDetails;
    return {
        invoice,
    };
};
/*
 * @version 3.1
 * @apiName Fetch Single block
 */

exports.getBlockUrl = async ({ id }) => {
    let query = {
        _id: id,
    };

    let block = await Block.findOne(query).select('pul').exec();
    if (!block) throw new BadRequest('Block not found');
    return {
        block,
    };
};

/**
 * Studio controllers
 */

exports.studioGeneralInfo = async ({ user, stid }) => {
    let { portfolioOfUser, portfolio_owner } = await studioOwnerShipCheck({
        user,
        stid,
    });
    // User who is visiting this profile (creator, client, pm, guest)
    let authenticatedUser = user;
    // user = pm portfolio user object
    user = portfolioOfUser;
    let studioDetails = {
        image: user.stdd.img,
        name: user.stdd.name,
        description: user.stdd.dsc,
        availability: user.stdd.avail,
        availableFrom: user.stdd.availF,
        creatorRequests: user.stdd.crr,
        creatorsAllowed: user.stdd.cra,
        expertise: user.stdd.exp,
    };
    let pmDetails = {
        image: user.img,
        firstname: user.n.f,
        lastname: user.n.l,
        designation: user.dsg,
    };
    let studioStats = user.sstats;
    //  Testimonials
    // Pending Requests
    let pending = [];
    // Bookmarked Testimonials
    const bookmarked = [];
    // All testimonials except bookmarked
    // When portfolio_owner is false send only public in all
    const all = [];
    for (let ts of user.tstm) {
        if (ts.isb) {
            bookmarked.push(ts);
            continue;
        }
        // for pending we have req (requested) field
        // req > means still it's in requested state
        // when client reply then req becomes false, means it's no more in requested state
        if (portfolio_owner == true && ts.req == true) {
            pending.push(ts.toJSON());
            continue;
        }
        if (ts.isp == true || portfolio_owner == true) {
            all.push(ts);
            continue;
        }
    }
    // for (let ts of user.rtstm) {
    //     if (ts.received == false) pending.push(ts.toJSON());
    // }
    let testimonials = {
        bookmarked,
        all,
        // brandLogos: user.bls,
    };
    // Send pending to portfolio owner only
    if (portfolio_owner) {
        testimonials = { ...testimonials, pending };
    }
    // Portfolio Completion Info
    let portfolioComplete = {
        invited: {
            refCount: user.rd.rc,
            maxRef: C.ACCOUNT_C.INVITE_MAX,
        },
        shared: false,
        projectCount: 0,
        projectAdded: false,
        submitted: user.sbmt,
    };
    if (
        user.ssd.tw == 'clicked' ||
        user.ssd.li == 'clicked' ||
        user.ssd.fb == 'clicked'
    )
        portfolioComplete.shared = true;
    let projectCount = await Project.countDocuments({ cid: user._id }).exec();
    portfolioComplete.projectCount = Math.min(projectCount, 3);
    if (projectCount >= 3) portfolioComplete.projectAdded = true;
    // Collaborator details
    user = await user
        .populate({ path: 'mmb.uid', select: 'img n pdg pn cty' })
        .execPopulate();
    let collaborators = {
        copywritingCount: user.sstats.totcop,
        designCount: user.sstats.totd,
        active: [],
        more: [],
    };
    _.map(user.mmb, (member) => {
        if (member.avail)
            collaborators.active.push({
                id: member.uid._id,
                image: member.uid.img,
                penname: member.uid.pn,
                fullname: member.uid.fullname,
                designation: member.uid.pdg,
            });
        else {
            collaborators.more.push({
                id: member.uid._id,
                image: member.uid.img,
                penname: member.uid.pn,
                fullname: member.uid.fullname,
                designation: member.uid.pdg,
            });
        }
    });
    // From role of user visiting portfolio
    let isClient = false,
        isCreator = false;
    isClient =
        !portfolio_owner &&
        authenticatedUser &&
        authenticatedUser.__t == C.ROLES.CLIENT_C;
    isCreator =
        !portfolio_owner &&
        authenticatedUser &&
        authenticatedUser.__t == C.ROLES.WRITER_C;
    let userInfo = {
        id: user.id,
        studioId: user.stid,
        studioDetails,
        pmDetails,
        studioStats,
        collaborators,
        testimonials,
        portfolioComplete,
        portfolio_owner,
        isClient,
        isCreator,
    };
    /**
     * If authenticated user is client get shortlisted and invited status
     * Also return inboxDetails of conversation if present
     */
    if (isClient) {
        let shortlisted = false,
            invited = false,
            accepted = false;
        if (authenticatedUser.shortlisted.includes(user.id)) shortlisted = true;
        const findConversation = await ConversationClient.findOne({
            u1: authenticatedUser.id,
            u2: user.id,
            st: C.CONVERSATION_STATUS.CREATED,
        }).exec();
        let inboxDetails = null;
        if (findConversation) {
            invited = true;
            inboxDetails = {
                fullname: user.fullname,
                state: findConversation.state,
                conversationId: findConversation.id,
                type: C.CONVERSATION_TYPE.INBOX,
            };
            accepted = findConversation.state == C.CONVERSATION_STATE.ACTIVE;
        }
        userInfo = {
            ...userInfo,
            shortlisted,
            invited,
            accepted,
            inboxDetails,
        };
    }
    // If authenticated user is creator
    // add requested field to show if creator is allowed to request pm or not
    if (isCreator) {
        let requested = false,
            accepted = false;
        const findConversation = await ConversationPM.findOne({
            u1: user.id,
            u2: authenticatedUser.id,
            st: C.CONVERSATION_STATUS.CREATED,
        }).exec();
        if (findConversation) {
            // If conversation exists between PM and creator and that conversation
            // has a invite sent by pm or a request message sent by creator
            // mark requested to true
            // Note that conversation can be started via job board also, so it won't contain a invite or request message in that case
            const inviteOrRequest = await Message.find({
                convoId: findConversation.id,
                __t: {
                    $in: [C.MODELS.STUDIO_INVITE, C.MODELS.STUDIO_REQUEST],
                },
            }).exec();
            if (inviteOrRequest.length !== 0) {
                requested = true;
                if (
                    inviteOrRequest[0].st == C.STUDIO_REQUEST_STATES.ACCEPTED ||
                    inviteOrRequest[0].st == C.STUDIO_INVITE_STATES.ACCEPTED
                ) {
                    accepted = true;
                }
            }
        }
        userInfo = {
            ...userInfo,
            requested,
            accepted,
        };
    }

    return userInfo;
};

const getStudioProjectsByType = async ({
    user,
    page,
    ptype,
    imported,
    portfolio_owner,
}) => {
    /*
    let { portfolioOfUser, portfolio_owner } = await studioOwnerShipCheck({
        user,
        stid,
    });
    user = portfolioOfUser;
    */
    const customLabels = {
        docs: 'posts',
    };
    let query = {
        __t: ptype,
        cid: user._id,
        $or: [{ del: { $exists: false } }, { del: false }],
    };
    if (imported) {
        // Get imported projects
        query = {
            __t: ptype,
            // TODO: Recon
            $or: [{ del: { $exists: false } }, { del: false }],
            _id: { $in: user.impr },
        };
    }
    if (ptype == C.MODELS.LONG_FORM) {
        // Don't returned LongForm with state INIT
        query = { ...query, lst: C.LONG_FORM_STATES.SAVED };
        // Filter out private long form for portfolio_owner=false or imported=true
        if (portfolio_owner == false || imported == true)
            query = { ...query, pblc: true };
    }
    // console.log(query);
    const options = {
        sort: { createdAt: -1 },
        select: '-ful',
        customLabels,
        populate: { path: 'cid', select: 'cid n pn stid img' },
        page,
        limit: 6,
    };
    let allProjects = await Project.paginate(query, options);
    const posts = [];
    for (let post of allProjects.posts) {
        toSend = post.toJSON();
        toSend.creator = toSend.creatorId;
        // Only Send Cover Image for long form
        // Cover Image is first image
        if (toSend.__t == C.MODELS.LONG_FORM) {
            let coverImage = '';
            if (toSend.images.length > 0) {
                coverImage = toSend.images[0].thumbnail;
            }
            toSend.image = coverImage;
            delete toSend.images;
        }
        delete toSend.creatorId;
        posts.push(toSend);
    }
    const pageDetails = allProjects;
    delete pageDetails.posts;
    return { posts, pageDetails, portfolio_owner };
};

exports.exportedGetStudioProjectsByType = getStudioProjectsByType;

// Studio Portfolio Projects by type and imported
exports.getStudioProjects = async ({ user, page, ptype, imported, stid }) => {
    let { portfolioOfUser, portfolio_owner } = await studioOwnerShipCheck({
        user,
        stid,
    });
    user = portfolioOfUser;
    const result = await getStudioProjectsByType({
        user,
        page,
        ptype,
        imported,
        portfolio_owner,
    });
    return result;
};

// Get first page of all project types (imported and not imported)
exports.getAllStudioProjects = async ({ user, stid }) => {
    let { portfolioOfUser, portfolio_owner } = await studioOwnerShipCheck({
        user,
        stid,
    });
    user = portfolioOfUser;
    let cards, cardsImported, longForm, longFormImported;
    await Promise.all([
        getStudioProjectsByType({
            user,
            page: 1,
            ptype: C.MODELS.CARDS,
            imported: false,
            portfolio_owner,
        }),
        getStudioProjectsByType({
            user,
            page: 1,
            ptype: C.MODELS.CARDS,
            imported: true,
            portfolio_owner,
        }),
        getStudioProjectsByType({
            user,
            page: 1,
            ptype: C.MODELS.LONG_FORM,
            imported: false,
            portfolio_owner,
        }),
        getStudioProjectsByType({
            user,
            page: 1,
            ptype: C.MODELS.LONG_FORM,
            imported: true,
            portfolio_owner,
        }),
    ]).then((values) => {
        [cards, cardsImported, longForm, longFormImported] = values;
    });
    delete cards.portfolio_owner;
    delete cardsImported.portfolio_owner;
    delete longForm.portfolio_owner;
    delete longFormImported.portfolio_owner;
    return {
        cards,
        cardsImported,
        longForm,
        longFormImported,
        portfolio_owner,
    };
};

// * Exported controllers
// * Used by other controllers dependent on this controller

// Other
// A stripped down controller for general info
// Assume that portfolio_owner = false
const studioGeneralInfoStripped = async ({ userId }) => {
    let user = await PM.findById(userId).exec();
    let studioDetails = {
        image: user.stdd.img,
        name: user.stdd.name,
        description: user.stdd.dsc,
    };
    let pmDetails = {
        image: user.img,
        firstname: user.n.f,
        lastname: user.n.l,
        designation: user.dsg,
    };
    let studioStats = user.sstats;
    // Collaborator details
    user = await user
        .populate({ path: 'mmb.uid', select: 'img n pdg pn cty' })
        .execPopulate();
    let collaborators = {
        copywritingCount: user.sstats.totcop,
        designCount: user.sstats.totd,
        active: [],
        more: [],
    };
    _.map(user.mmb, (member) => {
        if (member.avail)
            collaborators.active.push({
                id: member.uid._id,
                image: member.uid.img,
                penname: member.uid.pn,
                fullname: member.uid.fullname,
                designation: member.uid.pdg,
            });
        else {
            collaborators.more.push({
                id: member.uid._id,
                image: member.uid.img,
                penname: member.uid.pn,
                fullname: member.uid.fullname,
                designation: member.uid.pdg,
            });
        }
    });
    return {
        id: user.id,
        studioId: user.stid,
        studioDetails,
        pmDetails,
        studioStats,
        collaborators,
    };
};

exports.exportedStudioGeneralInfoStripped = studioGeneralInfoStripped;

// Latest Projects of creator
// For PM return original and not imported
// Assume portfolio_owner = false
const getLatestProjectsOfCreator = async ({ creatorId }) => {
    // const user = await User.findById(creatorId).exec();
    const customLabels = {
        docs: 'posts',
    };
    let query = {
        cid: creatorId,
        del: false,
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
    };
    const options = {
        sort: { createdAt: -1 },
        select: '-ful',
        customLabels,
        populate: { path: 'cid', select: 'cid n pn stid img' },
        page: 1,
        limit: 3,
    };
    let allProjects = await Project.paginate(query, options);
    const posts = [];
    for (let post of allProjects.posts) {
        toSend = post.toJSON();
        toSend.creator = toSend.creatorId;
        // Only Send Cover Image for long form
        // Cover Image is first image
        if (toSend.__t == C.MODELS.LONG_FORM) {
            let coverImage = '';
            if (toSend.images.length > 0) {
                coverImage = toSend.images[0].thumbnail;
            }
            toSend.image = coverImage;
            delete toSend.images;
        }
        delete toSend.creatorId;
        posts.push(toSend);
    }
    const pageDetails = allProjects;
    delete pageDetails.posts;
    return { posts };
};

exports.exportedGetLatestProjectsOfCreator = getLatestProjectsOfCreator;

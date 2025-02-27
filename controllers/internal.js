/*
 * Module Dependencies
 */
const mongoose = require('mongoose');
const _ = require('lodash');
const moment = require('moment');
const sm = require('sitemap');
const C = require('../lib/constants');
const { BadRequest } = require('../lib/errors');
const agenda = require('../services/agenda');
const debug = require('debug')('internal');
debug.enabled = true;
const jwt = require('../lib/jwt');
const env = require('../config/env');

/**
 * Models
 */
const Creator = mongoose.model(C.MODELS.WRITER_C);
const Project = mongoose.model(C.MODELS.PROJECT);
const Block = mongoose.model(C.MODELS.BLOCK);
const User = mongoose.model(C.MODELS.USER_C);
const ExtClient = mongoose.model(C.MODELS.EXT_CLIENT);
const ConversationClient = mongoose.model(C.MODELS.CONVERSATION_CLIENT);
const ExtPay = mongoose.model(C.MODELS.EXT_PAY);
const GroupConversation = mongoose.model(C.MODELS.GROUP_CONVERSATION);
const InfoTexts = mongoose.model(C.MODELS.GROUP_INFO_TEXT);

const notAllowedStatus = [
    C.ACCOUNT_STATUS.NEW,
    C.ACCOUNT_STATUS.INACTIVE,
    C.ACCOUNT_STATUS.BAN,
];

/**
 * Service
 */

const userService = require('../services/db/user');
const stripeService = require('../services/stripe');
const { notification } = require('../messaging/index');
const razorpayService = require('../services/razorpay');
const webpushService = require('../services/webpush');
const rtService = require('../services/rt');
const posthogService = require('../services/posthog');

/**
 * * Create Sitemap Data
 * * This controller is run only when Google Search console calls the associated API
 */
exports.getPublicProfileSitemap = async () => {
    // get creators eligible for public profile
    const queryProfile = {
        acst: { $nin: [...notAllowedStatus] },
        pn: { $exists: true },
    };
    const queryBlock = {
        __t: {
            $in: [
                C.MODELS.IMAGE_BLOCK,
                C.MODELS.LINK_BLOCK,
                C.MODELS.PDF_BLOCK,
                C.MODELS.PROJECT_BLOCK,
            ],
        },
    };
    const creators = await Creator.find(queryProfile).select('pn img').exec();
    const blocks = await Block.find(queryBlock).exec();

    const urls = ['blog'];
    // Add Creator Profile URls
    creators.forEach((creator) => {
        if (creator.image) {
            urls.push({
                url: `${creator.penname}`,
                changefreq: 'daily',
                priority: 1,
                img: creator.image,
            });
        } else {
            urls.push({
                url: `${creator.penname}`,
                changefreq: 'daily',
                priority: 1,
            });
        }
    });
    // Add Project URLs
    blocks.forEach((block) => {
        /*  if (project.__t == C.MODELS.CARDS) {
            if (project.cty == C.CARD_TYPES.SHORT_FORM) {
                urls.push({
                    url: `creator/shorts/${project.pul}`,
                    changefreq: 'daily',
                    priority: 0.5,
                });
            }
            if (project.cty == C.CARD_TYPES.DESIGN) {
                urls.push({
                    url: `creator/design/${project.pul}`,
                    changefreq: 'daily',
                    priority: 0.5,
                });
            }
        } else {
            urls.push({
                url: `creator/article/${project.pul}`,
                changefreq: 'daily',
                priority: 0.5,
            });
        } */
        if (block.__t == C.MODELS.IMAGE_BLOCK) {
            urls.push({
                url: `design/${block.pul}`,
                changefreq: 'weekly',
                priority: 0.5,
            });
        }
        if (block.__t == C.MODELS.LINK_BLOCK) {
            urls.push({
                url: `link/${block.pul}`,
                changefreq: 'weekly',
                priority: 0.5,
            });
        }
        if (block.__t == C.MODELS.PDF_BLOCK) {
            urls.push({
                url: `pdf/${block.pul}`,
                changefreq: 'weekly',
                priority: 0.5,
            });
        }
        if (block.__t == C.MODELS.PROJECT_BLOCK) {
            urls.push({
                url: `article/${block.pul}`,
                changefreq: 'weekly',
                priority: 0.5,
            });
        }
    });
    const sitemapOptions = {
        hostname: 'https://passionbits.io',
        cacheTime: 600000, // 600 sec - cache purge period
        urls,
    };
    const sitemap = sm.createSitemap({ ...sitemapOptions });
    return sitemap.toString();
};

/**
 * Agenda controllers
 */
exports.createAgenda = async ({ name, recur, period, now, data }) => {
    if (now) {
        agenda.now(name, data);
    } else {
        if (recur == false) {
            agenda.schedule(period, name, data);
        }
        if (recur == true) {
            agenda.every(period, name, data);
        }
    }
};
exports.cancelAgenda = async ({ name, conditions }) => {
    await agenda.cancel({
        name,
        ...conditions,
    });
};

exports.updateJob = async ({ nextRunAt, query, data, createNew }) => {
    // Find the job for this conversationId and userId

    // EXAMPLE
    /*   const query = {
        name: 'send_message_reminder',
        'data.conversationId': conversationId,
        'data.userId': userId,
    }; */

    if (Object.keys(query).length === 0) throw new Error('A query is required');

    const jobs = await agenda.jobs(query);

    if (jobs.length == 0 && Object.keys(createNew).length > 0) {
        // If no job exists, schedule one with createNew data
        agenda.schedule(nextRunAt, query.name, createNew);
        //agenda.now(query.name, createNew);
    } else {
        // If job exists, update it's next run time, and given data
        const job = jobs[0];
        if (Object.keys(data).length > 0) {
            for (let key of Object.keys(data)) {
                job.attrs.data[key] = data[key];
            }
        }
        job.schedule(nextRunAt);
        await job.save();
    }
};

/**
 * Get all projects
 * The response is sent to the feed module create score for project
 * @returns projects - array of {projectId, creatorId}
 * @returns creators - array of {creatorId, ...parameter values}
 */

exports.getAllProjects = async () => {
    // Find all projects
    // cid is of PM or Writer
    const projects = await Project.find({
        $or: [{ lst: { $exists: false } }, { lst: C.LONG_FORM_STATES.SAVED }],
        del: false,
    }).exec();
    // Set of all creators who have atleast one project
    let creators = new Set();
    for (let project of projects) {
        creators.add(project.cid.toString());
    }
    creators = Array.from(creators);
    // console.log(creators);
    // Find creators who have atleast one project
    const creatorDocs = await User.find({
        _id: { $in: creators },
    }).exec();
    // Modify fields for the Feed module
    const modProjects = _.map(projects, (project) => {
        let projectWithScore = { id: project.id, creatorId: project.cid };
        let discoverScore = 0,
            hasCollaborators = 0,
            totalWords = 0,
            noOfImages = 0;
        // Field contributing to hasCollaborators
        if (project.clb.length > 0) hasCollaborators = 1;
        // Fields contributing collaborators
        if (project.ctg.length > 0) discoverScore += 1;
        if (project.iny) discoverScore += 1;
        if (project.atg.length > 0) discoverScore += 1;
        if (project.sty) discoverScore += 1;
        if (project.tn) discoverScore += 1;
        projectWithScore = {
            ...projectWithScore,
            discoverScore,
            hasCollaborators,
        };
        // Project Type specific field parameters
        if (project.projectType == C.PROJECT_TYPES.DESIGN) {
            noOfImages = project.img.length;
            projectWithScore = {
                ...projectWithScore,
                design: { noOfImages },
            };
        } else if (project.projectType == C.PROJECT_TYPES.SHORT_FORM) {
            for (let tc of project.tc) {
                totalWords += tc.length;
            }
            projectWithScore = {
                ...projectWithScore,
                shortForm: { totalWords },
            };
        }
        return projectWithScore;
    });
    // Modify creator object for processing by feed service
    const modCreators = [];
    await Promise.all(
        _.map(creatorDocs, async (creator) => {
            // Portfolio Completion Info
            let portfolioComplete = {
                invited: 0,
                shared: 0,
                projectAdded: 0,
            };
            if (
                creator.ssd.tw == 'clicked' &&
                creator.ssd.li == 'clicked' &&
                creator.ssd.fb == 'clicked'
            )
                portfolioComplete.shared = 1;
            // Get Creator Project counts
            let projectTot = await Project.countDocuments({
                cid: creator._id,
            }).exec();
            if (projectTot >= 3) portfolioComplete.projectAdded = 1;
            if (creator.rd.rc == C.ACCOUNT_C.INVITE_MAX)
                portfolioComplete.invited = 1;
            // Total experience in days
            // Initialized to 1 just for calculation in feed module. Otherwise you will get NaN for experience
            let totalExperienceInDays = 1;
            if (creator.__t == C.MODELS.WRITER_C) {
                for (let exp of creator.pfi) {
                    let d1 = moment(exp.s);
                    let d2 = moment();
                    if (exp.iwh == false) {
                        d2 = moment(exp.e);
                    }
                    totalExperienceInDays += d2.diff(d1, 'days');
                }
            }
            const convoCount = await ConversationClient.countDocuments({
                // u1: client._id,
                u2: creator._id,
                st: C.CONVERSATION_STATUS.CREATED,
            }).exec();
            modCreators.push({
                id: creator.id,
                lastActive: creator.lac,
                portfolioComplete:
                    portfolioComplete.invited +
                    portfolioComplete.shared +
                    portfolioComplete.projectAdded,
                testimonialCount: creator.tstm.length,
                experience: totalExperienceInDays,
                projectCount: convoCount,
            });
        }),
    );
    // console.log(modProjects, modCreators);
    return { projects: modProjects, creators: modCreators };
};

/**
 * Given an array of {projectId, score}, perform a bulk update and update score of all projects
 * @returns success message
 */

exports.bulkUpdateScore = async ({ data }) => {
    // console.log(data);
    const operations = [];
    for (let project of data) {
        operations.push({
            updateOne: {
                filter: { _id: mongoose.Types.ObjectId(project.id) },
                update: { $set: { scr: project.score } },
            },
        });
    }
    // console.log(operations);
    if (operations.length > 0) {
        const res = await Project.collection.bulkWrite(operations, {
            ordered: false,
        });
        // console.log(res);
    }
    debug('Done Calculating project scores');
    return { msg: 'Success' };
};

exports.sendLinkToExtClient = async ({ user, usecase, creatorName }) => {
    if (!user) throw new BadRequest('User not found');

    // * Step 2: Create access link / send notification

    if (user.__t == C.ROLES.EXT_CLIENT) {
        // generate jwt
        const token = await jwt.generateToken({
            data: { id: user.id },
        });
        // debug(token);
        await notification.send({
            usecase:
                usecase == 'get-in-touch'
                    ? 'ext-email-1'
                    : 'ext-email-service-1',
            role: C.ROLES.CLIENT_C,
            email: {
                email: user.e,
                link: `${env.FRONTEND_URL}/ext-client/access/${token}`,
                creatorName,
            },
        });
    } else if (user.__t == C.ROLES.CLIENT_C) {
        await notification.send({
            usecase:
                usecase == 'get-in-touch'
                    ? 'ext-email-2'
                    : 'ext-email-service-2',
            role: C.ROLES.CLIENT_C,
            email: {
                email: user.e,
                creatorName,
                link: `${env.CLIENT_PROFILE}/chat`,
            },
        });
    } else if (user.__t == C.ROLES.WRITER_C) {
        await notification.send({
            usecase:
                usecase == 'get-in-touch'
                    ? 'ext-email-2'
                    : 'ext-email-service-2',
            role: C.ROLES.CLIENT_C,
            email: {
                email: user.e,
                creatorName,
                link: `${env.CREATOR_PORTFOLIO}/chat`,
            },
        });
    } else {
        throw new BadRequest('Not allowed for this role');
    }
    return { msg: 'success' };
};

exports.acceptRequestAndCreateProject = async ({ userId, serviceRef }) => {
    const user = await userService.findUserById({ id: userId });
    if (!user) throw new BadRequest('User not found');

    let service;

    let owner,
        name,
        description,
        participants,
        memberIds = [],
        hasClient = true,
        groupId = null,
        projectDetails = {
            serviceRef,
        };

    if (serviceRef) {
        service = await Block.findOne({
            _id: serviceRef,
            __t: {
                $in: [C.MODELS.IMPORTED_SERVICE, C.MODELS.SERVICE_BLOCK],
            },
        })
            .select('uid t desc clt uref sref')
            .populate({ path: 'sref', select: 't desc' })
            .exec();
    }
    // Manish > Added
    if (!service) throw new BadRequest('Service not found');

    if (service) {
        if (service.__t == C.MODELS.IMPORTED_SERVICE) {
            if (service.collabType == C.COLLAB_TYPE.REFER) {
                owner = service.userRef;
                name = service.serviceRef.title;
                // description = service.serviceRef.description;
                participants = [
                    {
                        usr: owner,
                        ad: true,
                    },
                    {
                        user: userId,
                        icl: true,
                    },
                    {
                        user: service.uid,
                    },
                ];
                memberIds = [owner, userId, service.uid];

                // Manish move code from down to here

                const newConversation = new GroupConversation({
                    type: C.GROUP_CONVERSATION_TYPES.PROJECT,
                    owner,
                    name,
                    participants,
                    hasClient,
                    projectDetails,
                });
                await newConversation.save();
        
                const infoTexts = [
                    {
                        convoId: newConversation.id,
                        usecase: 'project-first',
                        dtxt: 'This is a collaborated group. Here you can send, receive messages from group members.',
                        d: {},
                        sd: owner,
                    },
                ];
                await InfoTexts.create(infoTexts);
        
                // Send event to new users for the new conversation
                // If users are online, conversation can be added to the chat in real time
                await rtService.sendNewConversation({
                    receivers: memberIds,
                    conversationId: newConversation.id,
                    pendingCount: 0,
                    conversationType: C.CONVERSATION_TYPE.PROJECT,
                });
        
                groupId = newConversation.id;
            } 
            // else {
            //     owner = service.uid;
            //     name = service.title;
            //     // description = service.description;
            //     participants = [
            //         {
            //             usr: owner,
            //             ad: true,
            //         },
            //         {
            //             user: userId,
            //             icl: true,
            //         },
            //     ];
            //     memberIds = [owner, userId];
            // }
        } 
        // else {
        //     owner = service.uid;
        //     name = service.title;
        //     // description = service.description;
        //     participants = [
        //         {
        //             usr: owner,
        //             ad: true,
        //         },
        //         {
        //             user: userId,
        //             icl: true,
        //         },
        //     ];
        //     memberIds = [owner, userId];
        // }

        // const newConversation = new GroupConversation({
        //     type: C.GROUP_CONVERSATION_TYPES.PROJECT,
        //     owner,
        //     name,
        //     participants,
        //     hasClient,
        //     projectDetails,
        // });
        // await newConversation.save();

        // const infoTexts = [
        //     {
        //         convoId: newConversation.id,
        //         usecase: 'project-first',
        //         dtxt: 'This is a collaborated group. Here you can send, receive messages from group members.',
        //         d: {},
        //         sd: owner,
        //     },
        // ];
        // await InfoTexts.create(infoTexts);

        // // Send event to new users for the new conversation
        // // If users are online, conversation can be added to the chat in real time
        // await rtService.sendNewConversation({
        //     receivers: memberIds,
        //     conversationId: newConversation.id,
        //     pendingCount: 0,
        //     conversationType: C.CONVERSATION_TYPE.PROJECT,
        // });

        // groupId = newConversation.id;
    }

    if (service) {
        // * capture event for analytics

        // distinct_id is person who accepts get in touch
        // user_id is owner of block
        // service_id - block_id
        // imported  - if true the block is an imported block

        // Manish > Was causing error so commented
        // todo: fix this issue
        // await posthogService.captureEvent({
        //     event: 'accept got in touch',
        //     properties: {
        //        // user_id: service.uid.toString(),
        //         user_id: service.uid.toString(),
        //         service_id: serviceRef,
        //         imported:
        //             service.__t == C.MODELS.IMPORTED_SERVICE ? 'true' : 'false',
        //     },
        //     // person who accepted get in touch
        //     distinct_id: owner.toString(),
        // });
    }
    return { msg: 'success', groupId };
};

exports.subscribeUserWebPush = async ({ data }) => {
    const { userId, subscribeData, oldEndpoint } = data;
    const user = await User.findById(userId).select('wbp').exec();
    if (!user) throw new BadRequest('User not found');
    // If old endpoint was provided, remove it first
    if (oldEndpoint) {
        for (let sub of user.wbp) {
            if (sub.endpoint === oldEndpoint) sub.remove();
        }
    }
    user.wbp.push(subscribeData);
    await user.save();
    return {
        msg: 'user subscribed',
    };
};

exports.unsubscribeUserWebPush = async ({ endpoint, userId }) => {
    const user = await User.findById(userId).select('wbp').exec();
    if (!user) throw new BadRequest('User not found');
    for (let sub of user.wbp) {
        if (sub.endpoint === endpoint) sub.remove();
    }
    await user.save();
    return {
        msg: 'registration removed',
    };
};

exports.pushWebPushPayload = async ({ userId, payload }) => {
    const user = await User.findById(userId).select('wbp').exec();
    if (user && user.webpush.length > 0) {
        await webpushService.pushWebNotification({
            payload,
            webpushUser: user.wbp,
        });
    }
    return {
        msg: 'message pushed',
    };
};

exports.initiateTransactionExtPay = async ({ mid, gateway }) => {
    const message = await ExtPay.findOne({
        _id: mid,
    })
        .populate('convoId', 'u2')
        .exec();
    const creator = await Creator.findOne({
        _id: message.convoId.u2,
    })
        .select('strp rzpy')
        .exec();
    if (gateway == C.PAYMENT_GATEWAY.STRP) {
        // ! Separate charges currently not availablr in India
        // ! Payment is now a direct charge to creator
        let transfer = await stripeService.initiateTransferToConnectedUser({
            amount: message.amount,
            currency: message.currency,
            accountId: creator.strp.acid,
        });
        return { msg: 'success', id: transfer.id };
    } else if (gateway == C.PAYMENT_GATEWAY.RP) {
        let transfer = await razorpayService.createTransferFromPayment({
            paymentId: message.rpPaymentId,
            transfers: [
                {
                    account: creator.rzpy.acid,
                    amount: message.amount * 100,
                    currency: 'INR',
                    notes: {
                        usecase: 'service_pay',
                        userId: creator.id,
                        serviceId: message.id,
                    },
                    on_hold: 0,
                },
            ],
        });
        return { msg: 'success', id: transfer.items[0].id };
    }
};

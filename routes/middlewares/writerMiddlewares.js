const { isCelebrate } = require('celebrate');
const C = require('../../lib/constants');
const env = require('../../config/env');
const {
    BadRequest,
    InternalServerError,
    ForbiddenRequest,
} = require('../../lib/errors');

const {
    emptyS3Directory,
    deleteMultiple,
} = require('../../utils/s3-operations');
const mongoose = require('mongoose');
const { upload } = require('../../services/file-upload-service/image-upload');
const Cards = mongoose.model(C.MODELS.CARDS);
const Project = mongoose.model(C.MODELS.PROJECT);
const Proposal = mongoose.model(C.MODELS.PROPOSAL);
const ProposalM = mongoose.model(C.MODELS.PROPOSAL_M);
const ConversationClient = mongoose.model(C.MODELS.CONVERSATION_CLIENT);
const Conversation = mongoose.model(C.MODELS.CONVERSATION);
const File = mongoose.model(C.MODELS.FILE);
const GroupFile = mongoose.model(C.MODELS.GROUP_FILE);

// Services

const posthogService = require('../../services/posthog');

// Experience middlewares
const createNewExp = async (req, res, next) => {
    const creator = req.user;
    const newExp = creator.pfi.create({
        t: '',
        o: '',
        s: '',
    });
    req.exp = newExp;
    // console.log(newExp);
    return next();
};

const attachExp = async (req, res, next) => {
    try {
        const creator = req.user;
        const doc = creator.pfi.id(req.params.expId);
        if (!doc) throw new BadRequest('Experience not found');
        req.user.pfi.id(req.params.expId).remove();
        req.exp = doc;
        return next();
    } catch (error) {
        return next(error);
    }
};

// If error occored, delete project folder from s3 bucket
const addExpErrorHandler = async (err, req, res, next) => {
    if (err) {
        await emptyS3Directory(
            env.S3_BUCKET_USER_DATA,
            `${req.user.id}/experience/${req.exp._id.toString()}/`,
        );
        return next(err);
    }
    return next();
};

// Brand Logo middlewares
const attachBrandLogo = async (req, res, next) => {
    try {
        const creator = req.user;
        const logo_testimonaial = creator.tstm.create({
            t: C.TESTIMONIAL_TYPE.LOGO,
            req: false,
            vf: true,
            cmp: '',
            img: '',
        });
        req.logo_testimonaial = logo_testimonaial;
        // ! confirm whether do we want to limit logos?
        // if (creator.bls.length >= C.MAX_BRAND_LOGOS)
        //     throw new BadRequest(
        //         `Not allowed to add more than ${C.MAX_BRAND_LOGOS} brand logos`,
        //     );
        // console.log(newExp);
        return next();
    } catch (error) {
        next(error);
    }
};

// If error occored, delete project folder from s3 bucket
const addBrandLogoErrorHandler = async (err, req, res, next) => {
    if (err) {
        await emptyS3Directory(
            env.S3_BUCKET_USER_DATA,
            `${req.user.id}/brandLogo/${req.logo_testimonaial._id.toString()}/`,
        );
        return next(err);
    }
    return next();
};

// Project Middlewares
const createEmptyProject = async (req, res, next) => {
    let newCardProject = new Cards({});
    newCardProject.cty = C.CARD_TYPES.DESIGN;
    req.project = newCardProject;
    return next();
};

const addProject = (ptype) => {
    return async (req, res, next) => {
        try {
            const project = await Project.findOne({
                _id: req.params.pid,
                cid: req.user._id,
                __t: ptype,
                del: false,
            }).exec();
            if (!project) throw new BadRequest('Project Not Found', 'CRPL105');
            req.project = project;
            return next();
        } catch (error) {
            return next(error);
        }
    };
};

const uploadImagesMiddlewareSetup = (req, res, next) => {
    // Maximum number of images left to upload
    const allowedImagesCount = C.DESIGN_MAX_CARDS - req.project.img.length;
    req.allowedImagesCount = allowedImagesCount;
    // *o*
    return upload.array('files', allowedImagesCount)(req, res, () => {
        return next();
    });
};

// If error occored, delete project folder from s3 bucket
const addDesignErrorHandler = async (err, req, res, next) => {
    if (err) {
        await emptyS3Directory(
            env.S3_BUCKET_USER_DATA,
            `${req.user.id}/${req.project.__t}/${req.project.id}/`,
        );
        return next(err);
    }
    return next();
};
// If error occored, delete files from s3 bucket
const updateDesignErrorHandler = async (err, req, res, next) => {
    if (err) {
        if (Array.isArray(req.files) && req.files.length > 0) {
            const files = [];
            for (let fl of req.files) {
                files.push(fl.key);
            }
            await deleteMultiple(env.S3_BUCKET_USER_DATA, files);
        }
        return next(err);
    }
    return next();
};
// Attach empty proposal
const attachEmptyProposal = async (req, res, next) => {
    let newProposal = new Proposal({});
    newProposal.cid = req.user.id;
    req.proposal = newProposal;
    return next();
};
/**
 * Find Proposal and attach it to the req object
 */
const attachProposal = async (req, res, next) => {
    try {
        const proposal = await Proposal.findOne({
            _id: req.params.pid,
            cid: req.user._id,
        }).exec();
        if (!proposal) throw new BadRequest('Proposal Not Found', 'CRCH101');
        req.proposal = proposal;
        return next();
    } catch (error) {
        return next(error);
    }
};
// On error remove cover from bucket
const proposalCoverUploadError = async (err, req, res, next) => {
    if (err) {
        if (Array.isArray(req.files) && req.files.length > 0) {
            const files = [];
            for (let fl of req.files) {
                files.push(fl.key);
            }
            await deleteMultiple(env.S3_BUCKET_USER_DATA, files);
        }
        return next(err);
    }
    return next();
};

const attachProposalMessage = async (req, res, next) => {
    try {
        // Sinve proposals is currently sent by u2 only in both conversation schemas
        // u2 is role of a creator
        const findConversation = await Conversation.findOne({
            _id: req.params.cid,
            u2: req.user.id,
            st: C.CONVERSATION_STATUS.CREATED,
        }).exec();
        if (!findConversation) throw new BadRequest('Not part of conversation');
        if (
            findConversation.__t == C.MODELS.CONVERSATION_CLIENT &&
            findConversation.sta == C.CONVERSATION_STATE.DECLINED
        ) {
            throw new BadRequest('Not part of conversation');
        } else if (
            findConversation.__t == C.MODELS.CONVERSATION_PM &&
            findConversation.sta == C.CONVERSATION_PM_STATE.DECLINED
        ) {
            throw new BadRequest('Not part of conversation');
        }
        let findProposal = await ProposalM.findOne({
            convoId: findConversation.id,
            cst: 'INIT',
        }).exec();
        if (!findProposal) {
            findProposal = new ProposalM({
                convoId: findConversation.id,
            });
        }
        req.proposal = findProposal;
        req.conversation = findConversation;
        return next();
    } catch (error) {
        return next(error);
    }
};
const attachFileMessage = async (req, res, next) => {
    try {
        const findMessage = await File.findOne({
            convoId: req.params.cid,
            cst: 'INIT',
            sd: req.user.id,
        }).exec();

        if (!findMessage) throw new BadRequest('Not part of conversation');
        req.message = findMessage;
        req.group = false;
        return next();
    } catch (error) {
        return next(error);
    }
};

const attachGroupFileMessage = async (req, res, next) => {
    try {
        const findMessage = await GroupFile.findOne({
            convoId: req.params.cid,
            cst: 'INIT',
            sd: req.user.id,
        }).exec();
        if (!findMessage) throw new BadRequest('Not part of conversation');
        req.message = findMessage;
        req.group = true;
        return next();
    } catch (error) {
        return next(error);
    }
};

const captureBlockEvent = async (req, res, next) => {
    try {
        const user_id = req.user.id;
        const block_id = res.body.block_id;

        await posthogService.captureEvent({
            event: 'block changed',
            properties: {
                block_id,
                user_id,
            },
            distinct_id: user_id,
        });
    } catch (err) {
        return next(err);
    }
};

const captureProfileEvent = async (req, res, next) => {
    try {
        const user_id = req.user.id;

        await posthogService.captureEvent({
            event: 'edit portfolio',
            properties: {
                user_id,
            },
            distinct_id: user_id,
        });
    } catch (err) {
        return next(err);
    }
};

const captureCollabEvent = (event) => {
    return async (req, res, next) => {
        try {
            const user_id = req.user.id;

            const properties = {
                user_id,
            };

            if (event == 'request action') {
                properties.response_time = res.body.response_time;
            }

            await posthogService.captureEvent({
                event,
                properties,
                distinct_id: user_id,
            });
        } catch (err) {
            return next(err);
        }
    };
};

module.exports = {
    createNewExp,
    attachBrandLogo,
    addExpErrorHandler,
    attachExp,
    addBrandLogoErrorHandler,
    createEmptyProject,
    addDesignErrorHandler,
    addProject,
    uploadImagesMiddlewareSetup,
    updateDesignErrorHandler,
    attachEmptyProposal,
    proposalCoverUploadError,
    attachProposal,
    attachProposalMessage,
    attachFileMessage,
    attachGroupFileMessage,
    captureBlockEvent,
    captureProfileEvent,
    captureCollabEvent,
};

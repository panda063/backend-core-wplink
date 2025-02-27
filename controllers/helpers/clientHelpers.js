// Dependencies

const C = require('../../lib/constants');
const agenda = require('../../services/agenda');
const _ = require('lodash');
const mongoose = require('mongoose');
const moment = require('moment');
const axios = require('axios');
const { BadRequest } = require('../../lib/errors');

// Models
const ConversationClient = mongoose.model(C.MODELS.CONVERSATION_CLIENT);
const ConversationPM = mongoose.model(C.MODELS.CONVERSATION_PM);
const Creator = mongoose.model(C.MODELS.WRITER_C);
const User = mongoose.model(C.MODELS.USER_C);
const Project = mongoose.model(C.MODELS.PROJECT);
const Brief = mongoose.model(C.MODELS.BRIEF);

// Services
const { updateConverstionInCache } = require('../../services/redis/operations');

// This action is taken when creator or pm is hired
// A conversation is created with active state or an existing conversation is turned into active state
const createConversation = async (u1, u2) => {
    let conversation = await ConversationClient.findOne({
        u1,
        u2,
    }).exec();
    const creator = await User.findById(u2).select('lv sstats').exec();
    const creatorRole = creator.__t;
    if (!conversation) {
        conversation = new ConversationClient({
            u1,
            u2,
            p2: 1,
            st: C.CONVERSATION_STATUS.CREATED,
            ctw:
                creatorRole == C.ROLES.PM_C
                    ? C.CONVERSATION_CLIENT_U2.PM
                    : C.CONVERSATION_CLIENT_U2.CREATOR,
            sta: C.CONVERSATION_STATE.ACTIVE,
        });
        // * Classified status currently supported for writers only
        if (creatorRole == C.ROLES.WRITER_C) {
            // Creating conversation for classified creators
            conversation.cc =
                creator.level == C.CREATOR_LEVEL.CLASSIFIED ? true : false;
            if (creator.lv == C.CREATOR_LEVEL.CLASSIFIED) {
                conversation.cli.clss =
                    C.CONVERSATION_CLASSIFIED_STATES.CLASSIFIED;
            }
        } else if (creatorRole == C.ROLES.PM_C) {
            // PM stats update
            creator.sstats.stp += 1;
        }
    } else if (conversation.st == C.CONVERSATION_STATUS.INIT) {
        conversation.st = C.CONVERSATION_STATUS.CREATED;
        conversation.lmd = new Date(moment());
        conversation.ctw =
            creatorRole == C.ROLES.PM_C
                ? C.CONVERSATION_CLIENT_U2.PM
                : C.CONVERSATION_CLIENT_U2.CREATOR;
        conversation.p2 = 1;
        conversation.sta = C.CONVERSATION_STATE.ACTIVE;
        // * Classified status currently supported for writers only
        if (creatorRole == C.ROLES.WRITER_C) {
            // Creating conversation for classified creators
            conversation.cc =
                creator.level == C.CREATOR_LEVEL.CLASSIFIED ? true : false;
            if (creator.lv == C.CREATOR_LEVEL.CLASSIFIED) {
                conversation.cli.clss =
                    C.CONVERSATION_CLASSIFIED_STATES.CLASSIFIED;
                conversation.cli.stcac = new Date(moment());
            }
        } else if (creatorRole == C.ROLES.PM_C) {
            // PM stats update
            creator.sstats.stp += 1;
        }
    } else {
        if (conversation.sta == C.CONVERSATION_STATE.INVITE) {
            // If conversation is in invite state then there is message type invite(brief) which has a agenda that expires it.
            // We cancel this agenda
            conversation.sta = C.CONVERSATION_STATE.ACTIVE;
            await agenda.cancel({
                name: 'expire_invite_30_day',
                'data.conversationId': conversation.id,
            });
        } else if (conversation.sta == C.CONVERSATION_STATE.WAITING) {
            conversation.sta = C.CONVERSATION_STATE.ACTIVE;
            // ? since proposal expiry has no affect on conversation, agenda cancellation is not necessary
        }
        // This conversation might have been started by client sending brief to creator
        // Update status of this Brief to proposal_accepted
        const findBrief = await Brief.findOneAndUpdate(
            {
                convoId: conversation.id,
            },
            {
                $set: {
                    st: C.BRIEF_STATES.PROPOSAL_ACCEPTED,
                },
            },
        ).exec();
        // * Classified status currently supported for writers only
        if (creatorRole == C.ROLES.WRITER_C) {
            // ? how to handle declined state?
            if (
                creator.lv == C.CREATOR_LEVEL.CLASSIFIED &&
                conversation.cli.clss ==
                    C.CONVERSATION_CLASSIFIED_STATES.NOT_CLASSIFIED
            ) {
                conversation.cli.clss =
                    C.CONVERSATION_CLASSIFIED_STATES.CLASSIFIED;
                conversation.cli.stcac = new Date(moment());
            }
        }
    }
    await conversation.save();
    await creator.save();
    // Update redis with new value of conversation
    await updateConverstionInCache({
        conversation,
    });
    return conversation;
};

const createConversationPm = async (u1, u2, client) => {
    let conversation = await ConversationPM.findOne({
        u1,
        u2,
    }).exec();
    if (!conversation) {
        conversation = new ConversationPM({
            u1,
            u2,
            st: C.CONVERSATION_STATUS.CREATED,
            sta: C.CONVERSATION_PM_STATE.ACTIVE,
        });
        // Update PM stats
        client.sstats.colc += 1;
        await client.save();
    }
    await conversation.save();
    return conversation;
};

const rankedResult = async ({ client, projects, creators }) => {
    const modClient = { id: client.id };
    const modProjects = _.map(projects, (project) => {
        return { id: project.id, creatorId: project.cid };
    });
    const modCreators = await Promise.all(
        _.map(creators, async (creator) => {
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
            let totalExperienceInDays = 1;
            for (let exp of creator.pfi) {
                let d1 = moment(exp.s);
                let d2 = moment();
                if (exp.iwh == false) {
                    d2 = moment(exp.e);
                }
                totalExperienceInDays += d2.diff(d1, 'days');
            }
            const convoCount = await ConversationClient.countDocuments({
                u1: client._id,
                u2: creator._id,
                st: C.CONVERSATION_STATUS.CREATED,
            }).exec();
            return {
                id: creator.id,
                lastActive: creator.lac,
                portfolioComplete:
                    portfolioComplete.invited +
                    portfolioComplete.shared +
                    portfolioComplete.projectAdded,
                testimonialCount: creator.tstm.length,
                experience: totalExperienceInDays,
                projectCount: convoCount,
            };
        }),
    );
    try {
        const response = await axios.post('http://localhost:4200/build-feed', {
            client: modClient,
            projects: modProjects,
            creators: modCreators,
        });
        return response.data;
    } catch (err) {
        throw new BadRequest('Not ok from feed service');
    }
};

const getPaymentGatewayCharge = async ({
    pg,
    total,
    presentmentCurrency,
    clientCardCountry,
    payeeCountry,
}) => {
    let totalGatewayCharge = 0;
    if (pg == C.PAYMENT_GATEWAY.STRP) {
        // * Case 1: When creator is in India
        // Creator in India, Client in India
        // Presentment is INR
        // ? Presentment in USD
        if (
            payeeCountry == C.CURRENCY_COUNTRY.INDIA &&
            clientCardCountry === C.COUNTRY_CODES.INDIA &&
            presentmentCurrency == C.CURRENCY.INR
        ) {
            // Gateway charge = 2% of total
            // GST = 18% of (Gateway charge)
            totalGatewayCharge = (0.0236 * total) / 0.9764;
        }
        // Creator in India and Client outside India
        // Presentment is INR
        else if (
            payeeCountry == C.CURRENCY_COUNTRY.INDIA &&
            clientCardCountry !== C.COUNTRY_CODES.INDIA &&
            presentmentCurrency == C.CURRENCY.INR
        ) {
            // Gateway charge = 3% of total
            // GST = 18% of (Gateway charge)
            totalGatewayCharge = (0.0354 * total) / 0.9646;
        }
        // Creator in India and Client outside India
        // Presentment is USD
        else if (
            payeeCountry == C.CURRENCY_COUNTRY.INDIA &&
            clientCardCountry !== C.COUNTRY_CODES.INDIA &&
            presentmentCurrency == C.CURRENCY.USD
        ) {
            // Payment gateway charge = 4.3% of total
            // conversion = 2% of total
            // gst = 18% of (Payment gateway charge + total)
            totalGatewayCharge = (0.07434 * total) / 0.92566;
        }
        // * Case 2: When creator is in USA
        // Creator in USA and Client in USA
        // Presentment is USD
        // ! Presentment in INR is currently disabled
        else if (
            payeeCountry == C.CURRENCY_COUNTRY.USA &&
            clientCardCountry === C.COUNTRY_CODES.USA &&
            presentmentCurrency == C.CURRENCY.USD
        ) {
            // Payment gateway charge = 2.9% of total + 30 cents
            totalGatewayCharge = (0.029 * total + 0.3) / 0.971;
        }
        /* // Creator in USA and Client outside USA
        // Presentment is INR
        // ! Currently not supported
        else if (
            payeeCountry == C.CURRENCY_COUNTRY.USA &&
            clientCardCountry !== C.COUNTRY_CODES.USA &&
            presentmentCurrency == C.CURRENCY.INR
        ) {
            // TODO: Convert 30 cents to rupees
            const centsInRs = 30;
            pgCharge = total * 0.029 + centsInRs;
            conversion = 2 * total * 0.01;
        } */
        // Creator in USA and Client outside USA
        // Presentment is USD
        else if (
            payeeCountry == C.CURRENCY_COUNTRY.USA &&
            clientCardCountry !== C.COUNTRY_CODES.USA &&
            presentmentCurrency == C.CURRENCY.USD
        ) {
            // Payment gateway charge  = 2.9 % of total + 30
            // Conversion charge = 1% of total
            totalGatewayCharge = (0.039 * total + 0.3) / 0.961;
        }
    } else if (pg == C.PAYMENT_GATEWAY.CF) {
        // Creator in India and presentment is INR
        // Client uses a domestic card to make payment
        // Gateway charge = 1.75% of total
        // gst = 18% of (Gateway charge)
        // Rs 3 for payout
        totalGatewayCharge = (0.02065 * total + 3) / 0.97935;
        // ? What if client uses international card
    }
    return totalGatewayCharge;
};

module.exports = {
    createConversation,
    createConversationPm,
    rankedResult,
    getPaymentGatewayCharge,
};

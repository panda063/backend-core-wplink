/**
 * Module Dependencies
 */

const stripe = require('../../config/stripe');
const env = require('../../config/env');
const C = require('../../lib/constants');

const { BadRequest, InternalServerError } = require('../../lib/errors');

function generateAccountLink(accountID, role) {
    const creatorHome =
        role == C.MODELS.WRITER_C ? env.CREATOR_PORTFOLIO : env.PM_PORTFOLIO;
    return stripe.accountLinks
        .create({
            type: 'account_onboarding',
            account: accountID,
            refresh_url: `${creatorHome}/refresh-stripe`,
            return_url: `${creatorHome}/connected`,
        })
        .then((link) => link.url);
}

exports.accountOnboard = async ({ creator }) => {
    let accountID = '';
    if (
        creator.strp.cns == C.STRIPE_CONNECTION_STATUS.NOT_DONE ||
        !creator.strp.acid
    ) {
        const account = await stripe.accounts.create({
            type: 'standard',
            email: creator.e,
            business_type: 'individual',
            // ?? Create country ->  ISO 3166-1 alpha-2 code mapping for all countries and set country by default
            country: creator.adr.co == C.CURRENCY_COUNTRY.INDIA ? 'IN' : 'US',
            individual: {
                email: creator.e,
                first_name: creator.n.f,
                last_name: creator.n.l,
            },
            /* * Supported with express/custom accounts only

            capabilities: {
                card_payments: { requested: true },
                transfers: { requested: true },
            },*/
            metadata: {
                role: creator.__t,
                id: creator.id,
            },
        });
        creator.strp.acid = account.id;
        accountID = account.id;
    } else if (
        (creator.strp.cns == C.STRIPE_CONNECTION_STATUS.STARTED ||
            creator.strp.cns == C.STRIPE_CONNECTION_STATUS.INFO_MISSING) &&
        creator.strp.acid
    ) {
        const getAccount = await stripe.account.retrieve(creator.strp.acid);
        accountID = creator.strp.acid;
    } else {
        throw new BadRequest('Invalid Request');
    }
    const accountLinkURL = await generateAccountLink(accountID, creator.__t);
    //
    creator.strp.cns = C.STRIPE_CONNECTION_STATUS.STARTED;
    await creator.save();
    return {
        accountLinkURL,
    };
    /**
     * * Creators shouldn't be able to send invoices until their account status is completed
     */
};

exports.generateRefreshUrl = async ({ creator }) => {
    // Generate only when onbaording is incomplete
    if (
        !(
            creator.strp.cns == C.STRIPE_CONNECTION_STATUS.STARTED ||
            creator.strp.cns == C.STRIPE_CONNECTION_STATUS.INFO_MISSING
        ) ||
        !creator.strp.acid
    )
        throw new BadRequest(
            'Invalid Request. Refresh Url can be generated only when onbaording flow was incomplete',
        );

    const accountLinkURL = await generateAccountLink(
        creator.strp.acid,
        creator.__t,
    );
    return {
        accountLinkURL,
    };
};

/**
 * For express accounts only
 */
exports.generateLoginLink = async ({ creator }) => {
    // Can only be generated when account was onboarded (details_submitted = true)
    // url is not generated in started/not_done state
    if (
        !creator.strp.acid ||
        creator.strp.cns == C.STRIPE_CONNECTION_STATUS.STARTED ||
        creator.strp.cns == C.STRIPE_CONNECTION_STATUS.NOT_DONE
    )
        throw new BadRequest('account not onboarded');
    const accountLink = await stripe.accounts.createLoginLink(
        creator.strp.acid,
    );
    return {
        accountLink,
    };
};

exports.getAccountOnboardState = async ({ creator }) => {
    return {
        stripeOnboardingState: creator.strp.cns,
    };
};

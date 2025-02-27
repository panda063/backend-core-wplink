/*
 * Module Dependencies
 */

const Agenda = require('agenda');
const debug = require('debug')('agenda:personal');
debug.enabled = true;
const logger = require('../../lib/logger');
const { CHRONS } = require('./constants');

/**
 * Agenda job controllers
 */

const {
    verification42h,
    verification72h,
    perk_1_42h,
    perk_1_72h,
    perk_2_42h,
    perk_2_72h,
    perk_2_week,
    perk_3_42h,
    perk_3_72h,
    perk_3_week,
    client_not_verified,
    client_not_registered,
    client_social_share,
    creator_register_reminder,
} = require('./gamification');
const {
    expire_job_as_inactive,
    close_opportunity,
    expire_opportunity,
} = require('./job-board');
const {
    client_reminder_2_day,
    client_reminder_15_day,
    creator_follow_up_1,
    creator_follow_up_2,
    creator_follow_up_3,
    creator_follow_up_4,
    creator_follow_up_5,
    referral_loop_five,
    referral_loop_four,
    referral_loop_six,
    referral_loop_three,
    send_report_reminder,
    send_analytics_email,
    creator_onboarding_1,
    creator_onboarding_2,
} = require('./userNotification.js');
const {
    expire_invite_30_day,
    proposal_14_day,
    post_job_outside,
    messageReminder,
} = require('./chat');
const { generate_project_scores, new_content_studios } = require('./projects');

const { copyPageBlocks } = require('./blocks');

const { calculateScoreForCollabFeed } = require('./feed');

// * Process new jobs every 30 seconds

const agenda = new Agenda({ processEvery: '30 seconds' });

/**
 *  ! Deprecated
 * * There are the chron job definitions
 * * Global jobs that run when agenda is started is defined in the agenda.on('ready') event at the bottom
 */
/**
 * Project chrons
 */

agenda.define('generate-project-scores', (cj, done) => {
    generate_project_scores({ agenda })
        .then(() => {
            done();
        })
        .catch((err) => {
            logger.error(err);
            done(err);
        });
});

/**
 * Feed Chrons
 */

agenda.define('score-collab-feed', (cj, done) => {
    calculateScoreForCollabFeed({})
        .then(() => {
            done();
        })
        .catch((err) => {
            logger.error(err);
            done(err);
        });
});

// When creator posts new project inform studios
agenda.define('new_content_studios', (cj, done) => {
    new_content_studios({ ...cj.attrs.data })
        .then(() => {
            done();
        })
        .catch((err) => {
            logger.error(err);
            done(err);
        });
});

/**
 * Block/Page chrons
 */

agenda.define('copy_page', (cj, done) => {
    copyPageBlocks({ ...cj.attrs.data })
        .then(() => {
            done();
        })
        .catch((err) => {
            logger.error(err);
            done(err);
        });
});

/**
 * Job Board Chrons
 */

// run this every day for deadlined jobs
agenda.define('expire_job_inactive', (cj, done) => {
    expire_job_as_inactive({ agenda })
        .then(() => {
            done();
        })
        .catch((err) => {
            logger.error(err);
            done(err);
        });
});

// when job deadling is reached
agenda.define('close_opportunity', (cj, done) => {
    close_opportunity({ ...cj.attrs.data })
        .then(() => done())
        .catch((err) => {
            logger.error(err);
            done(err);
        });
});

// After 11 days of deadline for notification
agenda.define('expire_opportunity', (cj, done) => {
    expire_opportunity({ ...cj.attrs.data })
        .then(() => done())
        .catch((err) => {
            logger.error(err);
            done(err);
        });
});

/**
 *  User Reminder email Chrons
 */

agenda.define('creator-onboarding-1', (cj, done) => {
    creator_onboarding_1({ ...cj.attrs.data })
        .then(() => {
            done();
        })
        .catch((err) => {
            logger.error(err);
            done(err);
        });
});

agenda.define('creator-onboarding-2', (cj, done) => {
    creator_onboarding_2({ ...cj.attrs.data })
        .then(() => {
            done();
        })
        .catch((err) => {
            logger.error(err);
            done(err);
        });
});

// Creator follow up 1
agenda.define('creator-follow-up-1', (cj, done) => {
    creator_follow_up_1({ ...cj.attrs.data })
        .then(() => {
            done();
        })
        .catch((err) => {
            logger.error(err);
            done(err);
        });
});

// Creator follow up 2
agenda.define('creator-follow-up-2', (cj, done) => {
    creator_follow_up_2({ ...cj.attrs.data })
        .then(() => {
            done();
        })
        .catch((err) => {
            logger.error(err);
            done(err);
        });
});

// Creator follow up 3
agenda.define('creator-follow-up-3', (cj, done) => {
    creator_follow_up_3({ ...cj.attrs.data })
        .then(() => {
            done();
        })
        .catch((err) => {
            logger.error(err);
            done(err);
        });
});

// Creator follow up 4
agenda.define('creator-follow-up-4', (cj, done) => {
    creator_follow_up_4({ ...cj.attrs.data })
        .then(() => {
            done();
        })
        .catch((err) => {
            logger.error(err);
            done(err);
        });
});

// Creator follow up 5
agenda.define('creator-follow-up-5', (cj, done) => {
    creator_follow_up_5({ ...cj.attrs.data })
        .then(() => {
            done();
        })
        .catch((err) => {
            logger.error(err);
            done(err);
        });
});

// Remind client every 2 day of new applications
agenda.define('client_2_day', (cj, done) => {
    client_reminder_2_day({ ...cj.attrs.data })
        .then(() => {
            done();
        })
        .catch((err) => {
            logger.error(err);
            done(err);
        });
});

// Remind client every 15 day of new applications
agenda.define('client_15_day', (cj, done) => {
    client_reminder_15_day({ ...cj.attrs.data })
        .then(() => {
            done();
        })
        .catch((err) => {
            logger.error(err);
            done(err);
        });
});

// Remind client every 15 day of new applications
agenda.define('send_report_reminder', (cj, done) => {
    send_report_reminder({ ...cj.attrs.data })
        .then(() => {
            done();
        })
        .catch((err) => {
            logger.error(err);
            done(err);
        });
});

// Daily analytics email

agenda.define('send_analytics_email', (cj, done) => {
    send_analytics_email({ ...cj.attrs.data })
        .then(() => {
            done();
        })
        .catch((err) => {
            logger.error(err);
            done(err);
        });
});

/**
 * Chat Chrons
 */
// Expire client brief after 30 days
agenda.define('expire_invite_30_day', (cj, done) => {
    expire_invite_30_day({ ...cj.attrs.data })
        .then(() => {
            done();
        })
        .catch((err) => {
            logger.error(err);
            done(err);
        });
});

// Expire proposal after 14 days
agenda.define('expire_proposal_14_day', (cj, done) => {
    proposal_14_day({ ...cj.attrs.data })
        .then(() => {
            done();
        })
        .catch((err) => {
            logger.error(err);
            done(err);
        });
});

// After Pm broadcasts job opportunity
agenda.define('post_job_outside', (cj, done) => {
    post_job_outside({ ...cj.attrs.data })
        .then(() => {
            done();
        })
        .catch((err) => {
            logger.error(err);
            done(err);
        });
});

agenda.define('send_chat_message_reminder', (cj, done) => {
    messageReminder({ ...cj.attrs.data })
        .then(() => {
            done();
        })
        .catch((err) => {
            logger.error(err);
            done(err);
        });
});

// Marketing emails

// Creator follow up 1
agenda.define('referral_loop_three', (cj, done) => {
    referral_loop_three({ ...cj.attrs.data })
        .then(() => {
            done();
        })
        .catch((err) => {
            logger.error(err);
            done(err);
        });
});

// Creator follow up 2
agenda.define('referral_loop_four', (cj, done) => {
    referral_loop_four({ ...cj.attrs.data })
        .then(() => {
            done();
        })
        .catch((err) => {
            logger.error(err);
            done(err);
        });
});

// Creator follow up 3
agenda.define('referral_loop_five', (cj, done) => {
    referral_loop_five({ ...cj.attrs.data })
        .then(() => {
            done();
        })
        .catch((err) => {
            logger.error(err);
            done(err);
        });
});

// Creator follow up 4
agenda.define('referral_loop_six', (cj, done) => {
    referral_loop_six({ ...cj.attrs.data })
        .then(() => {
            done();
        })
        .catch((err) => {
            logger.error(err);
            done(err);
        });
});

// Gamification Mail Schedulation

agenda.define(CHRONS.G_NO_REGISTRATION_REMINDER, (cj, done) =>
    creator_register_reminder({ ...cj.attrs.data })
        .then(() => done())
        .catch((err) => {
            logger.error(err);
            done(err);
        }),
);

agenda.define(CHRONS.G_NO_VERIFICATION_42, (cj, done) =>
    verification42h({ ...cj.attrs.data, agenda })
        .then(() => done())
        .catch((err) => {
            logger.error(err);
            done(err);
        }),
);
agenda.define(CHRONS.G_NO_VERIFICATION_72, (cj, done) =>
    verification72h({ ...cj.attrs.data })
        .then(() => done())
        .catch((err) => {
            logger.error(err);
            done(err);
        }),
);
agenda.define(CHRONS.G_PERK_1_42, (cj, done) =>
    perk_1_42h({ ...cj.attrs.data, agenda })
        .then(() => done())
        .catch((err) => {
            logger.error(err);
            done(err);
        }),
);
agenda.define(CHRONS.G_PERK_1_72, (cj, done) =>
    perk_1_72h({ ...cj.attrs.data })
        .then(() => done())
        .catch((err) => {
            logger.error(err);
            done(err);
        }),
);
agenda.define(CHRONS.G_PERK_2_42, (cj, done) =>
    perk_2_42h({ ...cj.attrs.data, agenda })
        .then(() => done())
        .catch((err) => {
            logger.error(err);
            done(err);
        }),
);
agenda.define(CHRONS.G_PERK_2_72, (cj, done) =>
    perk_2_72h({ ...cj.attrs.data, agenda })
        .then(() => done())
        .catch((err) => {
            logger.error(err);
            done(err);
        }),
);

agenda.define(CHRONS.G_PERK_2_W, (cj, done) =>
    perk_2_week({ ...cj.attrs.data })
        .then(() => done())
        .catch((err) => {
            logger.error(err);
            done(err);
        }),
);

agenda.define(CHRONS.G_PERK_3_42, (cj, done) =>
    perk_3_42h({ ...cj.attrs.data, agenda })
        .then(() => done())
        .catch((err) => {
            logger.error(err);
            done(err);
        }),
);
agenda.define(CHRONS.G_PERK_3_72, (cj, done) =>
    perk_3_72h({ ...cj.attrs.data, agenda })
        .then(() => done())
        .catch((err) => {
            logger.error(err);
            done(err);
        }),
);
agenda.define(CHRONS.G_PERK_3_W, (cj, done) =>
    perk_3_week({ ...cj.attrs.data })
        .then(() => done())
        .catch((err) => {
            logger.error(err);
            done(err);
        }),
);

agenda.define(CHRONS.GC_NOT_REGISTERED, (cj, done) =>
    client_not_registered({ ...cj.attrs.data })
        .then(() => done())
        .catch((err) => {
            logger.error(err);
            done(err);
        }),
);

agenda.define(CHRONS.GC_NOT_VERIFIED, (cj, done) =>
    client_not_verified({ ...cj.attrs.data })
        .then(() => done())
        .catch((err) => {
            logger.error(err);
            done(err);
        }),
);

agenda.define(CHRONS.GC_SOCIAL_REMINDER_1D, (cj, done) =>
    client_social_share({ ...cj.attrs.data })
        .then(() => done())
        .catch((err) => {
            logger.error(err);
            done(err);
        }),
);

agenda.on('ready', () => {
    debug('Started Agenda');
    agenda.every('1 day', 'expire_job_inactive');
    agenda.every('1 day', 'score-collab-feed');
    // agenda.every('1 day', 'generate-project-scores');
});

module.exports = agenda;

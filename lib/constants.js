// Industries Constant
const { INDUSTRIES } = require('./industry-constants');

/**
 * JWT token expiry times
 */

const JWTCOOKIE_EXPIRY = 1 * 24 * 60 * 60 * 1000; // Specified in miliseconds. Currently set to equal SIGNIN_TOKEN_EXPIRESIN
const REFRESH_JWTCOOKIE_EXPIRY = 12 * 30 * 24 * 60 * 60 * 1000; // Specified in miliseconds. Currently set to equal SIGNIN_REFRESH_TOKEN_EXPIRESIN
const DEFAULT_TOKEN_EXPIRESIN = 15 * 24 * 60 * 60;
const SIGNIN_TOKEN_EXPIRESIN = 1 * 24 * 60 * 60;
const SIGNIN_REFRESH_TOKEN_EXPIRESIN = 12 * 30 * 24 * 60 * 60;
const TESTIMONIAL_TOKEN_EXPIRESIN = 1 * 30 * 24 * 60 * 60;
const STRIPE_TOKEN = 1 * 24 * 60 * 60;
const GA_USER_TOKEN = 3 * 30 * 24 * 60 * 60;

const JWT_COOKIE_NAMES = {
    LOGIN_TOKEN_NAME: 'jwt',
    REFRESH_TOKEN_NAME: 'refresh-jwt',
};

/**
 * REGEX
 */
const emailRegex = /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/;

/*
 * Models
 * TODO: may be create new thing for ROLES
 */
// Users
const USER_C = 'User';
const WRITER_C = 'Writer';
const PM_C = 'PM';
const SA_C = 'SA';
const GU_C = 'GU';
const CLIENT_C = 'Client';
const EXT_CLIENT = 'ExtClient';
const REF_C = 'Reference';
const GAMIFICATION_C = 'Gamification';
const C_GAMIFICATION_C = 'ClientGamification';
const GAMIFICATION_AD = 'GamificationAdmin';
const GAMIFICATION = 'UserGamification';
const MENTOR_C = 'Mentor';
// Other
const INDUSTRY_C = 'Industry';
const LEVEL_C = 'Level';
const LOG_C = 'Log';
const NOTIFICATION_C = 'Notification';
const CRON_JOBS_C = 'chronJobs';
const ORGANISATION_C = 'Organisation';
const JOB_BOARD_C = 'JobBoard';
const JOB_BOARD_APPLICATION_C = 'Application';
const JOB_BOARD_REPORTING_C = 'Reportings';
const TEXT_EDITOR = 'TextEditor';
// Project
const PROJECT = 'Project';
const CARDS = 'Cards';
const PDF = 'PDF';
const CARD_TYPES = {
    SHORT_FORM: 'short-form',
    DESIGN: 'design',
};
const LONG_FORM = 'LongForm';
// Templates
const TEMPLATE = 'Template';
const PROPOSAL = 'Proposal';
const FORM = 'Form';
// Chat
const USER = 'User';
const CONVERSATION = 'Conversation';
const CONVERSATION_CLIENT = 'ConversationClient';
const CONVERSATION_PM = 'ConversationPM';
const CONVERSATION_EXT = 'ConversationExt';
const CONVERSATION_CREATOR = 'ConversationCreator';
const GROUP_CONVERSATION = 'GroupConversation';
const GROUP_MESSAGE = 'GroupMessage';
const MESSAGE = 'Message';
const INVOICE = 'Invoice';
const BRIEF = 'Brief';
const PROPOSAL_M = 'ProposalM';
const FORM_M = 'FormM';
const FILE = 'File';
const GROUP_FILE = 'GroupFile';
const STUDIO_INVITE = 'StudioInvite';
const STUDIO_REQUEST = 'StudioRequest';
const JOB_INVITE = 'JobInvite';
const INFO_TEXT = 'InfoText';
const GROUP_INFO_TEXT = 'GroupInfoText';
const EXT_REQUEST = 'ExtRequest';
const EXT_PAY = 'ExtPay';
const REQUEST_COLLAB = 'RequestCollab';
const GROUP_INVOICE = 'GroupInvoice';

// Other
const TRANSACTION = 'Transaction';
const FILE_UPLOAD = 'FileUpload';
// Boards
const LIST_CARD = 'ListCard';
const LISTNAMES = {
    BRIEFS: 'project_briefs',
    PROPOSALS: 'proposals',
    INVOICES_RECEIVED: 'invoices_received',
    INVOICES_SENT: 'invoices_sent',
};
const LIST_CARD_STATUS = {
    NEW: 'new',
    SEEN: 'seen',
};
// Blocks
const BLOCK = 'Block';
const TESTIMONIAL_BLOCK = 'TestimonialBlock';
const LINK_BLOCK = 'LinkBlock';
const IMAGE_BLOCK = 'ImageBlock';
const PROJECT_BLOCK = 'ProjectBlock';
const SERVICE_BLOCK = 'ServiceBlock';
const EXPERIENCE_BLOCK = 'ExperienceBlock';
const PDF_BLOCK = 'PDFBlock';
const PAGE = 'Page';
const PAGE_BREAK = 'PageBreak';
const IMPORTED_SERVICE = 'ImportedService';

// InvoiceBill
const INVOICE_BILL = 'InvoiceBill';
const INVOICE_CLIENT = 'InvoiceClient';

// Collaboration
const COLLAB_REQUEST = 'CollabRequest';
const COLLAB_IMPORT = 'CollabImport';

// Theme
const THEME = 'Theme';

const MODELS = Object.freeze({
    USER_C,
    WRITER_C,
    PM_C,
    CLIENT_C,
    EXT_CLIENT,
    SA_C,
    GU_C,
    REF_C,
    GAMIFICATION_C,
    C_GAMIFICATION_C,
    GAMIFICATION_AD,
    GAMIFICATION,
    MENTOR_C,
    INDUSTRY_C,
    LEVEL_C,
    LOG_C,
    NOTIFICATION_C,
    CRON_JOBS_C,
    ORGANISATION_C,
    JOB_BOARD_C,
    JOB_BOARD_APPLICATION_C,
    JOB_BOARD_REPORTING_C,
    TEXT_EDITOR,
    PROJECT,
    CARDS,
    PDF,
    LONG_FORM,
    TEMPLATE,
    PROPOSAL,
    FORM,
    USER,
    CONVERSATION,
    CONVERSATION_CLIENT,
    CONVERSATION_PM,
    CONVERSATION_EXT,
    CONVERSATION_CREATOR,
    GROUP_CONVERSATION,
    GROUP_MESSAGE,
    MESSAGE,
    INVOICE,
    INVOICE_BILL,
    INVOICE_CLIENT,
    BRIEF,
    PROPOSAL_M,
    FORM_M,
    STUDIO_INVITE,
    STUDIO_REQUEST,
    JOB_INVITE,
    INFO_TEXT,
    GROUP_INFO_TEXT,
    EXT_REQUEST,
    EXT_PAY,
    FILE,
    GROUP_FILE,
    TRANSACTION,
    LIST_CARD,
    FILE_UPLOAD,
    BLOCK,
    TESTIMONIAL_BLOCK,
    LINK_BLOCK,
    IMAGE_BLOCK,
    PROJECT_BLOCK,
    SERVICE_BLOCK,
    EXPERIENCE_BLOCK,
    PDF_BLOCK,
    PAGE_BREAK,
    PAGE,
    COLLAB_REQUEST,
    COLLAB_IMPORT,
    REQUEST_COLLAB,
    IMPORTED_SERVICE,
    GROUP_INVOICE,
    THEME,
});

/*
 * ROLES
 */
const ROLES = Object.freeze({
    WRITER_C,
    CLIENT_C,
    SA_C,
    GU_C,
    PM_C,
    EXT_CLIENT,
});

/*
 * Account Status
 */
const ACCOUNT_STATUS = Object.freeze({
    NEW: 'new',
    ACTIVE: 'active',
    INACTIVE: 'inactive',
    BAN: 'ban',
});

const ACCOUNT_SIGNUP_MODE = Object.freeze({
    GOOGLE: 'google',
    EMAIL: 'email',
});
// ********************** Chat Constants*********************

/**
 * Chat Constants
 */
const PROPOSAL_PAYOUT_CONDITION = [
    'BEFORE_PROJECT_100',
    'BEFORE_PROJECT_50',
    'AFTER_PROJECT_100',
];
const CONVERSATION_CLIENT_U2 = {
    CREATOR: 'Creator',
    PM: 'PM',
};
const CONVERSATION_STATUS = {
    INIT: 'init',
    CREATED: 'created',
};
const CONVERSATION_STATE = {
    INVITE: 'invite',
    ACTIVE: 'active',
    WAITING: 'waiting',
    DECLINED: 'declined',
};

const CONVERSATION_PM_STATE = {
    INVITE: 'invite',
    ACTIVE: 'active',
    DECLINED: 'declined',
    NEW_JOB: 'new_job',
};

const CONVERSATION_EXT_STATE = {
    INVITE: 'invite',
    ACCEPTED: 'accepted',
};

const CONVERSATION_TYPE = {
    INBOX: 'inbox',
    PROJECT: 'project',
};

const CONVERSATION_CREATOR_STATE = {
    INVITE: 'invite',
    ACCEPTED: 'accepted',
};

const CONVERSATION_LOCAL_STATE = {
    ONGOING: 'ongoing',
    ARCHIVED: 'archived',
    COMPLETED: 'completed',
};

const DRAFT = 'draft';
const SENT = 'sent';
const PENDING = 'pending';
// const PART_PAID = 'part_paid';
const PAID = 'paid';
const CANCELLED = 'cancelled';

const INVOICE_STATES = {
    DRAFT,
    SENT,
    PENDING,
    PAID,
    CANCELLED,
};
const INVOICE_MODE = {
    RECEIVE: 'receive',
    TRANSFER: 'transfer',
};

const INVOICE_UNIT_TYPES = {
    FIXED: 'fixed',
    PERCENT: 'percent',
};

const PAYMENT_GATEWAY = {
    STRP: 'stripe',
    CF: 'cashfree',
    RP: 'razorpay',
};

const CONVERSATION_CLASSIFIED_STATES = {
    NOT_CLASSIFIED: 'not_classified',
    CLASSIFIED: 'classified',
    FIRST_INVOICE_SENT: 'first_invoice_sent',
};

const ACCEPTED = 'accepted';
const REJECTED = 'rejected';
const PROPOSAL_STATES = {
    SENT,
    ACCEPTED,
    REJECTED,
    EXPIRED: 'expired',
};
const BRIEF_STATES = {
    SENT: 'sent',
    PROPOSAL_SENT: 'proposal_sent',
    PROPOSAL_ACCEPTED: 'proposal_accepted',
    DECLINED: 'declined',
};
const FILES = 'files';
const IMAGES_FILES = 'images_files';
const IMAGES = 'images';
const FILE_MESSAGE_TYPES = {
    FILES,
    IMAGES,
    IMAGES_FILES,
};

const FORM_TYPES = {
    TEXT: 'text',
    MULTI_CHOICE: 'multiple_choice',
    CHECKBOX: 'checkbox',
};
const STUDIO_INVITE_STATES = {
    SENT: 'sent',
    ACCEPTED: 'accepted',
    DECLINED: 'declined',
};
const STUDIO_REQUEST_STATES = {
    SENT: 'sent',
    ACCEPTED: 'accepted',
    DECLINED: 'declined',
};

const GROUP_USER_OFF_PLATFORM_TYPE = {
    CLIENT: 'client',
    CREATOR: 'creator',
    PM: 'pm',
};

const EXT_REQUEST_STATES = {
    PENDING: 'pending',
    ACCEPTED: 'accepted',
    DECLINED: 'declined',
};

const EXT_PAY_STATES = {
    PENDING: 'pending',
    ACCEPTED: 'accepted',
    DECLINED: 'declined',
};

const EXT_PAY_TRANSFER_STATES = {
    PENDING: 'pending',
    SUCCESS: 'success',
    FAILED: 'failed',
};

const GROUP_CONVERSATION_TYPES = {
    GROUP: 'group',
    PROJECT: 'project',
};

// ******************** Client Constants****************

/**
 * Client Onboarding States
 */
const CLIENT_PROFILE_STATUS = {
    PERSONAL_DETAILS_PENDING: 'PERSONAL_DETAILS_PENDING',
    ORGANISATION_DETAILS_PENDING: 'ORGANISATION_DETAILS_PENDING',
    ORGANISATION_DETAILS_COMPLETED: 'ORGANISATION_DETAILS_COMPLETED',
};
const CLIENT_COLLECT_PREV_INVITE_LIMIT = 3;

const CLIENT_POSTING_JOB_AS_TYPES = {
    ORGANISATION: 'organisation',
    SELF: 'self',
};

const CLIENT_ROLE = {
    INDIVIDUAL: 'individual',
    EMPLOYEE: 'employee',
};

// **************** Creator Constants ********************

const EXCLUDE_USERNAMES = [
    'blog',
    'about-us',
    'api',
    'article',
    'contact-us',
    'creators',
    'design',
    'forgot-password',
    'g-auth-login',
    'g-auth-success-writer',
    'link',
    'login',
    'onboarding',
    'pdf',
    'privacy-policy',
    'refund-policy',
    'register-client',
    'reset-password',
    'signup',
    'terms-and-conditions',
    'user-client',
    'verification-mail',
    'verify',
    '_sites',
    'creator',
    'client',
    'ext-client',
    'invoice',
    'beta-landing',
    'cold-email-strategy',
];

const PROFILE_SETUP_EXPERIENCE = {
    OPTION1: '<1',
    OPTION2: '1-4',
    OPTION3: '5-10',
    OPTION4: '>10',
};

const PROFILE_SETUP_CATEGORY = {
    MARKETING: 'Marketing',
    PRODUCT: 'Product',
    ENGINEERING: 'Engineering',
    HR: 'HR',
};

const PROFILE_SETUP_DEVOTE_TIME = {
    OPTION1: '<1',
    OPTION2: '1-3',
    OPTION3: '3-5',
    OPTION4: '>5',
};

const PROFILE_SETUP_MINPAY_UNIT = {
    HOUR: 'hour',
    DAY: 'day',
    WEEK: 'week',
    MONTH: 'month',
    WORD: 'word',
    PROJECT: 'project',
};

// Creator Types
const CREATOR_TYPES = {
    WRITER: 'writer',
    DESIGNER: 'designer',
    PM: 'pm',
};
/**
 * Creator levels
 */
const CREATOR_LEVEL = {
    LIMITED: 1,
    NORMAL: 2,
    CLASSIFIED: 3,
};

/**
 * Creator Stripe connection status
 */
const STRIPE_CONNECTION_STATUS = {
    NOT_DONE: 'not_done',
    STARTED: 'started',
    INFO_MISSING: 'info_missing',
    COMPLETED: 'completed',
};

// Cashfree connection status
const CF_CONNECTION_STATUS = {
    PENDING: 'pending',
    ONBOARDED: 'onboarded',
};

// Razorpay connection status
const RZPY_CONNECTION_STATUS = {
    PENDING: 'pending',
    ONBOARDED: 'onboarded',
};
/**
 * Creator Onboarding States
 */
const CREATOR_ONBOARDING_STATES = {
    NEW: 'new',
    PROJECT_PREVIEW: 'project_preview',
    DONE: 'done',
};
const V3_CREATOR_ONBOARDING_STATES = {
    STEP_SETUP: 'setup',
    STEP_NEW: 'new',
    /* STEP_TOOLTIPS: 'tooltips',
    STEP_CHAT_TOOLTIP: 'chat_tooltip', */
    STEP_DONE: 'done',
};
// Creator Budget Range
const CREATOR_BUDGET_LIMITS = {
    MIN_BUDGET: 0,
    MAX_BUDGET: 100000,
    MIN_PER_HOUR: 0,
    MAX_PER_HOUR: 1000,
};
/**
 * Portfolio image versions
 */
const WEBP = 'webp';
const THUMB = 'thumb';
const V1 = '780x780';
const V2 = '400x400';
const V3 = '150x150';
const V4 = '50x50';
const PORTFOLIO_IMAGE_VERSIONS = Object.freeze({
    WEBP,
    THUMB,
    V1,
    V2,
    V3,
    V4,
});
/**
 * ! Testimonials Constants
 */
const MAX_BOOKMARKS = 4;
const MAX_PUBLIC = 12;
const REQMESSAGE = 500;

/**
 * ! Project Constants
 */
const DESIGN_MAX_CARDS = 5;
const SHORT_FORM_TITLE = 54;
const SHORT_FORM_DESCRIPTION = 120;
const SHORT_FORM_CARD = 280;
const DESCRIPTION = 500;
const TITLE = 100;
// Long Form State
const INIT = 'init';
const SAVED = 'saved';
const LONG_FORM_STATES = Object.freeze({
    INIT,
    SAVED,
});
const PROJECT_TYPES = {
    LONG_FORM: 'LongForm',
    SHORT_FORM: 'ShortForm',
    DESIGN: 'Design',
    PDF: 'PDF',
};
const TONES = {
    CASUAL: 'Casual',
    FORMAL: 'Formal',
    SEMI_FORMAL: 'Semi-formal',
};

/**
 * Creator sharing platforms
 */
const SOCIAL_SHARE_OPTIONS = Object.freeze({
    FACEBOOK: 'facebook',
    LINKEDIN: 'linkedin',
    TWITTER: 'twitter',
    INSTAGRAM: 'instagram',
});
// ! Max brand logos
const MAX_BRAND_LOGOS = 4;
/**
 * ! Limit on number of experinces has been removed
 *
 */
const MAX_CREATOR_EXPERIENCES = 6;

const PORTFOLIO_THEMES = {
    // ! Old
    PASSION_ORANGE: 'PassionOrange',
    CLASSIC: 'Classic',
    GREEN: 'Green',
    BLUE: 'Blue',
    PURPLE: 'Purple',
    // New
    CLASSIC_BLUE: 'ClassicBlue',
    BROWN: 'Brown',
    DARK_BLUE: 'DarkBlue',
    DARK_CHOCOLATE: 'DarkChocolate',
    PASTEL: 'Pastel',
    OCEAN: 'Ocean',
    SUNNY: 'Sunny',
    DARK_WAVE: 'DarkWave',
    STRAWBERRY: 'Strawberry',
    // brand new themes
    Formal1: 'Formal1',
    Formal2: 'Formal2',
    Formal3: 'Formal3',
    Purple: 'Purple',
    Red: 'Red',
    Green: 'Green',
};

const PORTFOLIO_LAYOUT = {
    GRID: 'grid',
    LIST: 'list',
};

const CREATOR_ANALYTICS_DATA_POINTS = {
    PROFILE_VISITED: 'profile visited',
    POST_VIEWED: 'post viewed',
    SERVICE_VIEWED: 'service viewed',
    GOT_IN_TOUCH: 'got in touch',
};

const PAGE_STATES = {
    CREATED: 'created',
    COPYING: 'copying',
};

const PAGE_PROFILE_LAYOUT = {
    LEFT: 'Left',
    CENTER: 'Center',
    RIGHT: 'Right',
};

const PAGE_BLOCK_HIGHLIGHT = {
    COLOURFUL: 'Colourful',
    LIGHT_SWEEP: 'LightSweep',
    BORDER_SWEEP: 'BorderSweep',
    CUSTOM: 'Custom',
};

/**
 * Block constants
 */

const MAX_IN_IMAGE_BLOCK = 5;
const PROJECT_BLOCK_STATES = {
    INIT: 'init',
    SAVED: 'saved',
};

const SERVICE_BLOCK_FEES_TYPE = {
    FIXED: 'fixed',
    RATE: 'rate',
    CONTACT: 'contact',
    PREPAID: 'prepaid',
};

const SERVICE_BLOCK_ASK_MORE = {
    NAME: 'name',
    CONTACT: 'contact',
    COMPANY: 'company',
    PROJECT_TYPE: 'projectType',
    DURATION: 'duration',
    BUDGET: 'budget',
    DESCRIPTION: 'description',
};

const SERVICE_BLOCK_RATE_UNIT = {
    HOUR: 'hour',
    DAY: 'day',
    WEEK: 'week',
    MONTH: 'month',
    WORD: 'word',
    PROJECT: 'project',
};

const PAGE_BREAK_TYPES = {
    LINE: 'Line',
    TITLE_LINE: 'TitleLine',
    BLOCK: 'Block',
    TITLE_BLOCK: 'TitleBlock',
    BLANK: 'Blank',
    TITLE: 'Title',
};

const PAGE_BREAK_HEIGHT = {
    SINGLE: 'Single',
    DOUBLE: 'Double',
    TRIPLE: 'Triple',
};

const PAGE_BREAK_TEXT_ALIGN = {
    LEFT: 'Left',
    CENTER: 'Center',
    RIGHT: 'Right',
};

const PAGE_BREAK_TEXT_SIZE = {
    SMALL: 'Small',
    MEDIUM: 'Medium',
    LARGE: 'Large',
};

const PAGE_BREAK_TEXT_STYLE = {
    THIN: 'Thin',
    REGULAR: 'Regular',
    BOLD: 'Bold',
};

const PAGE_BREAK_TEXT_FONT = {
    ROBOTO: 'Roboto',
    TRAIN_ONE: 'TrainOne',
    FLAMENCO: 'Flamenco',
    LATO: 'Lato',
    MONSERRAT: 'Montserrat',
};

/**
 * Collaboration Constants
 */

const COLLAB_TYPE = {
    REFER: 'refer',
    MANAGE: 'manage',
};

const COLLAB_REQUEST_TYPE = {
    IMPORT: 'import',
    EXPORT: 'export',
};

const COLLAB_REQUEST_STATES = {
    PENDING: 'pending',
    ACCEPTED: 'accepted',
    DECLINED: 'declined',
};

const COLLAB_IMPORT_STATES = {
    ACTIVE: 'active',
    REMOVED: 'removed',
};

// ****************** PM Constants ********************

const STUDIO_MEMBERS_ALLOWED = {
    WRITER: 'writer',
    DESIGNER: 'designer',
};
const STUDIO_MEMBER_BADGES = {
    BRONZE: 'bronze',
    SILVER: 'silver',
    GOLD: 'gold',
};
const STUDIO_MEMBER_EMPLOYMENTS = {
    FULL_TIME: 'full_time',
    PART_TIME: 'part_time',
};
//*******************Common*********************

/*
 * Notification
 */
const UNSEEN = 'unseen';
const SEEN = 'seen';
const DELETED = 'deleted';
const EXPIRED = 'expired';
const NOTIFICATION_STATES = Object.freeze({
    UNSEEN,
    SEEN,
    DELETED,
    EXPIRED,
});

/*
 * Industries
 * ['active', 'inactive']
 */

const INDUSTRY_STATUS = Object.freeze({
    ACTIVE: 'active',
    INACTIVE: 'inactive',
});

// levels
const LEVELS = Object.freeze({
    BRONZE: 'bronze',
    SILVER: 'silver',
    GOLD: 'gold',
});

const NOTIFICATION_TYPES = Object.freeze({
    WEB: 'web',
    SMS: 'sms',
    EMAIL: 'email',
});

const GENDER = Object.freeze({
    MALE: 'male',
    FEMALE: 'female',
    OTHER: 'other',
    PREFER_NOT_TO_TELL: 'prefer_not_to_tell',
});

const NOTIF_USECASES = Object.freeze({
    [ROLES.WRITER_C]: {
        VERIFED_EMAIL: 'verified-email',
        CHANGED_PASSWORD: 'changed-password',
        PAYMENT: 'payment',
        RESET_PASSWORD: 'reset-password',
        VERIFY_EMAIL: 'verify-email',
        PORTFOLIO_DONE: 'portfolio-done',
        JOB_REVISION: 'job-revision',
        SEND_OTP: 'send-otp',
        RESEND_OTP: 'resend-otp',
        HIRED: 'hired',
        SHORTLISTED: 'shortlisted',
        REJECTED: 'rejected',
        TESTIMONIAL_OFF: 'testimonial_off',
        TESTIMONIAL_ON: 'testimonial_on',
        INVITE: 'invite',
    },
    [ROLES.CLIENT_C]: {
        RESET_PASSWORD: 'reset-password',
        CHANGED_PASSWORD: 'changed-password',
        VERIFED_EMAIL: 'verified-email',
        VERIFY_EMAIL: 'verify-email',
        CLIENT_FIRST_POST: 'client-first-post',
        OPPORTUNITY_CLOSURE_DATE: 'opportunity-closure-date',
        OPPORTUNITY_CLOSED: 'opportunity-closed',
        CLIENT_APPL_REMINDER: 'client-app-reminder',
    },
    [ROLES.PM_C]: {
        VERIFED_EMAIL: 'verified-email',
        VERIFY_EMAIL: 'verify-email',
        RESET_PASSWORD: 'reset-password',
        CHANGED_PASSWORD: 'changed-password',
        INVITE: 'invite',
    },
});

/**
 * Supported Currencies
 */
const CURRENCY = {
    INR: 'inr',
    USD: 'usd',
};

const CURRENCY_COUNTRY = {
    INDIA: 'India',
    USA: 'United States',
};

// ISO 3166-1 alpha-2 country codes
const COUNTRY_CODES = {
    INDIA: 'IN',
    USA: 'US',
};

//*******************Job Board Constants********************** */
/**
 *  Job Board Constants
 */

const JOB_BOARD_CONTENT_TYPES = Object.freeze({
    DESIGN: 'Design',
    COPYWRITING: 'Copywriting',
});

const JOB_BOARD_SPECIAL_JOBS = Object.freeze({
    TRENDING: 'trending',
    SUGGESTED: 'suggested',
});

const JOB_BOARD_EMPLOYMENT_TYPES = Object.freeze({
    PROJECT: 'project',
    FULL_TIME: 'full_time',
    PART_TIME: 'part_time',
    // INTERNSHIP: "internship",
    // FREELANCE: "freelance",
});

const JOB_BOARD_SENIORITY_LEVELS = Object.freeze({
    ENTRY_LEVEL: 'Entry Level',
    MID_SENIOR: 'Mid Senior',
    SENIOR: 'Senior',
});

const JOB_BOARD_RENUMERATION_UNITS = Object.freeze({
    PER_MONTH: 'per month',
    PER_WEEK: 'per week',
    PER_HOUR: 'per hour',
    PER_WORD: 'per word',
    TOTAL_COMPENSATION: 'total compensation',
});

const JOB_BOARD_DURATION_UNITS = Object.freeze({
    MONTH: 'month',
    WEEK: 'week',
});

const JOB_BOARD_UNITS = Object.freeze({
    PER_MONTH: 'per_month',
    PER_WEEK: 'per_week',
    PER_WORD: 'per_word',
});

const JOB_BOARD_APPLICATION_STATES = Object.freeze({
    PENDING: 'pending',
    SUGGESTED: 'suggested', // This state is to list applications from classified writers
    SHORTLISTED: 'shortlisted',
    HIRED: 'hired',
    REJECTED: 'rejected',
});

const JOB_BOARD_REPORT_TYPE = Object.freeze({
    PROFILE: 'profile',
    POST: 'post',
    MESSAGE: 'message',
});

const JOB_BOARD_OPPORTUNITY_STATES = Object.freeze({
    UNDER_REVIEW: 'under_review',
    ACTIVE: 'active',
    INACTIVE: 'inactive',
    BAN: 'ban',
    CLOSED: 'closed',
});

/*
 * Job Board Objection Reporting
 */
const JOB_BOARD_REPORT_STATES = Object.freeze({
    PENDING: 'pending',
    ACTED: 'acted',
});

/*
 * Job Board Report Action Status
 */
const JOB_BOARD_REPORT_ACTION_STATES = Object.freeze({
    REVIEW_PENDING: 'review_pending',
    REPORTEE_BAN: 'reportee_banned',
    REPORT_DISMISSED: 'report_dismissed',
    REPORTEE_CAUTIONED: 'reportee_cautioned',
});

// Companies to be listed as trending. List then in lowercase

const TRENDING = ['apple', 'google', 'amazon'];

//************Gamification************* */
/**
 * Gamification Related
 */

const ACCOUNT_C = {
    INVITE_MAX: 3,
};

const GAMIFICATION_GET_PERKS = {
    INVITATION: 100,
};

const GAMIFICATION_USE_PERKS = {
    GAURANTEED_PROJECT: 150,
    FAST_GROWTH: 300,
    BE_A_LEADER: 800,
};

const GAMIFICATION_ACTION_TYPE = {
    GAURANTEED_PROJECT: 'GAURANTEED_PROJECT',
    FAST_GROWTH: 'FAST_GROWTH',
    BE_A_LEADER: 'BE_A_LEADER',
};

const GAMIFICATION_PLAN_FILTERS = {
    NONE: 'NONE',
    PERK1: 'PERK1',
    PERK2: 'PERK2',
    PERK3: 'PERK3',
};

const GAMIFICATION_USER_ACTION_FILTERS = {
    SOCIAL: 'SOCIAL',
    SURVEY: 'SURVEY',
    MAILED: 'MAILED',
    VERIFIED: 'VERIFIED',
    NOT_VERIFIED: 'NOT_VERIFIED',
};

const GAMIFICATION_TIMELINE_FILTERS = {
    ACTIVE: 'ACTIVE',
    INACTIVE: 'INACTIVE',
};

const GAMIFICATION_USER_ACTIVITIES = {
    ADD_TO_WAITLIST: 'ADD_TO_WAITLIST',
    REGISTER: 'REGISTER',
    VERIFY: 'VERIFY',
    INVITE: 'INVITE',
    CLAIM_PERK1: 'CLAIM_PERK1',
    CLAIM_PERK2: 'CLAIM_PERK2',
    CLAIM_PERK3: 'CLAIM_PERK3',
    // EMAILS
    SEND_VERIFICATION_MAIL: 'SEND_VERIFICATION_MAIL',
    SEND_INVITATION_MAIL: 'SEND_INVITATION_MAIL',
    SEND_SCHEDULE_VERIFICATION_MAIL_42: 'SEND_SCHEDULE_VERIFICATION_MAIL_42',
    SEND_SCHEDULE_VERIFICATION_MAIL_72: 'SEND_SCHEDULE_VERIFICATION_MAIL_72',
    SEND_SCHEDULE_PERK_1_MAIL_42: 'SEND_SCHEDULE_PERK_1_MAIL_42',
    SEND_SCHEDULE_PERK_1_MAIL_72: 'SEND_SCHEDULE_PERK_1_MAIL_72',
    SEND_SCHEDULE_PERK_2_MAIL_42: 'SEND_SCHEDULE_PERK_2_MAIL_42',
    SEND_SCHEDULE_PERK_2_MAIL_72: 'SEND_SCHEDULE_PERK_2_MAIL_72',
    SEND_SCHEDULE_PERK_2_MAIL_WEEK: 'SEND_SCHEDULE_PERK_2_MAIL_WEEK',
    SEND_SCHEDULE_PERK_3_MAIL_42: 'SEND_SCHEDULE_PERK_3_MAIL_42',
    SEND_SCHEDULE_PERK_3_MAIL_72: 'SEND_SCHEDULE_PERK_3_MAIL_72',
    SEND_SCHEDULE_PERK_3_MAIL_WEEK: 'SEND_SCHEDULE_PERK_3_MAIL_WEEK',
};

const GAMIFICATION_ACTIVTY_TRIGGER_BY = {
    USER: 'USER',
    SYSTEM: 'SYSTEM',
};

const GAMIFICATION_CLIENT_ACTIVITIES = {
    ADD_TO_WAITLIST: 'ADD_TO_WAITLIST',
    REGISTER: 'REGISTER',
    VERIFY: 'VERIFY',
    INVITE: 'INVITE',
    SEND_REGISTER_REMINDER_MAIL: 'SEND_REGISTER_REMINDER_MAIL',
    SEND_VERIFICATION_MAIL: 'SEND_VERIFICATION_MAIL',
    SEND_VERIFICATION_REMINDER_MAIL: 'SEND_VERIFICATION_REMINDER_MAIL',
    SEND_INVITATION_MAIL: 'SEND_INVITATION_MAIL',
    SEND_SOCIAL_REMINDER_MAIL: 'SEND_SOCIAL_REMINDER_MAIL',
};

const TESTIMONIAL_TYPE = {
    LOGO: 'LOGO',
    TEXT: 'TEXT',
};

module.exports = Object.freeze({
    emailRegex,
    JWT_COOKIE_NAMES,
    JWTCOOKIE_EXPIRY,
    REFRESH_JWTCOOKIE_EXPIRY,
    SIGNIN_REFRESH_TOKEN_EXPIRESIN,
    DEFAULT_TOKEN_EXPIRESIN,
    SIGNIN_TOKEN_EXPIRESIN,
    TESTIMONIAL_TOKEN_EXPIRESIN,
    STRIPE_TOKEN,
    GA_USER_TOKEN,
    JOB_BOARD_CONTENT_TYPES,
    STRIPE_CONNECTION_STATUS,
    RZPY_CONNECTION_STATUS,
    CF_CONNECTION_STATUS,
    ROLES,
    ACCOUNT_SIGNUP_MODE,
    LISTNAMES,
    INVOICE_UNIT_TYPES,
    LIST_CARD_STATUS,
    MODELS,
    CREATOR_TYPES,
    CONVERSATION_CLIENT_U2,
    CONVERSATION_STATUS,
    CLIENT_PROFILE_STATUS,
    CONVERSATION_TYPE,
    CONVERSATION_CREATOR_STATE,
    CONVERSATION_PM_STATE,
    CONVERSATION_EXT_STATE,
    CONVERSATION_CLASSIFIED_STATES,
    PORTFOLIO_IMAGE_VERSIONS,
    FORM_TYPES,
    CURRENCY,
    CLIENT_ROLE,
    LONG_FORM_STATES,
    MAX_BOOKMARKS,
    MAX_PUBLIC,
    REQMESSAGE,
    DESIGN_MAX_CARDS,
    SHORT_FORM_TITLE,
    SHORT_FORM_DESCRIPTION,
    DESCRIPTION,
    TITLE,
    CREATOR_LEVEL,
    CREATOR_BUDGET_LIMITS,
    TESTIMONIAL_TYPE,
    MAX_BRAND_LOGOS,
    SHORT_FORM_CARD,
    CARD_TYPES,
    MAX_IN_IMAGE_BLOCK,
    PROJECT_BLOCK_STATES,
    LEVELS,
    PORTFOLIO_THEMES,
    PORTFOLIO_LAYOUT,
    CREATOR_ANALYTICS_DATA_POINTS,
    PAGE_STATES,
    PAGE_PROFILE_LAYOUT,
    PAGE_BLOCK_HIGHLIGHT,
    NOTIFICATION_STATES,
    ACCOUNT_STATUS,
    SOCIAL_SHARE_OPTIONS,
    MAX_CREATOR_EXPERIENCES,
    NOTIFICATION_TYPES,
    GENDER,
    CURRENCY_COUNTRY,
    NOTIF_USECASES,
    INDUSTRY_STATUS,
    CLIENT_POSTING_JOB_AS_TYPES,
    JOB_BOARD_SPECIAL_JOBS,
    JOB_BOARD_EMPLOYMENT_TYPES,
    JOB_BOARD_SENIORITY_LEVELS,
    JOB_BOARD_UNITS,
    JOB_BOARD_RENUMERATION_UNITS,
    JOB_BOARD_DURATION_UNITS,
    JOB_BOARD_APPLICATION_STATES,
    JOB_BOARD_OPPORTUNITY_STATES,
    JOB_BOARD_REPORT_TYPE,
    JOB_BOARD_REPORT_STATES,
    JOB_BOARD_REPORT_ACTION_STATES,
    ACCOUNT_C,
    GAMIFICATION_GET_PERKS,
    GAMIFICATION_USE_PERKS,
    GAMIFICATION_ACTION_TYPE,
    GAMIFICATION_PLAN_FILTERS,
    GAMIFICATION_USER_ACTION_FILTERS,
    GAMIFICATION_TIMELINE_FILTERS,
    GAMIFICATION_USER_ACTIVITIES,
    GAMIFICATION_CLIENT_ACTIVITIES,
    GAMIFICATION_ACTIVTY_TRIGGER_BY,
    INDUSTRIES,
    TRENDING,
    INVOICE_STATES,
    INVOICE_MODE,
    PAYMENT_GATEWAY,
    COUNTRY_CODES,
    GROUP_USER_OFF_PLATFORM_TYPE,
    EXT_REQUEST_STATES,
    EXT_PAY_STATES,
    EXT_PAY_TRANSFER_STATES,
    PROPOSAL_STATES,
    STUDIO_INVITE_STATES,
    STUDIO_REQUEST_STATES,
    FILE_MESSAGE_TYPES,
    CONVERSATION_STATE,
    CONVERSATION_LOCAL_STATE,
    PROPOSAL_PAYOUT_CONDITION,
    PROJECT_TYPES,
    BRIEF_STATES,
    TONES,
    SERVICE_BLOCK_FEES_TYPE,
    SERVICE_BLOCK_ASK_MORE,
    SERVICE_BLOCK_RATE_UNIT,
    CREATOR_ONBOARDING_STATES,
    V3_CREATOR_ONBOARDING_STATES,
    CLIENT_COLLECT_PREV_INVITE_LIMIT,
    EXCLUDE_USERNAMES,
    PAGE_BREAK_HEIGHT,
    PAGE_BREAK_TYPES,
    PAGE_BREAK_TEXT_ALIGN,
    PAGE_BREAK_TEXT_SIZE,
    PAGE_BREAK_TEXT_FONT,
    PAGE_BREAK_TEXT_STYLE,
    // PM
    STUDIO_MEMBERS_ALLOWED,
    STUDIO_MEMBER_BADGES,
    STUDIO_MEMBER_EMPLOYMENTS,
    PROFILE_SETUP_EXPERIENCE,
    PROFILE_SETUP_CATEGORY,
    PROFILE_SETUP_DEVOTE_TIME,
    PROFILE_SETUP_MINPAY_UNIT,
    COLLAB_TYPE,
    COLLAB_REQUEST_TYPE,
    COLLAB_REQUEST_STATES,
    COLLAB_IMPORT_STATES,
    GROUP_CONVERSATION_TYPES,
});

/*
  main entry file
  entry file for serving the express app
*/
/*
 * Module dependencies
 */
const express = require('express');
const fs = require('fs');
const https = require('https');
// const session = require('express-session');
const { GracefulShutdownManager } = require('@moebius/http-graceful-shutdown');
const cookieParser = require('cookie-parser');
const passport = require('passport');
const chalk = require('chalk');
const cors = require('cors');
// const repsonseTime = require('response-time');
const env = require('./config/env');
const winston = require('./config/winston');

const { ROLES } = require('./lib/constants');
const C = require('./lib/constants');
const logger = require('./lib/logger');

// Router Middlewares
const {
    passportAuthenticate,
    roleAuth,
    banGaurd,
    newUserGuard,
} = require('./middlewares/authorization');
const { morgan } = require('./middlewares/morgan');
const errorHandler = require('./middlewares/errorHandler');
// const airbrakeErrorHandler = require('./middlewares/airbrake-error-handler');
const responseHandler = require('./middlewares/responseHandler');
const notfoundHandler = require('./middlewares/notfound-handler');

const { checkIfExists } = require('./controllers/helpers/writerHelper');

/*
 * roles availble for role auth
 */

/*
 * load in passport config
 */
require('./config/passport');

/*
 * Middlewares for user routes
 */
const middlewares = (roles) => [
    /**
     * * Authenticate the token. This also sets user.lac = Date.now()
     */
    passportAuthenticate(passport),
    /**
     * * Check if authenticated user is authorized to access the route
     */
    roleAuth(roles),
    /**
     * * Account is new and user details are missing
     */
    newUserGuard([C.ACCOUNT_STATUS.NEW]),
    /**
     * * Inactive, Banned users are not allowed to access the route
     */
    banGaurd([C.ACCOUNT_STATUS.BAN, C.ACCOUNT_STATUS.INACTIVE]),
];

/*
 * Routers
 */
const userRouter = require('./routes/user');
const adminRouter = require('./routes/admin');
const writerRouter = require('./routes/writer');
const onboardRouter = require('./routes/onboard');
const pmRouter = require('./routes/pm');
const clientRouter = require('./routes/client');
const generalRouter = require('./routes/general');
const internalRouter = require('./routes/internal');
const commonRouter = require('./routes/common');
const chatRouter = require('./routes/chat');
const paymentsRouter = require('./routes/payments');
const systemRouter = require('./routes/system');
const gamificationRouter = require('./routes/gamification');
const clientGamificationRouter = require('./routes/clientGamification');
const gamificationAdminRouter = require('./routes/gamificationAdmin');
const webhookRouter = require('./routes/webhook');
const googleAuthRouter = require('./routes/googleAuth');
const fileStoreRouter = require('./routes/fileStore');
const creatorRouter = require('./routes/creator');
const marketingRouter = require('./routes/marketing');

const opts = {};

/*
 * Create Express server
 */
const app = express();
/*
 * Express configuration
 */

/**
 * CORS Configuration
 */
let allowedOrigins = [];
if (env.NODE_ENV == 'stage' || env.NODE_ENV == 'dev') {
    allowedOrigins = [
        'http://localhost:3000',
        'https://localhost:3000',
        'http://35.170.194.170',
        'http://3.109.252.163',
        'http://dev.passionbits.io',
        'http://127.0.0.1:4242',
    ];
} else if (env.NODE_ENV == 'prod') {
    allowedOrigins = [
        'https://www.passionbits.io',
        'https://passionbits.io',
        'https://admin2.passionbits.io',
        'https://admin.passionbits.io',
    ];
}
/*
 * CORS Options
 */
let corsOptions = {
    // https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Origin
    origin: async function (origin, callback) {
        // Because on staging all requests are same site and so the Origin header is not sent
        // ?? Sometime in prod as well origin is undefined, figure out why. For ex - some analytics APIs
        if (typeof origin !== 'string') {
            callback(null, true);
        } else if (allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else if (
            (env.NODE_ENV == 'stage' || env.NODE_ENV == 'dev') &&
            origin.includes('192.168.0')
        ) {
            callback(null, true);
        } else {
            // TODO: Find better way to do this
            if (typeof origin == 'string' && origin.includes('//')) {
                const domainPart = origin.split('//')[1];
                const check = await checkIfExists({ domain: domainPart });
                if (check) callback(null, true);
                else callback(new Error('Not allowed by CORS'));
            } else callback(new Error('Not allowed by CORS'));
        }
    },
    methods: ['PUT', 'GET', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
        'Origin',
        'X-Requested-With',
        'Content-Type',
        'Accept',
        'Authorization',
        'Access-Control-Allow-Credentials',
    ],
    credentials: true,
    // Configures the Access-Control-Max-Age CORS header
    maxAge: 43200,
};

// Preflight
app.options('*', cors(corsOptions));

// All requests
app.use(cors(corsOptions));

/**
 * Set env variables
 */
app.set('host', env.HOST);
app.set('port', env.PORT);
app.set('env', env.NODE_ENV);

// Express-Session Middleware
/* app.use(
    session({
        secret: 'keyboard cat dogs',
        resave: false,
        saveUninitialized: true,
    }),
); */
// app.use(expressStatusMonitor());
app.use(morgan('custom', { stream: winston.stream }));
app.use(cookieParser());
// Capture raw data for stripe webhooks
app.use(
    express.json({
        // We need the raw body to verify webhook signatures.
        // Let's compute it only when hitting the Stripe webhook endpoint.
        verify: function (req, res, buf) {
            if (req.originalUrl.startsWith('/webhook')) {
                req.rawBody = buf.toString();
            }
        },
    }),
);
// Json parser
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
// app.use(expressValidator());
app.use(passport.initialize());
// response time middleware
// app.use(repsonseTime());
// add res.respond function
app.use(responseHandler);

/*
 * Primariy app routes
 */

// app.use('/notification', middlewares, notificationRouter);
/*
 * Internal routes
 */
app.use('/internal', internalRouter);
/*
 * System routes
 */
app.use('/system', systemRouter);
/*
 * General User routes
 */
// app.use('/', userRouter);
app.use(userRouter);

// Google Authentication routes
app.use('/authentication', googleAuthRouter);

/**
 * Authenticated Routes
 */
/*
 * Writer routes
 */
app.use('/writer', middlewares(ROLES.WRITER_C), writerRouter);

// Manish added new route
/**
 * Authenticated Routes
 */
/*
 * Writer routes
 */
app.use('/onboarding', middlewares([ROLES.WRITER_C, ROLES.EXT_CLIENT]), onboardRouter);



/*
 * Client routes
 */
app.use('/client', middlewares(ROLES.CLIENT_C), clientRouter);

/**
 * Pm routes
 */
app.use('/pm', middlewares(ROLES.PM_C), pmRouter);

/**
 * Creator routes
 * Routes common to both PM and Creator
 */
app.use('/creator', middlewares([ROLES.WRITER_C, ROLES.PM_C]), creatorRouter);

/**
 * Chat routes
 */
app.use(
    '/chat',
    middlewares([
        ROLES.CLIENT_C,
        ROLES.WRITER_C,
        ROLES.PM_C,
        ROLES.GU_C,
        ROLES.EXT_CLIENT,
    ]),
    chatRouter,
);
// Payment routes
app.use(
    '/payments',
    middlewares([ROLES.CLIENT_C, ROLES.WRITER_C, ROLES.PM_C]),
    paymentsRouter,
);
/*
 * Admin routes
 */
app.use('/sa', middlewares(ROLES.SA_C), adminRouter);

/**
 * Common Routes
 * Authenticated routes but authentication happens inside the router
 */
app.use('/common', commonRouter);

/**
 * Stripe webhook route
 */
app.use('/webhook', webhookRouter);

/**
 * File Upload Service routes
 */

app.use(
    '/file-store',
    middlewares([ROLES.CLIENT_C, ROLES.WRITER_C, ROLES.PM_C, ROLES.GU_C]),
    fileStoreRouter,
);

/**
 * Marketing Routes
 */

app.use('/marketing', marketingRouter);

/*
 * Gamification Routes
 */
// ! To be deprecated soon
// Gamification Admin
app.use('/gamification/admin', gamificationAdminRouter);

// Gamification Client
app.use('/gamification/client', clientGamificationRouter);

// Gamification Creator
app.use('/gamification', gamificationRouter);

/*
 * General routes
 */
app.use('/', generalRouter);

// NotFound Handler
app.use(notfoundHandler);

/*
 * Error Handler Middleware define as the last one
 */
// air brake error handler
// if (process.env.NODE_ENV === 'stage' || process.env.NODE_ENV === 'prod') {
//   app.use(airbrakeErrorHandler);
// }
app.use(errorHandler);

/*
 * Starts Express Server
 */
function listen() {
    let server;
    if (process.env.HTTPS) {
        var key = fs.readFileSync('./certs/key.pem');
        var cert = fs.readFileSync('./certs/cert.pem');
        var options = {
            key: key,
            cert: cert,
        };
        const httpsServer = https.createServer(options, app);
        server = httpsServer.listen(app.get('port'), () => {
            console.log(
                '%s App is running at https://localhost:%d in %s mode',
                chalk.green('✓'),
                app.get('port'),
                app.get('env'),
            );
            console.log('  Press CTRL-C to stop\n');
        });
    } else {
        server = app.listen(app.get('port'), () => {
            console.log(
                '%s App is running at http://localhost:%d in %s mode',
                chalk.green('✓'),
                app.get('port'),
                app.get('env'),
            );
            console.log('  Press CTRL-C to stop\n');
        });
    }
    // SOCKET
    /*    
    let io = socket.init(server);
    socket.io = io;
    */
    const shutdownManager = new GracefulShutdownManager(server);
    process.on('SIGTERM', () => {
        shutdownManager.terminate(() => {
            logger.info('Server is gracefully terminated');
        });
    });
}

module.exports = { app, listen };

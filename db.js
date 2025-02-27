const mongoose = require('mongoose');
const chalk = require('chalk');
const env = require('./config/env');
const logger = require('./lib/logger');
/*
 * load in the mongo models
 */
require('./models/users');
require('./models/job-board');
require('./models/application');
require('./models/organisation');
require('./models/industry');
require('./models/notification');
require('./models/report');
require('./models/project');
require('./models/cards');
require('./models/long_form');
require('./models/chat');
require('./models/transaction');
require('./models/listcard');
require('./models/fileUpload');
require('./models/pdf');
require('./models/template/form');
require('./models/template/template');
require('./models/template/proposal');
require('./models/block');
require('./models/texteditor');
require('./models/page');
require('./models/invoice');
require('./models/marketing');
require('./models/collab');
require('./models/analytics');
require('./models/theme');
module.exports = mongoose;
/*
 * Connects to MongoDB
 */

function connect() {
    let poolSize = 1;
    if (process.env.NODE_ENV === 'stage' || process.env.NODE_ENV === 'prod') {
        // A connection pool helps reduce application latency and the number of times new connections are created.
        poolSize = 20;
    }
    const opts = {
        useFindAndModify: false,
        useCreateIndex: true,
        useNewUrlParser: true,
        useUnifiedTopology: true,
        minPoolSize: poolSize,
    };

    mongoose.connect(env.MONGODB_URI, opts);
}

connect();
// const { connection } = mongoose;
mongoose.connection
    .on('error', (err) => {
        logger.info(err);
        logger.info(
            '%s MongoDB connection error. Please make sure MongoDB is running.',
            chalk.red('✗'),
        );
        process.exit();
    })
    .on('disconnected', connect);

/*
  main entry file
  entry file for serving the express app
*/
/*
 * Module dependencies
 */
const path = require('path');
const logger = require('./lib/logger');

/*
 * load the environment variables from .env file
 */
require('dotenv').config({ path: path.join(__dirname, '.env') });

const chalk = require('chalk');
const { MODELS } = require('./lib/constants');
const env = require('./config/env');

/*
 * newRelic require
 * APM tool
 */

if (env.NODE_ENV == 'stage' || env.NODE_ENV == 'prod') {
    console.log(chalk.green('newrelic is started'));
    require('newrelic');
}
const mongoose = require('./db');
const redisService = require('./services/redis/redisService');

//* prints out registerd mongoose models
if (process.env.APP_ENV !== 'test')
    console.log(
        chalk.green('loaded models: '),
        chalk.blue(...mongoose.modelNames()),
    );

const { app, listen } = require('./app');

const agenda = require('./services/agenda');
/*
 * Connect to MongoDB then start the app
 */
mongoose.connection.once('open', async () => {
    // start express
    listen();

    // connect to redis
    redisService.client
        .connect()
        .then(() => {
            console.log(
                `%s Connection to Redis established.`,
                chalk.green('✓'),
            );
        })
        .catch((err) => {
            logger.error(err);
        });

    // start agenda
    agenda
        .database(env.MONGODB_URI, MODELS.CRON_JOBS_C, {
            useNewUrlParser: true,
            // useUnifiedTopology: true,
        })
        .once('ready', agenda.start);
});

module.exports = app;

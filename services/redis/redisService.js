// Module dependencies
const redis = require('redis');
const chalk = require('chalk');
const util = require('util');
const logger = require('../../lib/logger');
const { promisify } = util;

/**
 * Redis Wrapper Class
 */

class RedisService {
    isConnected = false;
    client;
    // Constructor
    // Connect and create redis client
    constructor() {
        this.client = redis.createClient({
            socket: {
                reconnectStrategy: function (retries) {
                    if (retries > 2) {
                        // End reconnecting with built in error after s reconnection attempts
                        const err = new Error('Redis connection failed');
                        return err;
                    } else {
                        return 5000;
                    }
                },
            },
        });
        this.client.get = this.client.get.bind(this.client);
        this.client.set = this.client.set.bind(this.client);
        this.client.zAdd = this.client.zAdd.bind(this.client);
        this.client.zCard = this.client.zCard.bind(this.client);

        this.attachEventHandlers();
    }
    // Redis Connection state event handlers
    attachEventHandlers() {
        // Connection state events
        this.client.on('error', (error) => {
            this.isConnected = false;
            logger.error(error);
        });
        this.client.on('end', () => {});
        this.client.on('reconnecting', () => {});
        this.client.on('ready', () => {
            this.isConnected = true;
        });
    }
    // wrapper for get method
    async get(key) {
        if (!this.isConnected) {
            return undefined;
        }
        const value = await this.client.get(key);
        return value;
    }
    // wrapper for set method
    async set(key, value) {
        if (!this.isConnected) {
            return;
        }
        await this.client.set(key, value);
    }

    async zAdd(setName, values) {
        if (!this.isConnected) {
            return;
        }
        await this.client.zAdd(setName, values);
    }

    async zCard(setName) {
        if (!this.isConnected) {
            return undefined;
        }
        const value = await this.client.zCard(setName);
        return value;
    }
}

const redisService = new RedisService();

module.exports = redisService;

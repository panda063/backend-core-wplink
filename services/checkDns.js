const axios = require('axios');
const dns = require('dns');
const env = require('../config/env');

async function lookupPromise(domain) {
    return new Promise((resolve, reject) => {
        dns.lookup(domain, (err, address, family) => {
            if (err) reject(err);
            resolve(address);
        });
    });
}

exports.checkDns = async ({ domain }) => {
    try {
        const address = await lookupPromise(domain);
        if (address && address === env.SERVER_IP) {
            return true;
        }
        return false;
    } catch (err) {
        return false;
    }
};

exports.checkHTTPS = async ({ domain }) => {
    try {
        const response = await axios.head(`https://${domain}`);
        return true;
    } catch (err) {
        return false;
    }
};

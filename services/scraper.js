/*
 * Module Dependencies
 */
const got = require('got');
const metascraper = require('metascraper')([
    require('metascraper-description')(),
    require('metascraper-image')(),
    require('metascraper-title')(),
    require('metascraper-url')(),
    require('metascraper-publisher')(),
    require('metascraper-logo-favicon')(),
]);

exports.scrapeArticle = async ({ targetUrl }) => {
    const { body: html, url } = await got(targetUrl);
    const metadata = await metascraper({ html, url });
    if (metadata.image) {
        // only allow http or https protocols
        if (
            !(
                metadata.image.startsWith('http://') ||
                metadata.image.startsWith('https://')
            )
        ) {
            metadata.image = '';
        }
    }
    return metadata;
};

exports.scrapeArticles = async ({ urls }) => {
    const metadatas = [];
    const reducer = async (promise, url) => {
        await promise;
        // ignore errors or empty returns
        try {
            const metadata = await exports.scrapeArticle({ targetUrl: url });
            if (!metadata) {
                return Promise.resolve();
            }
            metadatas.push({ url, ...metadata });
        } catch (err) {
            return Promise.resolve();
        }
    };
    await urls.reduce(reducer, Promise.resolve());
    return metadatas;
};

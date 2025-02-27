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
const debug = require('debug')('import-article');
debug.enabled = true;
const jsdom = require('jsdom');
const { JSDOM } = jsdom;

/**
 * Html tags for fallback
 * These HTML tags are selected if <article> tag is not present
 */
const h = 'h1, h2, h3, h4, h5, h6'; // tags must be separated by ', '
const formatted = 'blockquote, pre';
const img = 'img, figure';
const p = 'p';
let allTagsArray = [h, formatted, img, p]; // After creating new string add it here

/**
 * <article> tag
 */
let article = 'article';
// These tags should be removed from inside the <article> tag
let tagsToRemove = ['button', 'script', 'style', 'meta'];

// Recursively Remove class and id attributes
function removeAttributes(node) {
    // do some thing with the node here
    try {
        node.removeAttribute('class');
        node.removeAttribute('id');
        node.removeAttribute('style');
        node.removeAttribute('srcset');
        node.removeAttribute('sizes');
    } catch (err) {
        return;
    }
    // node.removeAttribute('style');
    if (node.childNodes.length <= 0) {
        return;
    }

    for (let i = 0; i < node.childNodes.length; i++) {
        if (!node.childNodes[i]) {
            continue;
        }
        removeAttributes(node.childNodes[i]);
    }
}

const scrapeArticle = async ({ targetUrl }) => {
    const { body: html, url } = await got(targetUrl);
    const metadata = await metascraper({ html, url });
    const dom = new JSDOM(html);
    const document = dom.window.document;
    const content = [];

    allTagsString = allTagsArray.join(', ');
    // * Find <article> in DOM
    debug('Trying <article> tag...');
    const pEl = document.querySelectorAll(article).forEach((ele) => {
        // Remove the unwanted tags from inside the <article> tag
        for (let tag of tagsToRemove) {
            ele.querySelectorAll(tag).forEach(function (item) {
                item.parentNode.removeChild(item);
            });
        }
        // Remove Images with data uris attribute and fix relative src paths
        ele.querySelectorAll('img').forEach(function (item) {
            if (item.hasAttribute('src')) {
                let value = item.getAttribute('src');
                if (value.indexOf('data:image') !== -1) {
                    item.parentNode.removeChild(item);
                }
                if (
                    value.indexOf('http') == -1 &&
                    value.indexOf('https') == -1
                ) {
                    let arr = targetUrl.split('/');
                    let fullpath = arr[0] + '//' + arr[2] + value;
                    item.setAttribute('src', fullpath);
                }
            }
        });
        // Remove attributes of each element
        removeAttributes(ele);
        content.push(ele.outerHTML);
    });
    // * If article tag is not found. Manually select necessary tags
    if (content.length == 0) {
        debug('<article> not found. Manually importing necessary tags...');
        // Falling back to manual selection of tags
        debug(allTagsString);
        let nodeWithMaxChildren = '';
        let maxChildren = -1;
        /** OPTION - 1
        // Get div whose direct ancestor is body
        // Among those divs we select the one with maximum number of children
        document.querySelectorAll('body > div').forEach((item) => {
            if (item.childNodes.length > maxChildren) {
                nodeWithMaxChildren = item;
                maxChildren = item.childNodes.length;
            }
        });
        */
        /* OPTION - 2
        document.querySelectorAll('div').forEach((item) => {
            if (item.innerHTML.length > maxChildren) {
                nodeWithMaxChildren = item;
                maxChildren = item.innerHTML.length;
            }
        });
        */
        document.querySelectorAll('div').forEach((item) => {
            let tot = 0;
            item.querySelectorAll('p').forEach((item2) => {
                tot += item2.innerHTML.length;
            });
            if (tot > maxChildren) {
                nodeWithMaxChildren = item;
                maxChildren = tot;
            }
        });
        if (nodeWithMaxChildren) {
            // Remove attributes of each element
            nodeWithMaxChildren
                .querySelectorAll(allTagsString)
                .forEach((item) => {
                    // Remove Images with data uris attribute and fix relative src paths
                    if (
                        item.tagName.toLowerCase() == 'img' &&
                        item.hasAttribute('src')
                    ) {
                        let value = item.getAttribute('src');
                        if (value.indexOf('data:image') !== -1) {
                            item.parentNode.removeChild(item);
                        }
                        if (
                            value.indexOf('http') == -1 &&
                            value.indexOf('https') == -1
                        ) {
                            let arr = targetUrl.split('/');
                            let fullpath = arr[0] + '//' + arr[2] + value;
                            item.setAttribute('src', fullpath);
                        }
                    }
                    removeAttributes(item);
                    content.push(item.outerHTML);
                });
        }
    }

    if (metadata.image && metadata.image.indexOf('data:image') !== -1)
        metadata.image = '';
    return { metadata, content };
};

module.exports = { scrapeArticle };

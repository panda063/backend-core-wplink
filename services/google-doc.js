// Nodejs reads a Google Doc if the service account is added as a viewer
// No manual OAUTH2 approval steps required. Just use the google share settings to share
// Use the client_email address found in the crendentials file as the
const fs = require('fs');
const { JWT, auth } = require('google-auth-library');
const { google } = require('googleapis');
const { serviceAccountKey } = require('../config/google-service-account');

const SCOPES = [
    // Other options at https://developers.google.com/identity/protocols/oauth2/scopes#docsv1
    'https://www.googleapis.com/auth/documents.readonly',
];

async function start(docId) {
    const credentials = serviceAccountKey;
    const client = auth.fromJSON(credentials);
    client.scopes = SCOPES;

    const result = await run(client, docId);
    return result;
}

async function run(auth, docId) {
    // https://developers.google.com/docs/api/reference/rest
    // console.log(auth);
    const docs = google.docs({
        version: 'v1',
        auth,
    });
    const doc = await docs.documents.get({
        documentId: `${docId}`,
    });
    // console.log(Object.keys(doc.data.body.content));
    const doc_content = doc.data.body.content;
    // console.log(`${JSON.stringify(doc.data.title)}`);
    const title = doc.data.title;
    const readAbleText = await getReadableText(doc_content);
    return { title, readAbleText };
}

async function getReadableText(elements) {
    let text = '';
    for (let value of elements) {
        if (value.paragraph) {
            const pElements = value.paragraph.elements;
            for (let pEl of pElements) {
                text += await readParagraph(pEl);
            }
        } else if (value.table) {
            let table = value.table;
            let tableRows = table.tableRows;
            for (let row of tableRows) {
                let cells = row.tableCells;
                for (let cell of cells) {
                    text += getReadableText(cell.content);
                }
            }
        } else if (value.tableOfContents) {
            let toc = value.tableOfContents;
            text += getReadableText(toc);
        }
    }
    return text;
    // console.log(text);
}

async function readParagraph(element) {
    // console.log(element);
    textRun = element.textRun;
    if (textRun) {
        return textRun.content;
    }
    return '';
}

const getDataFromPublicDoc = async ({ docId }) => {
    const { title, readAbleText } = await start(docId);
    return {
        metadata: { title },
        content: [readAbleText],
    };
};

module.exports = { getDataFromPublicDoc };

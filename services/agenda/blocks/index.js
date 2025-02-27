const mongoose = require('mongoose');
const _ = require('lodash');

// Config
const C = require('../../../lib/constants');
const env = require('../../../config/env');

// Models
const Block = mongoose.model(C.MODELS.BLOCK);
const Page = mongoose.model(C.MODELS.PAGE);

// Services
const {
    cleanId,
    generatePublicUrl,
    updateFileV3,
} = require('../../../controllers/helpers/writerHelper');

const { getObject } = require('../../../utils/s3-operations');

const { copyFiles } = require('../../../controllers/fileStore');

exports.copyPageBlocks = async ({ pageId, newPageId, userId }) => {
    // First check if new page exists for this creator and is in copying state
    const page = await Page.findOne({
        _id: newPageId,
        uid: userId,
    })
        .select('_id pst')
        .exec();
    if (!page) {
        throw new Error('Page not found');
    }
    if (page.pst == C.PAGE_STATES.CREATED) {
        throw new Error(
            'Page already in copied state. Why are we running this again?',
        );
    }

    // * 2. Copy all blocks
    // Fetch all blocks of this page
    const blocksAsObjects = await Block.find(
        {
            uid: userId,
            pid: pageId,
            __t: {
                $ne: C.MODELS.IMPORTED_SERVICE,
            },
        },
        {},
        { lean: true },
    ).exec();

    cleanId(blocksAsObjects);
    const newBlocks = blocksAsObjects;
    /*   const oldPageImage = page.udet.img
        .replace(`${env.S3_BUCKET_WEBSITE_URL}/`, '')
        .replace(`-150x150.webp`, ''); */
    const keysToCopy = [];
    // if (oldPageImage.length > 0) keysToCopy.push(oldPageImage);
    for (let newBlock of newBlocks) {
        const newId = mongoose.Types.ObjectId().toHexString();
        newBlock._id = newId;
        newBlock.pid = newPageId;
        if (
            [
                C.MODELS.IMAGE_BLOCK,
                C.MODELS.LINK_BLOCK,
                C.MODELS.PDF_BLOCK,
                C.MODELS.PROJECT_BLOCK,
                C.MODELS.SERVICE_BLOCK,
            ].includes(newBlock.__t)
        ) {
            // For these block type generate new public URL
            newBlock.pul = await generatePublicUrl(newBlock.t, newId);
        }
        if (
            newBlock.ci &&
            (newBlock.__t == C.MODELS.IMAGE_BLOCK ||
                newBlock.__t == C.MODELS.PDF_BLOCK ||
                newBlock.__t == C.MODELS.PROJECT_BLOCK ||
                newBlock.__t == C.MODELS.LINK_BLOCK)
        ) {
            if (newBlock.ci.includes(env.S3_BUCKET_WEBSITE_URL)) {
                // If it include s3 url it was uploaded
                keysToCopy.push(
                    newBlock.ci
                        .replace(`${env.S3_BUCKET_WEBSITE_URL}/`, '')
                        .replace('-webp.webp', ''),
                );
            }
        }
        if (
            newBlock.imgs &&
            Array.isArray(newBlock.imgs) &&
            newBlock.imgs.length > 0
        ) {
            _.forEach(newBlock.imgs, (img) => {
                keysToCopy.push(
                    img.og.replace(`${env.S3_BUCKET_WEBSITE_URL}/`, ''),
                );
                if (img.tb) {
                    keysToCopy.push(
                        img.tb.replace(`${env.S3_BUCKET_WEBSITE_URL}/`, ''),
                    );
                }
            });
        }
        if (newBlock.__t == C.MODELS.PDF_BLOCK && newBlock.floc) {
            keysToCopy.push(
                newBlock.floc.replace(`${env.S3_BUCKET_WEBSITE_URL}/`, ''),
            );
        }
        if (newBlock.__t == C.MODELS.TESTIMONIAL_BLOCK) {
            for (let test of newBlock.tstm) {
                if (
                    test.t == C.TESTIMONIAL_TYPE.LOGO &&
                    test.img.includes(env.S3_BUCKET_WEBSITE_URL)
                ) {
                    // If it include s3 url it was uploaded
                    keysToCopy.push(
                        test.img.replace(`${env.S3_BUCKET_WEBSITE_URL}/`, ''),
                    );
                }
            }
        }

        //  Cover Image
        //  Handle Images in Image block
        //  Handle fileLocation in PDFBlock
        //  Handle fileUrl, images in Project Block
        //  Handle Image in Testimonial Block for type LOGO when it was uploaded
        // ??  Handle Image in ExperienceBlock when it was uploaded
    }
    const newKeys = await copyFiles({ keys: [...new Set(keysToCopy)] });
    for (let newBlock of newBlocks) {
        let old = '';
        let oldContent = '';
        if (newBlock.__t == C.MODELS.PROJECT_BLOCK) {
            if (newBlock.fu) {
                // console.log(newBlock.fu);
                oldContent = await getObject(
                    env.S3_BUCKET_USER_DATA,
                    newBlock.fu,
                );
            }
        }
        if (
            newBlock.ci &&
            (newBlock.__t == C.MODELS.IMAGE_BLOCK ||
                newBlock.__t == C.MODELS.PDF_BLOCK ||
                newBlock.__t == C.MODELS.PROJECT_BLOCK ||
                newBlock.__t == C.MODELS.LINK_BLOCK)
        ) {
            if (newBlock.ci.includes(env.S3_BUCKET_WEBSITE_URL)) {
                old = newBlock.ci
                    .replace(`${env.S3_BUCKET_WEBSITE_URL}/`, '')
                    .replace('-webp.webp', '');
                newBlock.ci = newKeys[old];
                if (
                    newBlock.__t == C.MODELS.PROJECT_BLOCK ||
                    newBlock.__t == C.MODELS.LINK_BLOCK
                ) {
                    newBlock.ci = `${env.S3_BUCKET_WEBSITE_URL}/${newKeys[old]}`;
                }
            }
        }

        if (
            newBlock.imgs &&
            Array.isArray(newBlock.imgs) &&
            newBlock.imgs.length > 0
        ) {
            for (let img of newBlock.imgs) {
                let fullOldImageUrl = img.og;

                old = img.og.replace(`${env.S3_BUCKET_WEBSITE_URL}/`, '');
                img.og = newKeys[old];
                img.iu = `${newKeys[old]}-webp.webp`;
                if (img.tb) {
                    old = img.tb.replace(`${env.S3_BUCKET_WEBSITE_URL}/`, '');
                    img.tb = newKeys[old];
                }
                // For project blocks
                // replace <img> src with new copied urls
                if (newBlock.__t == C.MODELS.PROJECT_BLOCK) {
                    if (newBlock.fu) {
                        // console.log(newBlock.fu);
                        let find = `${fullOldImageUrl}-webp.webp`;
                        var re = new RegExp(find, 'g');
                        oldContent = oldContent.replace(
                            re,
                            `${env.S3_BUCKET_WEBSITE_URL}/${img.iu}`,
                        );
                    }
                }
            }
        }
        if (newBlock.__t == C.MODELS.PDF_BLOCK && newBlock.floc) {
            old = newBlock.floc.replace(`${env.S3_BUCKET_WEBSITE_URL}/`, '');
            newBlock.floc = newKeys[old];
        }
        if (newBlock.__t == C.MODELS.TESTIMONIAL_BLOCK) {
            for (let test of newBlock.tstm) {
                if (
                    test.t == C.TESTIMONIAL_TYPE.LOGO &&
                    test.img.includes(env.S3_BUCKET_WEBSITE_URL)
                ) {
                    old = test.img.replace(`${env.S3_BUCKET_WEBSITE_URL}/`, '');
                    test.img = `${env.S3_BUCKET_WEBSITE_URL}/${newKeys[old]}`;
                }
            }
        }
        if (newBlock.__t == C.MODELS.PROJECT_BLOCK) {
            if (newBlock.fu) {
                const newUrl = await updateFileV3({
                    creatorId: userId,
                    projectId: newBlock._id,
                    content: oldContent,
                });
                newBlock.fu = newUrl;
            }
        }
    }
    await Block.create(newBlocks);

    // Upate page state
    page.pst = C.PAGE_STATES.CREATED;
    await page.save();
};

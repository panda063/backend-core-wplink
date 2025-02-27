// Routes for Client
const router = require('express').Router();
const { celebrate, Joi } = require('celebrate');
Joi.objectId = require('joi-objectid')(Joi);
const debug = require('debug')('client');
const { BadRequest } = require('../lib/errors');
const c = require('./helper');

const {
    portfolioImgUpload: portfolioImgUploadService,
} = require('../services/file-upload');

/**
 * Controllers
 */
const { uploadPortfolioImg } = require('../controllers/creator/portfolio');

/**
 * Routers
 */
const chatRouter = require('./client/chat');
const clientProfileRouter = require('./client/profile');
const clientJobBoardRouter = require('./client/job-board');
const clientFeedRouter = require('./client/feed');

// Upload user image
router.put(
    '/upload/image',
    portfolioImgUploadService.single('file'),
    c((req) => {
        const client = req.user;
        const { file } = req;
        return { user: client, file };
    }, uploadPortfolioImg),
);

// Client Profile related routes
router.use('/profile', clientProfileRouter);

// Client job board endpoints
router.use('/job-board', clientJobBoardRouter);

// Chat routes
router.use('/chat', chatRouter);

// Client feed routes
router.use(['/portfolio', '/feed'], clientFeedRouter);

module.exports = router;

/*
 * Module Dependencies
 */
const router = require("express").Router();
const c = require("./helper");
const { celebrate, Joi } = require("celebrate");
Joi.objectId = require("joi-objectid")(Joi);

const systemController = require("../controllers/system");

// ---------- JOB BOARD RELATED ENDPOINTS ----------

/**
 * @api {GET} /job-board
 * @apiName getActiveOpportunities
 * @apiGroup System
 */
router.get(
  "/job-board",
  c(() => {}, systemController.getActiveOpportunities)
);

/**
 * @api {GET} /job-board/:jobId
 * @apiName getOpportunityDetails
 * @apiGroup System
 */
router.get(
  "/job-board/:jobId",
  celebrate({
    params: Joi.object().keys({
      jobId: Joi.objectId().required(),
    }),
  }),
  c((req) => {
    const { jobId } = req.params;
    return { jobId };
  }, systemController.getOpportunityDetails)
);

module.exports = router;

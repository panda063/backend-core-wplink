const debug = require('debug')('agenda:projects');
debug.enabled = true;
const _ = require('lodash');
const C = require('../../../lib/constants');
const env = require('../../../config/env');
const mongoose = require('mongoose');

// Services
const feedService = require('../../feed');
const { notification } = require('../../../messaging/index');
// Models
const Project = mongoose.model(C.MODELS.PROJECT);
const PM = mongoose.model(C.MODELS.PM_C);

exports.generate_project_scores = async ({ agenda }) => {
    debug('Calculating Project Scores');
    await feedService.pushCalculateScoreEvent({
        type: 'calculate-project-scores',
    });
};

exports.new_content_studios = async ({ creator, projectId }) => {
    const studios = await PM.find({
        'mmb.uid': creator.id,
    })
        .select('n e')
        .exec();
    const project = await Project.findById(projectId).exec();
    let projectSubPath = '';
    if (project.projectType == C.PROJECT_TYPES.LONG_FORM) {
        projectSubPath = 'article';
    } else if (project.projectType == C.PROJECT_TYPES.SHORT_FORM) {
        projectSubPath = 'shorts';
    } else if (project.projectType == C.PROJECT_TYPES.DESIGN) {
        projectSubPath = 'design';
    }
    const sendEmailPromises = [];
    _.forEach(studios, (studio) => {
        sendEmailPromises.push(
            notification.send({
                usecase: 'pm_new_content',
                role: C.MODELS.PM_C,
                email: {
                    email: studio.e,
                    name: studio.name.first,
                    creatorName: creator.creatorName,
                    link: `${env.CREATOR_PORTFOLIO}/${projectSubPath}/${project.pul}`,
                },
            }),
        );
    });
    await Promise.all(sendEmailPromises);
};

/*
 * Module Dependencies
 */
const mongoose = require('mongoose');
const _ = require('lodash');
const C = require('../lib/constants');

const Notification = mongoose.model(C.MODELS.NOTIFICATION_C);

const { BadRequest } = require('../lib/errors');

exports.getUnseenCount = async ({ user }) => {
    let query = {
        'for.id': user.id,
        // 'for.role': user.__t,
        // st: { $in: [C.NOTIFICATION_STATES.UNSEEN, C.NOTIFICATION_STATES.SEEN] },
        st: C.NOTIFICATION_STATES.UNSEEN,
    };
    const count = await Notification.countDocuments(query).exec();
    return { count };
};

exports.getUnseenAndSeen = async ({ user }) => {
    let query = {
        'for.id': user.id,
        // 'for.role': user.__t,
        st: { $in: [C.NOTIFICATION_STATES.UNSEEN, C.NOTIFICATION_STATES.SEEN] },
    };
    const notifications = await Notification.find(query)
        .sort({ cat: 'desc' })
        .exec();
    return { notifications };
};

exports.setDeleteOne = async ({ user, id }) => {
    let query = { _id: id, 'for.id': user.id };
    const notif = await Notification.findOne(query).exec();
    if (!notif) {
        throw new BadRequest('No such notification!');
    }
    notif.state = C.NOTIFICATION_STATES.DELETED;
    notif.deletedAt = Date.now();
    await notif.save();
    return { msg: 'notification is deleted successfully!' };
};

exports.setDeleteMultiple = async ({ user, ids }) => {
    // TODO: validate id as objectID .match(/^[0-9a-fA-F]{24}$/)
    if (!ids) {
        throw new BadRequest('missing required data');
    }
    await Promise.all(
        _.map(ids, async (id) => {
            let query = {
                _id: id,
                'for.id': user.id,
                // 'for.role': user.__t,
                st: {
                    $in: [
                        C.NOTIFICATION_STATES.UNSEEN,
                        C.NOTIFICATION_STATES.SEEN,
                    ],
                },
            };
            const notif = await Notification.findOne(query).exec();
            if (!notif) {
                throw new BadRequest('No such notification!');
            }
            notif.state = C.NOTIFICATION_STATES.DELETED;
            notif.deletedAt = Date.now();
            await notif.save();
        }),
    );
    // // TODO: handle sending an array of data after updation
    // const query = { st: 'unseen' };
    // const notifications = await Notification.find(query);
    // return { notifications };
    return { msg: 'multiple notifications are deleted successfully!' };
};

exports.setSeen = async ({ user, ids }) => {
    // TODO: validate id as objectID .match(/^[0-9a-fA-F]{24}$/)
    if (!ids) {
        throw new BadRequest('missing required data');
    }
    await Promise.all(
        _.map(ids, async (id) => {
            let query = {
                _id: id,
                st: {
                    $in: [
                        C.NOTIFICATION_STATES.UNSEEN,
                        C.NOTIFICATION_STATES.SEEN,
                    ],
                },
                // 'for.role': user.__t,
            };
            const notif = await Notification.findOne(query).exec();
            if (!notif) {
                throw new BadRequest('No such notification!');
            }
            notif.state = C.NOTIFICATION_STATES.SEEN;
            notif.seenAt = Date.now();
            return notif.save();
        }),
    );
    // // TODO: handle sending an array of data after updation
    // const query = { st: 'unseen' };
    // const notifications = await Notification.find(query);
    // return { notifications };
    return { msg: 'multiple notifications are set to seen successfully!' };
};

exports.createSignupNotifications = async ({ user }) => {
    if (user.__t == C.MODELS.WRITER_C || user.__t == C.MODELS.PM_C) {
        let data = [
            /*   {
                for: { id: user.id, role: user.__t },
                st: C.NOTIFICATION_STATES.UNSEEN,
                cat: Date.now(),
                des: 'You can quickly add short form copy using Slides',
                uc: 'creator_info',
                axns: {
                    n: 'visit_slides',
                    d: {},
                },
                imgURL: '',
            }, */
            {
                for: { id: user.id, role: user.__t },
                st: C.NOTIFICATION_STATES.UNSEEN,
                cat: Date.now(),
                des: 'Welcome to passionbits! Quickly build your profile to showcase your work to the top B2B brands',
                uc: 'creator_info',
                axns: {
                    n: 'visit_profile',
                    d: {},
                },
                imgURL: '',
            },
        ];
        const newNotifs = await Notification.create(data);
    }
};

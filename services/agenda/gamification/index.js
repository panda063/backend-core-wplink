const debug = require('debug')('agenda:personal');
const mongoose = require('mongoose');
const C = require('../../../lib/constants');
const Gamification = mongoose.model(C.MODELS.GAMIFICATION_C);
const ClientGamification = mongoose.model(C.MODELS.C_GAMIFICATION_C);
// const jwt = require('../../../lib/jwt');
const emailService = require('../../sendgrid/index');
const {
	creator_register_reminder_mail,
	creator_verification_reminder_42,
	creator_verification_reminder_72,
	creator_perk_1_reminder_42,
	creator_perk_1_reminder_72,
	creator_perk_2_reminder_42,
	creator_perk_2_reminder_72,
	creator_perk_2_reminder_week,
	creator_perk_3_reminder_42,
	creator_perk_3_reminder_72,
	creator_perk_3_reminder_week,
	client_not_registered_mail,
	client_social_reminder_mail,
	client_verification_reminder_mail,
} = require('../../../utils/emails');
const domainMail = 'service@passionbits.io';

// Agenda
// const agenda = require('../index');
const { CHRONS, CHRON_TIME } = require('../../agenda/constants');

exports.creator_register_reminder = async ({ email }) => {
	debug('REGISTER REMINDER');
	const message = {
		subject: 'Get early access on passionbits',
		html: creator_register_reminder_mail(),
	};
	emailService.sendEmail(email, message, domainMail);
};

exports.verification42h = async ({
	userId,
	email,
	userAuthtoken,
	name,
	position,
	agenda,
}) => {
	debug('VERIFICATION 42 HOURS');
	const message = {
		subject: 'You forgot to claim your 100 bits',
		html: creator_verification_reminder_42(name, position, userAuthtoken),
	};
	emailService.sendEmail(email, message, domainMail);
	// Schedule

	// Update Last Scheduled Mail In User Database
	await Gamification.findByIdAndUpdate(userId, {
		lsm: CHRONS.G_NO_VERIFICATION_72,
		$push: {
			a: {
				activity:
					C.GAMIFICATION_USER_ACTIVITIES.SEND_SCHEDULE_VERIFICATION_MAIL_42,
				triggerBy: C.GAMIFICATION_ACTIVTY_TRIGGER_BY.SYSTEM,
			},
		},
	});

	console.log('Schedule Mail', CHRONS.G_NO_VERIFICATION_72);
	agenda.schedule(CHRON_TIME.IN_HOURS_72, CHRONS.G_NO_VERIFICATION_72, {
		userId,
		email,
		userAuthtoken,
		name,
	});
};

exports.verification72h = async ({ userId, email, userAuthtoken, name }) => {
	debug('VERIFICATION 72 HOURS');
	const message = {
		subject: "You haven't visited your dashboard",
		html: creator_verification_reminder_72(name, userAuthtoken),
	};
	emailService.sendEmail(email, message, domainMail);

	// Update Last Scheduled Mail In User Database
	await Gamification.findByIdAndUpdate(userId, {
		lsm: null,
		$push: {
			a: {
				activity:
					C.GAMIFICATION_USER_ACTIVITIES.SEND_SCHEDULE_VERIFICATION_MAIL_72,
				triggerBy: C.GAMIFICATION_ACTIVTY_TRIGGER_BY.SYSTEM,
			},
		},
	});
};

exports.perk_1_42h = async ({ userId, email, name, agenda }) => {
	debug('PERK 1 42 HOURS');
	const message = {
		subject: 'Claim your guaranteed first project',
		html: creator_perk_1_reminder_42(name),
	};
	emailService.sendEmail(email, message, domainMail);

	// Update Last Scheduled Mail In User Database
	await Gamification.findByIdAndUpdate(userId, {
		lsm: CHRONS.G_PERK_1_72,
		$push: {
			a: {
				activity: C.GAMIFICATION_USER_ACTIVITIES.SEND_SCHEDULE_PERK_1_MAIL_42,
				triggerBy: C.GAMIFICATION_ACTIVTY_TRIGGER_BY.SYSTEM,
			},
		},
	});

	console.log('Schedule Mail', CHRONS.G_PERK_1_72);
	// Schedule
	agenda.schedule(CHRON_TIME.IN_HOURS_72, CHRONS.G_PERK_1_72, {
		userId,
		email,
		name,
	});
};

exports.perk_1_72h = async ({ userId, email, name }) => {
	debug('PERK 1 72 HOURS');
	const message = {
		subject: 'Get a guaranteed project on passionbits.',
		html: creator_perk_1_reminder_72(name, 'few'),
	};

	// Update Last Scheduled Mail In User Database
	await Gamification.findByIdAndUpdate(userId, {
		lsm: null,
		$push: {
			a: {
				activity: C.GAMIFICATION_USER_ACTIVITIES.SEND_SCHEDULE_PERK_1_MAIL_72,
				triggerBy: C.GAMIFICATION_ACTIVTY_TRIGGER_BY.SYSTEM,
			},
		},
	});

	emailService.sendEmail(email, message, domainMail);
};

exports.perk_2_42h = async ({ userId, email, name, agenda }) => {
	debug('PERK 2 42 HOURS');
	const message = {
		subject: 'Get access to our community on passionbits',
		html: creator_perk_2_reminder_42(name),
	};
	emailService.sendEmail(email, message, domainMail);

	// Update Last Scheduled Mail In User Database
	await Gamification.findByIdAndUpdate(userId, {
		lsm: CHRONS.G_PERK_2_72,
		$push: {
			a: {
				activity: C.GAMIFICATION_USER_ACTIVITIES.SEND_SCHEDULE_PERK_2_MAIL_42,
				triggerBy: C.GAMIFICATION_ACTIVTY_TRIGGER_BY.SYSTEM,
			},
		},
	});

	console.log('Schedule Mail', CHRONS.G_PERK_2_72);
	// Schedule
	agenda.schedule(CHRON_TIME.IN_HOURS_72, CHRONS.G_PERK_2_72, {
		userId,
		email,
		name,
	});
};

exports.perk_2_72h = async ({ userId, email, name, agenda }) => {
	debug('PERK 2 72 HOURS');
	const message = {
		subject: 'Two more perks waiting for you on your dashboard',
		html: creator_perk_2_reminder_72(name),
	};
	emailService.sendEmail(email, message, domainMail);

	// Update Last Scheduled Mail In User Database
	await Gamification.findByIdAndUpdate(userId, {
		lsm: CHRONS.G_PERK_2_W,
		$push: {
			a: {
				activity: C.GAMIFICATION_USER_ACTIVITIES.SEND_SCHEDULE_PERK_2_MAIL_72,
				triggerBy: C.GAMIFICATION_ACTIVTY_TRIGGER_BY.SYSTEM,
			},
		},
	});

	console.log('Schedule Mail', CHRONS.G_PERK_2_W);
	// Schedule
	agenda.schedule(CHRON_TIME.IN_WEEK, CHRONS.G_PERK_2_W, {
		userId,
		email,
		name,
	});
};

exports.perk_2_week = async ({ userId, email, name }) => {
	debug('PERK 2 WEEK HOURS');
	const message = {
		subject: 'Last few slots remaining!',
		html: creator_perk_2_reminder_week(name, 'few'),
	};
	emailService.sendEmail(email, message, domainMail);

	// Update Last Scheduled Mail In User Database
	await Gamification.findByIdAndUpdate(userId, {
		lsm: null,
		$push: {
			a: {
				activity: C.GAMIFICATION_USER_ACTIVITIES.SEND_SCHEDULE_PERK_2_MAIL_WEEK,
				triggerBy: C.GAMIFICATION_ACTIVTY_TRIGGER_BY.SYSTEM,
			},
		},
	});
};

exports.perk_3_42h = async ({ userId, email, name, agenda }) => {
	debug('PERK 3 42 HOURS');
	const message = {
		subject: 'We appreciate your efforts.',
		html: creator_perk_3_reminder_42(name),
	};
	emailService.sendEmail(email, message, domainMail);

	// Update Last Scheduled Mail In User Database
	await Gamification.findByIdAndUpdate(userId, {
		lsm: CHRONS.G_PERK_3_72,
		$push: {
			a: {
				activity: C.GAMIFICATION_USER_ACTIVITIES.SEND_SCHEDULE_PERK_3_MAIL_42,
				triggerBy: C.GAMIFICATION_ACTIVTY_TRIGGER_BY.SYSTEM,
			},
		},
	});

	console.log('Schedule Mail', CHRONS.G_PERK_3_72);
	// Schedule
	agenda.schedule(CHRON_TIME.IN_HOURS_72, CHRONS.G_PERK_3_72, {
		userId,
		email,
		name,
	});
};

exports.perk_3_72h = async ({ userId, email, name, agenda }) => {
	debug('PERK 2 72 HOURS');
	const message = {
		subject: 'You are almost there! Get 20000+ audience.',
		html: creator_perk_3_reminder_72(name),
	};
	emailService.sendEmail(email, message, domainMail);

	// Update Last Scheduled Mail In User Database
	await Gamification.findByIdAndUpdate(userId, {
		lsm: CHRONS.G_PERK_3_W,
		$push: {
			a: {
				activity: C.GAMIFICATION_USER_ACTIVITIES.SEND_SCHEDULE_PERK_3_MAIL_72,
				triggerBy: C.GAMIFICATION_ACTIVTY_TRIGGER_BY.SYSTEM,
			},
		},
	});

	console.log('Schedule Mail', CHRONS.G_PERK_3_W);
	// Schedule
	agenda.schedule(CHRON_TIME.IN_WEEK, CHRONS.G_PERK_3_W, {
		userId,
		email,
	});
};

exports.perk_3_week = async ({ userId, email, name }) => {
	debug('PERK 2 72 HOURS');
	const message = {
		subject: 'Last few slots remaining',
		html: creator_perk_3_reminder_week(name, 'few'),
	};

	// Update Last Scheduled Mail In User Database
	await Gamification.findByIdAndUpdate(userId, {
		lsm: null,
		$push: {
			a: {
				activity: C.GAMIFICATION_USER_ACTIVITIES.SEND_SCHEDULE_PERK_3_MAIL_WEEK,
				triggerBy: C.GAMIFICATION_ACTIVTY_TRIGGER_BY.SYSTEM,
			},
		},
	});

	emailService.sendEmail(email, message, domainMail);
};

// Client Gamification Mail Schedule

exports.client_not_registered = async ({ email }) => {
	debug('Client Not Registered');
	const message = {
		subject: 'Post a job for free for a year.',
		html: client_not_registered_mail(),
	};

	// Update Last Scheduled Mail In User Database
	await ClientGamification.findOneAndUpdate(
		{ e: email },
		{
			lsm: null,
			$push: {
				a: {
					activity:
						C.GAMIFICATION_CLIENT_ACTIVITIES.SEND_REGISTER_REMINDER_MAIL,
					triggerBy: C.GAMIFICATION_ACTIVTY_TRIGGER_BY.SYSTEM,
				},
			},
		}
	);

	emailService.sendEmail(email, message, domainMail);
};

exports.client_not_verified = async ({ email, token, name }) => {
	debug('Client Not Verified');
	const message = {
		subject:
			'Congratulations!You have earned a one year subscription for free on passionbits.',
		html: client_verification_reminder_mail(token, name),
	};

	// Update Last Scheduled Mail In User Database
	await ClientGamification.findOneAndUpdate(
		{ e: email },
		{
			lsm: null,
			$push: {
				a: {
					activity:
						C.GAMIFICATION_CLIENT_ACTIVITIES.SEND_VERIFICATION_REMINDER_MAIL,
					triggerBy: C.GAMIFICATION_ACTIVTY_TRIGGER_BY.SYSTEM,
				},
			},
		}
	);

	emailService.sendEmail(email, message, domainMail);
};

exports.client_social_share = async ({ email, userRef, name }) => {
	debug('Client Not Verified');
	const message = {
		subject: 'Get an additional 1 month subscription for free',
		html: client_social_reminder_mail(name, userRef),
	};

	// Update Last Scheduled Mail In User Database
	await ClientGamification.findOneAndUpdate(
		{ e: email },
		{
			lsm: null,
			$push: {
				a: {
					activity: C.GAMIFICATION_CLIENT_ACTIVITIES.SEND_SOCIAL_REMINDER_MAIL,
					triggerBy: C.GAMIFICATION_ACTIVTY_TRIGGER_BY.SYSTEM,
				},
			},
		}
	);

	emailService.sendEmail(email, message, domainMail);
};

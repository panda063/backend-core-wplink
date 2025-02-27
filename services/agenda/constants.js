const CHRONS = {
	VE_REVIEW_TIMEOUT: 've-review-timeout',
	WRITER_WRITING_TIMEOUT: 'writer-writing-timeout',
	WRITER_REVISING_TIMEOUT: 'writer-revising-timeout',
	DEAD_JOB_TIMEOUT: 'dead-job-timeout',
	BAD_JOB_TIMEOUT: 'bad-job-timeout',
	AVAILABLE_JOB_WAITING_TIMEOUT: 'available-job-waiting-timeout',
	DISTRIBUTE_JOB: 'distribute-job',
	// for Mail Schedulation
	G_NO_REGISTRATION_REMINDER: 'G_NO_REGISTRATION_REMINDER',
	G_NO_VERIFICATION_42: 'G_NO_VERIFICATION_42',
	G_NO_VERIFICATION_72: 'G_NO_VERIFICATION_72',
	G_PERK_1_42: 'G_PERK_1_42',
	G_PERK_1_72: 'G_PERK_1_72',
	G_PERK_2_42: 'G_PERK_2_42',
	G_PERK_2_72: 'G_PERK_2_72',
	G_PERK_2_W: 'G_PERK_2_W',
	G_PERK_3_42: 'G_PERK_3_42',
	G_PERK_3_72: 'G_PERK_3_72',
	G_PERK_3_W: 'G_PERK_3_W',
	// client gamification
	GC_NOT_REGISTERED: 'GC_NOT_REGISTERED',
	GC_NOT_VERIFIED: 'GC_NOT_VERIFIED',
	GC_SOCIAL_REMINDER_1D: 'GC_SOCIAL_REMINDER_1D',
};

const CHRON_TIME = {
	IN_HOURS_42: '42 hours',
	IN_HOURS_72: '72 hours',
	IN_WEEK: 'one week',
	IN_DAY: 'one day',
};

module.exports = {
	CHRONS,
	CHRON_TIME,
};

const C = require('../lib/constants');
const { GAMIFICATION_TIMELINE_FILTERS } = require('../lib/constants');

const mapToDb = {
	PERK1: 'gp',
	PERK2: 'fg',
	PERK3: 'bl',
	VERIFIED: 'iv',
	// SOCIAL: '',
	SURVEY: 'ts',
	MAILED: 'mu',
	ACTIVE: 'la',
	INACTIVE: 'la',
};

exports.getFiltersForGamification = (
	onPlan,
	onTime,
	userAction,
	userActionStatus,
	perks
) => {
	const filter = {};
	if (onPlan) {
		filter[mapToDb.PERK1] =
			onPlan === C.GAMIFICATION_PLAN_FILTERS.NONE ? false : true;
		filter[mapToDb.PERK2] =
			onPlan === C.GAMIFICATION_PLAN_FILTERS.PERK2 ||
			onPlan === C.GAMIFICATION_PLAN_FILTERS.PERK3;
		filter[mapToDb.PERK3] = onPlan === C.GAMIFICATION_PLAN_FILTERS.PERK3;
	}
	if (onTime) {
		const days = 2 || onTime === C.GAMIFICATION_TIMELINE_FILTERS.ACTIVE ? 2 : 7;
		filter['la'] =
			onTime === C.GAMIFICATION_TIMELINE_FILTERS.ACTIVE
				? {
						$gte: new Date(new Date().getTime() - 1000 * 86400 * days),
				  }
				: {
						$lt: new Date(new Date().getTime() - 1000 * 86400 * days),
				  };
	}
	if (userAction) {
		filter[mapToDb[userAction]] = !!userActionStatus;
	}
	if (perks === 0 || !!perks) {
		filter['p'] = {
			$lte: perks,
		};
	}
	return filter;
};

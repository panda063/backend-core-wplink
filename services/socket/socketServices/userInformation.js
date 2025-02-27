const userService = require('../chatDbServices/users');

const searchUser = () => {
	return async ({ searchString }, searchCallBack) => {
		console.log('[SEARCH_PERSON_EVENT]');
		const searchResult = await userService.searchPeople(searchString);
		searchCallBack(searchResult);
	};
};

const getUserInformation = (userId) => {
	return async ({ userIdFromClient }, callBack) => {
		console.log('[GET_USER_INFO_EVENT]');
		const userInfo = await userService.getUserInfo(
			userIdFromClient ? userIdFromClient : userId
		);
		// console.log('userInfo', userInfo);
		callBack(userInfo);
	};
};

module.exports = {
	getUserInformation,
	searchUser,
};

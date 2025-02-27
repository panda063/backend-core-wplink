const C = require('../../../lib/constants');
const mongoose = require('mongoose');
const User = mongoose.model(C.MODELS.USER_C);

const searchPeople = async (name) => {
	let result = await User.find({
		$or: [
			{ 'n.f': { $regex: new RegExp('.*' + name + '.*', 'i') } },
			{ 'n.l': { $regex: new RegExp('.*' + name + '.*', 'i') } },
		],
	})
		.select('n _id')
		.limit(10)
		.exec();
	const editedResult = result.map((user) => {
		return {
			userId: user._id,
			userName: user.n.f + ' ' + user.n.l,
		};
	});
	console.log('Search Result', editedResult);
	return editedResult;
};

const getUserInfo = async (userId) => {
	let result = await User.findById(userId).select('n img _id').exec();
	const editedResult = {
		userId: result._id,
		userName: result.n.f + ' ' + result.n.l,
		img: result.img,
	};
	return editedResult;
};

module.exports = {
	searchPeople,
	getUserInfo,
};

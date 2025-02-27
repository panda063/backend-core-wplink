/* seed.js */
// todo: install dep....
// > npm i -D faker mongodb lodash
// > node seed.js
// > You'll have 3 main accounts and other random accounts with password 1234
/**
 * manish@whitepanda.in
 * roshan@whitepanda.in
 * pavan@whitepanda.in
 */
// require the necessary libraries
const faker = require('faker');
const Mongoose = require('mongoose');
const MongoClient = require('mongodb').MongoClient;
const assert = require('assert');
const _ = require('lodash');
// Connection URL
const url = 'mongodb://localhost:27017';

// Database Name
const dbName = 'test';

const getEmail = (index) => {
	if (index === 0) return 'manish@whitepanda.in';
	if (index === 1) return 'roshan@whitepanda.in';
	if (index === 2) return 'pavan@whitepanda.in';
	return faker.internet.email();
};

const getEmailForWriter = (index) => {
	if (index === 0) return 'manish@passionbits.io';
	if (index === 1) return 'roshan@passionbits.io';
	if (index === 2) return 'pavan@passionbits.io';
	return faker.internet.email();
};

// Use connect method to connect to the server
MongoClient.connect(url, function (err, client) {
	assert.equal(null, err);

	const db = client.db(dbName);

	// get access to the relevant collections
	const usersCollection = db.collection('users');
	const organisationsCollection = db.collection('organisations');
	const jobsCollection = db.collection('jobboards');
	const applicationsCollection = db.collection('applications');
	// make a bunch of users
	console.log('Creating Data...');
	{
		/*
		 > ------------------------- 
		 > ----| Add Organization | 
		 > -------------------------
	*/
	}
	let orgs = [];
	for (let i = 0; i < 50; i += 1) {
		let newOrg = {
			_id: Mongoose.Types.ObjectId(),
			name: faker.company.companyName(),
			desc: faker.name.jobDescriptor(),
			sectors: ['Engineering'],
			website: faker.internet.email(),
			socialMedia: faker.internet.url(),
			cin: faker.random.number(999999999999999999999),
			govtId: '',
			postingAs: 'organisation',
			__v: 0,
		};
		orgs.push(newOrg);

		// visual feedback always feels nice!
	}

	{
		/*
		 > ------------------------- 
		 > ----| Add Users | 
		 > -------------------------
	*/
	}
	let users = [];
	for (let i = 0; i < 50; i += 1) {
		let newClient = {
			_id: Mongoose.Types.ObjectId(),
			cart: {
				single: {
					jobIds: [],
				},
				amount: 0,
				tax: 0,
				amountWithTax: 0,
			},
			orders: {
				single: [],
			},
			acst: 'active',
			mb: 0,
			cpis: [],
			ppis: [],
			placedOrderIds: [],
			opportunities: [Mongoose.Types.ObjectId()],
			organisation: orgs[i]._id,
			isPostingFirstTime: false,
			businessSector: 'Semicondoctor',
			location: faker.address.city(),
			avatar: '',
			iev: true,
			imv: false,
			pv: 1,
			__t: 'Client',
			projects: [],
			adr: {
				sr: '',
				ci: '',
				st: '',
				co: '',
				pc: '',
			},
			e: getEmail(i),
			p: '$2b$10$7WdLzF8ALl2P5o6iMelpcewT1sFCVa/zsOBtr3EY7/ePdg8EAX8M6',
			cn: faker.internet.userName(), // * when siging up > company name
			mo: faker.phone.phoneNumberFormat(10),
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
			__v: 1,
			vat: new Date().toISOString(),
			n: {
				f: faker.name.firstName(),
				l: faker.name.lastName(),
			},
			professionalDesignation: faker.name.title(),
		};
		users.push(newClient);
	}
	{
		/*
		> ------------------------- 
		> ----| Add Jobs | 
		> -------------------------
	*/
	}
	let jobs = [];
	for (let i = 0; i < 50; i += 1) {
		let newJob = {
			_id: users[i].opportunities[0],
			title: faker.name.title(),
			location: faker.address.city(),
			remoteFriendly: true,
			it: false,
			responsibility: faker.lorem.words(20),
			minQualifications: 'MCA',
			preferredQualifications: 'MBA',
			portfolioRequired: true,
			renumeration: 2000,
			openings: 2,
			ques1: 'Where do you see yourself in next 5 years?',
			ques2: "How much time it'll take to complete this project?",
			ac: 1,
			applications: [],
			postedOn: new Date().toISOString(),
			jobOnHold: false,
			status: 'active',
			employmentType: 'full_time',
			renumerationUnit: 'per month',
			deadline: new Date().toISOString(),
			projectDescription: faker.lorem.words(20),
			client: users[i]._id,
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
			__v: 0,
		};
		jobs.push(newJob);
	}

	{
		/** 
		// > ------------------------- 
		// > ----| Add Applications | 
		// > -------------------------
	*/
	}

	let apps = [];
	for (let i = 0; i < 50; i += 1) {
		let newApp = {
			_id: Mongoose.Types.ObjectId(),
			appliedOn: new Date().toISOString(),
			ans1: faker.lorem.words(20),
			ans2: faker.lorem.words(10),
			jobOnHold: false,
			writer: Mongoose.Types.ObjectId(),
			job: jobs[i]._id,
			client: users[i]._id,
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
			__v: 0,
		};
		jobs[i].applications.push(newApp._id);
		apps.push(newApp);

		// visual feedback always feels nice!
	}

	{
		/** 
		// > ------------------------- 
		// > ----| Writers | 
		// > -------------------------
	*/
	}
	for (let i = 0; i < 50; i += 1) {
		let newWriter = {
			_id: apps[i].writer,
			tgl: faker.random.word(),
			bio: faker.lorem.words(10),
			pdg: faker.name.jobTitle,
			isbf: false,
			hofa: false,
			acst: 'active',
			avt: 0,
			mom: 0,
			iav: false,
			jal: 1,
			xp: 0,
			ref: 'direct',
			applications: [apps[i]._id],
			iev: true,
			imv: true,
			pv: 1,
			__t: 'Writer',
			vex: {
				tan: 0,
				pass: false,
				ps: [],
				al: 2,
			},
			sex: {
				tan: 0,
				pass: false,
				ps: [],
				al: 2,
			},
			art: [
				{
					i: 'https://miro.medium.com/max/512/0*FwSqmsGzAFKGRexY.png',
					p: 'Medium',
					t: 'How to Preload Images into Cache in React JS',
					d:
						'I ran into a problem recently, where the large, high-resolution background images in my web app were loading slowly and, as a result, the webpage would look glitchy. Here is an example of what it…',
					l:
						'https://cdn-images-1.medium.com/fit/c/152/152/1*8I-HPL0bfoIzGied-dzOvA.png',
					url:
						'https://medium.com/@jack72828383883/how-to-preload-images-into-cache-in-react-js-ff1642708240',
					ta: [],
					ss: [],
					_id: Mongoose.Types.ObjectId('5f857fe542a4968e557699ee'),
				},
			],
			tags: [],
			adr: {
				sr: '',
				ci: faker.address.city(),
				st: '',
				co: faker.address.country(),
				pc: '',
			},
			e: getEmailForWriter(i),
			p: '$2b$10$crZfBlnab1firZVyk8nsPeZdhlhNRDBPKsUiX55uR/Gn9MIAl/jiC',
			n: {
				f: faker.name.firstName(),
				l: faker.name.lastName(),
			},
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
			__v: 2,
			vat: new Date().toISOString(),
			mo: faker.random.number(9999999999),
			pn: faker.random.alphaNumeric(10),
			img:
				'https://wp-users.s3.amazonaws.com/5f857f9b42a4968e557699ed/profile-img.jpg',
		};
		users.push(newWriter);

		// visual feedback always feels nice!
	}

	console.log('Removing Old Data...');
	// > Drop Collection
	usersCollection.deleteMany({});
	organisationsCollection.deleteMany({});
	jobsCollection.deleteMany({});
	applicationsCollection.deleteMany({});

	console.log('Adding Data...');
	// > Seed Data
	usersCollection.insertMany(users);
	organisationsCollection.insertMany(orgs);
	jobsCollection.insertMany(jobs);
	applicationsCollection.insertMany(apps);

	console.log('Database seeded! :)');
	client.close();
});

'use strict';

const Homey = require('homey');

module.exports = [
	{
		description: 'Authenticate Nest',
		method: 'GET',
		path: '/authenticated/',
		fn: (args, callback) => {
			if (Homey.app.nestAccount && Homey.app.nestAccount.db) return callback(null, Homey.app.nestAccount.db.getAuth());
			return callback('No nest account found');
		},
	},
	{
		description: 'Revoke authentication Nest',
		method: 'POST',
		path: '/revokeAuthentication/',
		fn: (args, callback) => {

			// Revoke authentication on nest account
			Homey.app.nestAccount.revokeAuthentication()
				.then(() => callback(null, true))
				.catch(err => callback(err));
		},
	},
	{
		description: 'Authenticate Nest',
		method: 'POST',
		path: '/authenticate/',
		fn: (args, callback) => {

			// Fetch access token
			Homey.app.fetchAccessToken(data => callback(null, data.url))
				.then(accessToken => {

				// Save token
				Homey.ManagerSettings.set('nestAccesstoken', accessToken);

				// Authenticate nest account with new token
				Homey.app.nestAccount.authenticate(accessToken);
			});
		},
	},
];

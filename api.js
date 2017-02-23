'use strict';

module.exports = [
	{
		description: 'Authenticate Nest',
		method: 'GET',
		path: '/authenticated/',
		fn: callback => {
			if (Homey.app.nestAccount && Homey.app.nestAccount.db) callback(null, Homey.app.nestAccount.db.getAuth());
			else (callback('No nest account found'));
		},
	},
	{
		description: 'Revoke authentication Nest',
		method: 'POST',
		path: '/revokeAuthentication/',
		fn: callback => {

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
		fn: callback => {

			// Fetch access token
			Homey.app.fetchAccessToken(data => {
				callback(null, data.url);
			}).then(accessToken => {

				// Save token
				Homey.manager('settings').set('nestAccesstoken', accessToken);

				// Authenticate nest account with new token
				Homey.app.nestAccount.authenticate(accessToken);
			});
		},
	},
];

'use strict';

module.exports = [
	{
		description: 'Authenticate Nest',
		method: 'GET',
		path: '/authenticated/',
		fn: callback => {
			callback(null, Homey.app.nestAccount.db.getAuth());
		}
	},
	{
		description: 'Revoke authentication Nest',
		method: 'POST',
		path: '/revokeAuthentication/',
		fn: callback => {
			Homey.app.nestAccount.revokeAuthentication()
				.then(() => callback(null, true))
				.catch(err => callback(err));
		}
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
				Homey.manager('settings').set('nestAccessToken', accessToken);
			});
		}
	}
];

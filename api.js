'use strict';

const Homey = require('homey');
const OAuth2Util = require('homey-wifidriver').OAuth2Util;

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

			// Start OAuth2 flow
			OAuth2Util.generateOAuth2Callback(Homey.app.nestAccount.oauth2Account)
				.on('url', url => callback(null, url))
				.on('authorized', () => {
					Homey.app.nestAccount.authenticate().then(() => {
						Homey.ManagerSettings.set('oauth2Account', Homey.app.nestAccount.oauth2Account);
					});
				})
				.on('error', error => callback(error));
		},
	},
];

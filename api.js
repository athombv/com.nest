'use strict';

const Homey = require('homey');
const WifiUtil = require('homey-wifidriver').Util;

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
			// Only one account and one client allowed for this app, get it
			const oauth2Account = Homey.app.OAuth2ClientManager.getClient().getAccount();
			WifiUtil.generateOAuth2Callback(oauth2Account)
				.on('url', url => callback(null, url))
				.on('authorized', () => {
					console.log('api.authenticate', oauth2Account.accessToken);
					Homey.app.nestAccount.authenticate(oauth2Account)
				})
				.on('error', error => callback(error));
		},
	},
];

'use strict';

const request = require('request');

const NestAccount = require('./nest').NestAccount;

let credentials = [
	{
		clientID: Homey.env.NEST_CLIENT_ID,
		clientSecret: Homey.env.NEST_CLIENT_SECRET
	},
	{
		clientID: Homey.env.NEST_CLIENT_ID_T1,
		clientSecret: Homey.env.NEST_CLIENT_SECRET_T1
	},
	{
		clientID: Homey.env.NEST_CLIENT_ID_T2,
		clientSecret: Homey.env.NEST_CLIENT_SECRET_T2
	},
	{
		clientID: Homey.env.NEST_CLIENT_ID_T3,
		clientSecret: Homey.env.NEST_CLIENT_SECRET_T3
	},
	{
		clientID: Homey.env.NEST_CLIENT_ID_T4,
		clientSecret: Homey.env.NEST_CLIENT_SECRET_T4
	},
	{
		clientID: Homey.env.NEST_CLIENT_ID_T5,
		clientSecret: Homey.env.NEST_CLIENT_SECRET_T5
	},
	{
		clientID: Homey.env.NEST_CLIENT_ID_T6,
		clientSecret: Homey.env.NEST_CLIENT_SECRET_T6
	},
	{
		clientID: Homey.env.NEST_CLIENT_ID_T7,
		clientSecret: Homey.env.NEST_CLIENT_SECRET_T7
	},
	{
		clientID: Homey.env.NEST_CLIENT_ID_T8,
		clientSecret: Homey.env.NEST_CLIENT_SECRET_T8
	},
	{
		clientID: Homey.env.NEST_CLIENT_ID_T9,
		clientSecret: Homey.env.NEST_CLIENT_SECRET_T9
	}
];

/**
 * Select one of the clients to use.
 */
function setRandomCredential() {
	// credentials = credentials[Math.floor((Math.random() * 9))]; TODO
	credentials = credentials[9];
}

/**
 * Setup NestAccount, credentials and flows.
 */
module.exports.init = () => {

	// Create new nest account
	const nestAccount = module.exports.nestAccount = new NestAccount({
		accessToken: Homey.manager('settings').get('nestAccessToken')
	}).on('authenticated', () => Homey.manager('api').realtime('authenticated', true))
		.on('unauthenticated', () => Homey.manager('api').realtime('authenticated', false));

	// Update token in nestAccount when changed
	Homey.manager('settings').on('set', setting => {
		if (setting === 'nestAccessToken') {
			nestAccount.authenticate(Homey.manager('settings').get('nestAccessToken'));
		}
	});

	// Initialize Nest driver with random credential
	setRandomCredential();

	// Provide autocomplete input for condition card
	Homey.manager('flow').on('condition.away_status.structures.autocomplete', callback => {
		callback(null, nestAccount.structures);
	});

	// Provide autocomplete input for trigger card
	Homey.manager('flow').on('trigger.away_status_changed.structures.autocomplete', callback => {
		callback(null, nestAccount.structures);
	});

	// When triggered, get latest structure data and check if status is home or not
	Homey.manager('flow').on('condition.away_status', (callback, args) => {
		let result = false;

		// Check for proper incoming arguments
		if (args && args.hasOwnProperty('structures') && args.structures.hasOwnProperty('structure_id')) {
			nestAccount.structures.forEach(structure => {
				if (structure.structure_id === args.structures.structure_id &&
					structure.away === args.status) {
					result = true;
				}
			});
		}
		callback(null, result);
	});

	// Parse flow trigger
	Homey.manager('flow').on('trigger.away_status_changed', (callback, args, data) => {

		// Check if all needed data is present
		if (args && args.structures && args.structures.structure_id && args.status
			&& data && data.status && data.structure_id) {

			// Check if matching structure, and matching status
			return callback(null, (args.structures.structure_id === data.structure_id && args.status === data.status));
		}

		// Return error
		return callback(true, null);
	});
};

/**
 * Starts OAuth2 flow with Nest to get authenticated
 * @param callback
 */
module.exports.fetchAccessToken = callback => new Promise((resolve, reject) => {

	// Generate OAuth2 callback, this helps to catch the authorization token
	Homey.manager('cloud').generateOAuth2Callback(`https://home.nest.com/login/oauth2?client_id=${credentials.clientID}&state=NEST`,

		// Before fetching authorization code
		(err, result) => {

			// Pass needed credentials to front-end
			callback({ url: result });
		},

		// After fetching authorization code
		(err, result) => {

			// Post authorization url with needed credentials
			request.post(
				`https://api.home.nest.com/oauth2/access_token?client_id=${credentials.clientID}&code=${result}&client_secret=${credentials.clientSecret}&grant_type=authorization_code`, {
					json: true
				}, (err, response, body) => {
					if (err || response.statusCode >= 400 || !body.access_token) {

						// Catch error
						console.error('Error fetching access token', err || response.statusCode >= 400 || body);

						return reject(err);
					}
					return resolve(body.access_token);
				}
			);
		}
	);
});

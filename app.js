'use strict';

const Log = require('homey-log').Log;

const request = require('request');
const fs = require('fs');

const NestAccount = require('./nest').NestAccount;

/**
 * Setup NestAccount, listeners and flows.
 */
module.exports.init = () => {

	console.log(`${Homey.manifest.id} running...`);

	// Get app version from json
	module.exports.appVersion = Homey.manifest.version;

	module.exports.nestAccountInitialization = new Promise(resolve => {

		// Create new nest account from stored token
		const nestAccount = module.exports.nestAccount = new NestAccount({
			accessToken: Homey.manager('settings').get('nestAccesstoken'),
		})
			.on('authenticated', () => Homey.manager('api').realtime('authenticated', true))
			.on('unauthenticated', () => Homey.manager('api').realtime('authenticated', false))
			.on('initialized', success => {
				registerAutoCompleteHandlers(nestAccount);
				registerFlowConditionHandlers(nestAccount);
				registerFlowTriggerHandlers(nestAccount);
				return resolve(success);
			})
			.on('away', structure => {
				Homey.manager('flow').trigger('away_status_changed', {}, structure);
			});
	});
};

/**
 * Bind handlers on autocomplete requests. Returns all structures
 * from the main Nest account.
 * @param nestAccount
 */
function registerAutoCompleteHandlers(nestAccount) {

	// Provide autocomplete input for condition card
	Homey.manager('flow').on('condition.away_status.structure.autocomplete', (callback, args) => {
		if (nestAccount.hasOwnProperty('structures') && Array.isArray(nestAccount.structures)) {
			return callback(null, nestAccount.structures.filter(item => item.name.toLowerCase().includes(args.query.toLowerCase())));
		} return callback(null, []);
	});

	// Provide autocomplete input for trigger card
	Homey.manager('flow').on('trigger.away_status_changed.structure.autocomplete', (callback, args) => {
		if (nestAccount.hasOwnProperty('structures') && Array.isArray(nestAccount.structures)) {
			return callback(null, nestAccount.structures.filter(item => item.name.toLowerCase().includes(args.query.toLowerCase())));
		} return callback(null, []);
	});
}

/**
 * Bind handlers on flow condition requests. Checks whether a given
 * condition regarding a given structure is met.
 * @param nestAccount
 */
function registerFlowConditionHandlers(nestAccount) {

	Homey.manager('flow').on('condition.away_status', (callback, args) => {

		// Check for proper incoming arguments
		if (args && args.hasOwnProperty('structure') && args.structure.hasOwnProperty('structure_id')) {
			return callback(null, !!findWhere(nestAccount.structures, {
				structure_id: args.structure.structure_id,
				away: args.status,
			}));
		}
	});
}

/**
 * Bind handlers on flow action requests. Checks whether certain conditions
 * are being met.
 */
function registerFlowTriggerHandlers() {

	Homey.manager('flow').on('trigger.away_status_changed', (callback, args, data) => {

		// Check if all needed data is present
		if (args && args.hasOwnProperty('structure') && args.structure.hasOwnProperty('structure_id')
			&& data && data.hasOwnProperty('away') && data.hasOwnProperty('structure_id')
			&& args.hasOwnProperty('status')) {

			// Check if matching structure, and matching status
			return callback(null, (args.structure.structure_id === data.structure_id && args.status === data.away));
		}

		// Return error
		return callback(true, null);
	});
}

/**
 * Plain JS implementation of findWhere.
 * @param array
 * @param criteria
 * @returns {*}
 */
function findWhere(array, criteria) {
	return array.find(item => Object.keys(criteria).every(key => item[key] === criteria[key]));
}

/**
 * Register a log item, if more than 10 items present
 * remove first item (oldest item).
 * @param item
 */
module.exports.registerLogItem = item => {
	console.log(`Register new log item: time: ${item.timestamp}, err: ${item.msg}`);
	const logItems = Homey.manager('settings').get('logItems') || [];
	logItems.push(item);
	if (logItems.length > 10) logItems.shift();
	Homey.manager('settings').set('logItems', logItems);
};

/**
 * Fetches OAuth authorization url from Nest. When this url is used it will
 * callback with an OAuth authorization code which will in turn be exchanged
 * for a OAuth access token.
 * @param callback
 */
module.exports.fetchAccessToken = callback => new Promise((resolve, reject) => {

	// Generate OAuth callback, this helps to catch the authorization token
	Homey.manager('cloud').generateOAuth2Callback(`https://home.nest.com/login/oauth2?client_id=${Homey.env.NEST_CLIENT_ID}&state=NEST`,

		(err, result) => {

			// Pass authorization url to front-end
			callback({ url: result });
		},

		(err, result) => {

			// Exchange authorization code for access token
			request.post(
				`https://api.home.nest.com/oauth2/access_token?client_id=${Homey.env.NEST_CLIENT_ID}&code=${result}&client_secret=${Homey.env.NEST_CLIENT_SECRET}&grant_type=authorization_code`, {
					json: true,
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

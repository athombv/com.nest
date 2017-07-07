'use strict';

const Homey = require('homey');

const Log = require('homey-log').Log;

const request = require('request');

const NestAccount = require('./nest').NestAccount;

class NestApp extends Homey.App {
	onInit() {
		this.log(`${this.id} running...`);

		this.nestAccountInitialization = new Promise(resolve => {

			// Create new nest account from stored token
			this.nestAccount = new NestAccount({
				accessToken: Homey.ManagerSettings.get('nestAccesstoken'),
			})
				.on('authenticated', () => Homey.ManagerApi.realtime('authenticated', true))
				.on('unauthenticated', () => Homey.ManagerApi.realtime('authenticated', false))
				.on('initialized', success => resolve(success))
				.on('away', structure => {
					this.awayStatusChangedFlowCardTrigger
						.trigger({}, structure)
						.catch(err => this.error('Failed to trigger away_status_changed', err))
				});

			new Homey.FlowCardCondition('away_status')
				.register()
				.on('run', (args, state, callback) => {
					if (args && args.hasOwnProperty('structure') && args.structure.hasOwnProperty('structure_id')) {
						return callback(null, !!findWhere(this.nestAccount.structures, {
							structure_id: args.structure.structure_id,
							away: args.status,
						}));
					}
					return callback(new Error('missing_structure_or_structure_id_arguments'));
				})
				.getArgument('structure')
				.on('autocomplete', (query, args, callback) => {
					if (this.nestAccount.hasOwnProperty('structures') && Array.isArray(this.nestAccount.structures)) {
						return callback(null, this.nestAccount.structures.filter(item => item.name.toLowerCase().includes(query.toLowerCase())));
					}
					return callback(null, []);
				});

			this.awayStatusChangedFlowCardTrigger = new Homey.FlowCardTrigger('away_status_changed')
				.register()
				.on('run', (args, state, callback) => {
					if (args && args.hasOwnProperty('structure') && args.structure.hasOwnProperty('structure_id')
						&& state && state.hasOwnProperty('away') && state.hasOwnProperty('structure_id')
						&& args.hasOwnProperty('status')) {
						return callback(null, (args.structure.structure_id === state.structure_id && args.status === state.away));
					}
					return callback(true, null);
				})
			this.awayStatusChangedFlowCardTrigger.getArgument('structure')
				.on('autocomplete', (query, args, callback) => {
					if (this.nestAccount.hasOwnProperty('structures') && Array.isArray(this.nestAccount.structures)) {
						return callback(null, this.nestAccount.structures.filter(item => item.name.toLowerCase().includes(query.toLowerCase())));
					}
					return callback(null, []);
				});
		});
	}

	/**
	 * Register a log item, if more than 10 items present
	 * remove first item (oldest item).
	 * @param item
	 */
	registerLogItem(item) {
		this.log(`Register new log item: time: ${item.timestamp}, err: ${item.msg}`);
		const logItems = Homey.ManagerSettings.get('logItems') || [];
		logItems.push(item);
		if (logItems.length > 10) logItems.shift();
		Homey.ManagerSettings.set('logItems', logItems);
	}

	/**
	 * Fetches OAuth authorization url from Nest. When this url is used it will
	 * callback with an OAuth authorization code which will in turn be exchanged
	 * for a OAuth access token.
	 * @param callback
	 */
	fetchAccessToken(callback) {
		return new Promise((resolve, reject) => {

			new Homey.CloudOAuth2Callback(`https://home.nest.com/login/oauth2?client_id=${Homey.env.NEST_CLIENT_ID}&state=NEST`)
				.once('url', url => {
					this.log('retrieved authentication url');
					callback({ url });
				})
				.once('code', code => {
					this.log('retrieved authentication code');

					// Exchange authorization code for access token
					request.post(
						`https://api.home.nest.com/oauth2/access_token?client_id=${Homey.env.NEST_CLIENT_ID}&code=${code}&client_secret=${Homey.env.NEST_CLIENT_SECRET}&grant_type=authorization_code`, {
							json: true,
						}, (err, response, body) => {
							if (err || response.statusCode >= 400 || !body.access_token) {

								// Catch error
								this.error('Error fetching access token', err || response.statusCode >= 400 || body);

								return reject(err);
							}
							return resolve(body.access_token);
						}
					);
				})
				.generate();
		});
	}
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

module.exports = NestApp;

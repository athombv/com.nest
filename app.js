'use strict';

// TODO: test
// TODO: migrate

const Homey = require('homey');
const request = require('request');
const Log = require('homey-log').Log;
const WifiApp = require('homey-wifidriver').App;

const NestAccount = require('./nest').NestAccount;

const oauth2ClientConfig = {
	url: `https://home.nest.com/login/oauth2?client_id=${Homey.env.NEST_CLIENT_ID}&state=NEST`,
	tokenEndpoint: 'https://api.home.nest.com/oauth2/access_token',
	key: Homey.env.NEST_CLIENT_ID,
	secret: Homey.env.NEST_CLIENT_SECRET,
	allowMultipleAccounts: false,
	refreshingEnabled: false,
};

class NestApp extends WifiApp {

	onInit() {
		super.onInit();

		this.log(`${this.id} running...`);

		// Create single client and account for this app
		this.oauth2ClientConfig = oauth2ClientConfig;
		const oauth2Client = this.OAuth2ClientManager.createClient(oauth2ClientConfig);
		const oauth2Account = oauth2Client.createAccount(Homey.ManagerSettings.get('oauth2Account') || {});

		// Create new nest account from stored oauth2Account
		this.nestAccount = new NestAccount({ oauth2Account })
			.on('authenticated', () => {
				this.log('nestAccount authenticated');
				Homey.ManagerSettings.set('oauth2Account', oauth2Account);
				Homey.ManagerApi.realtime('authenticated', true)
			})
			.on('unauthenticated', () => {
				this.log('nestAccount unauthenticated');
				Homey.ManagerSettings.unset('oauth2Account');
				Homey.ManagerApi.realtime('authenticated', false)
			})
			.on('initialized', () => this.log('nestAccount initialized'))
			.on('away', structure => {
				this.awayStatusChangedFlowCardTrigger
					.trigger({}, structure)
					.catch(err => this.error('Failed to trigger away_status_changed', err))
			});

		this.log(`initialized (oauth2AccountId: ${oauth2Account.id})`);

		// Register flow cards
		this.registerFlowCards();
	}

	/**
	 * Method that will register all Flow Cards.
	 */
	registerFlowCards() {

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
			});

		this.awayStatusChangedFlowCardTrigger.getArgument('structure')
			.on('autocomplete', (query, args, callback) => {
				if (this.nestAccount.hasOwnProperty('structures') && Array.isArray(this.nestAccount.structures)) {
					return callback(null, this.nestAccount.structures.filter(item => item.name.toLowerCase().includes(query.toLowerCase())));
				}
				return callback(null, []);
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

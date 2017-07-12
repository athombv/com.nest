'use strict';

const Homey = require('homey');
const _ = require('underscore');
const request = require('request');
const Firebase = require('firebase');
const EventEmitter = require('events');

const NestCam = require('./NestCam');
const NestProtect = require('./NestProtect');
const NestThermostat = require('./NestThermostat');

/**
 * Class that represents a single Nest account. It requires an
 * oauth2Account and will keep up-to-date lists of all devices and
 * structures in the Nest account.
 */
class NestAccount extends EventEmitter {

	/**
	 * Create NestAccount instance, provide options object
	 * with accessToken property to start authentication
	 * immediately. Starts listening for realtime updates
	 * from database.
	 * @param options
	 */
	constructor(options) {
		super();

		// Store provided options in this
		Object.assign(this, options);

		// Reference to Firebase database
		this.db = new Firebase('wss://developer-api.nest.com');

		// Attach listener to auth state
		this.db.onAuth(authData => {
			if (authData === null) {
				this.hasData = false;
				this.emit('unauthenticated');
			}
			else this.emit('authenticated');
		});

		// Keep track of devices in Nest API
		this.thermostats = [];
		this.smoke_co_alarms = [];
		this.cameras = [];

		// Keep track of structures in Nest APIª
		this.structures = [];

		console.log('NestAccount: construct new nest account');
		this.hasData = false;

		// Authenticate NestAccount
		this.authenticate()
			.then(() => {
				console.log('NestAccount: initialized', true);
			})
			.catch(() => {
				console.log('NestAccount: initialized', false);
				this.emit('initialized', false)
			});
	}

	/**
	 * Method to check if account is authenticated
	 * @returns {boolean|*}
	 */
	isAuthenticated() {
		return this.db.getAuth();
	}
	/**
	 * Method to check if account is properly initialized
	 * @returns {boolean|*}
	 */
	isAuthenticatedAndHasData() {
		return this.hasData && this.isAuthenticated();
	}

	/**
	 * Method that fetches metadata from Nest API.
	 * @returns {Promise}
	 */
	getMetadata() {
		return new Promise(resolve => {
			request({
				url: 'https://developer-api.nest.com/',
				method: 'GET',
				json: true,
				headers: {
					Authorization: 'Bearer ' + this.oauth2Account.accessToken
				}
			}, (err, res, body) => {
				if (err) return reject(err);
				if (body && body.hasOwnProperty('metadata') && body.metadata.hasOwnProperty('client_version'))
					this.client_version = body.metadata.client_version;
				return resolve(body);
			});
		})
	}

	/**
	 * Authenticate with Nest API using accessToken
	 * stored in this instance or if provided
	 * the parameter accessToken.
	 * @returns {Promise}
	 */
	authenticate() {
		return new Promise((resolve, reject) => {

			// Reject if no oauth2Account is found
			if (!this.oauth2Account) {

				console.error('NestAccount: authentication failed, no oauth2Account available');

				return reject('NestAccount: no oauth2Account available');
			}

			// Check if not authenticated yet
			if (!this.db.getAuth()) {

				// Authenticate using accessToken
				this.db.authWithCustomToken(this.oauth2Account.accessToken, err => {
					if (err) {

						console.error('NestAccount: failed to authenticate', err);

						return reject(err);
					}

					console.log('NestAccount: authentication successful');

					// Make sure account is saved in persistent storage
					Homey.ManagerSettings.set('oauth2Account', this.oauth2Account);

					// Update client_version
					this.getMetadata().then(() => {

						// Start listening for realtime updates from Nest API
						this._listenForRealtimeUpdates()
							.then(() => {

								// If no data was available before, emit initialized
								if (!this.hasData) {
									this.emit('initialized', true);
									this.hasData = true;
								}
								return resolve();
							})
							.catch(err => {
								return reject(err);
							});
					});
				});
			} else {
				return resolve();
			}
		});
	}

	/**
	 * Removes the authenticated connection between Homey and the Nest API.
	 * @returns {Promise}
	 */
	revokeAuthentication() {
		return new Promise((resolve, reject) => {

			// Unauth Firebase reference
			this.db.unauth();
			this.hasData = false;

			Homey.ManagerSettings.unset('oauth2Account');

			// Reset list of devices in NestAccount
			this.thermostats = [];
			this.smoke_co_alarms = [];
			this.cameras = [];

			// Reset list of of structures in NestAccount
			this.structures = [];

			// Post authorization url with needed credentials
			request.del(
				`https://api.home.nest.com/oauth2/access_tokens/${this.oauth2Account.accessToken}`, {}, (err, response) => {
					if (err || response.statusCode >= 400) {
						console.error(err || response.statusCode, 'NestAccount: failed to revoke authentication');
						return reject(err || response.statusCode);
					}

					console.log('NestAccount: authentication revoked');

					return resolve();
				}
			);
		});
	}

	/**
	 * Listen for changes on devices objects in database. When a
	 * change occurs, update device in register.
	 * @private
	 */
	_listenForRealtimeUpdates() {
		return new Promise((resolve, reject) => {

			console.log('NestAccount: start listening for incoming realtime updates');

			this.db.child('structures').on('value', snapshot => {
				this.registerStructures(snapshot);

				const promises = [];

				// New client version needed for cams
				if (this.client_version > 4) { // TODO check if this is latest client version without cam
					promises.push(new Promise(camerasResolve => {
						this.db.child('devices/cameras').on('value', camerasSnapshot => {
							this.registerDevices(camerasSnapshot, 'cameras');
							camerasResolve();
						});
					}));
				}

				promises.push(
					new Promise(thermostatsResolve => {
						this.db.child('devices/thermostats').on('value', thermostatsSnapshot => {
							this.registerDevices(thermostatsSnapshot, 'thermostats');
							thermostatsResolve();
						});
					}),
					new Promise(smokeCOAlarmsResolve => {
						this.db.child('devices/smoke_co_alarms').on('value', smokeCOAlarmsSnapshot => {
							this.registerDevices(smokeCOAlarmsSnapshot, 'smoke_co_alarms');
							smokeCOAlarmsResolve();
						});
					})
				);

				Promise.all(promises)
					.then(() => resolve())
					.catch(err => reject(err));
			});
		});
	}

	/**
	 * Registers devices in the register, if already present it will replace
	 * it with updated data. This makes sure that the device registers
	 * always have all the devices in the API registered and
	 * up-to-date.
	 * @param snapshot
	 * @param deviceType
	 */
	registerDevices(snapshot, deviceType) {
		const devices = snapshot.val();
		if (devices) {
			const foundDevices = [];

			// Loop over all devices in devices object
			_.forEach(devices, device => {

				// Extract single device
				device = snapshot.child(device.device_id).val();

				// Do not continue if device is invalid
				if (!device || !device.device_id || !device.name_long || !device.structure_id) return false;

				// Find structure
				const structure = _.findWhere(this.structures, {structure_id: device.structure_id});

				// Add device to its array
				foundDevices.push({
					device_id: device.device_id,
					name_long: device.name_long,
					structure_id: device.structure_id,
					structure_name: (structure) ? structure.name : null,
					nest_account: this,
				});
			});

			this[deviceType] = foundDevices;
		} else this[deviceType] = [];
	}

	/**
	 * Registers structures in the register, if already present it will replace
	 * it with updated data. This makes sure that the structures register
	 * always have all the structures in the API registered and
	 * up-to-date.
	 * @param snapshot
	 */
	registerStructures(snapshot) {
		const structures = snapshot.val();
		if (structures) {

			const foundStructures = [];

			// Loop over all structures in structure object
			_.forEach(structures, structure => {

				// Extract single structure
				structure = snapshot.child(structure.structure_id).val();

				// Get stored structure data
				const oldStructure = _.findWhere(this.structures, {structure_id: structure.structure_id});
				if (oldStructure) {

					// Loop over all keys and values in stored data
					for (const i in oldStructure) {

						// If old value and new value present but are different
						if (typeof oldStructure[i] !== 'undefined' &&
							typeof structure[i] !== 'undefined' &&
							oldStructure[i] !== structure[i]) {

							// Emit change
							this.emit(i, structure);
						}
					}
				}

				// Add structure to its array
				foundStructures.push({
					away: structure.away,
					name: structure.name,
					structure_id: structure.structure_id,
				});
			});

			this.structures = foundStructures;
		} else this.structures = [];
	}

	/**
	 * Factory method to return NestThermostat instance.
	 * @param deviceId
	 * @returns {NestThermostat}
	 */
	createThermostat(deviceId) {
		console.log(`NestAccount: create NestThermostat (${deviceId})`);
		const thermostat = _.findWhere(this.thermostats, {device_id: deviceId});
		if (thermostat) return new NestThermostat(thermostat);
		return undefined;
	}

	/**
	 * Factory method to return NestProtect instance.
	 * @param deviceId
	 * @returns {NestProtect}
	 */
	createProtect(deviceId) {
		console.log(`NestAccount: create NestProtect (${deviceId})`);
		const protect = _.findWhere(this.smoke_co_alarms, {device_id: deviceId});
		if (protect) return new NestProtect(protect);
		return undefined;
	}

	/**
	 * Factory method to return NestCam instance.
	 * @param deviceId
	 * @returns {NestCam}
	 */
	createCam(deviceId) {
		console.log(`NestAccount: create NestCam (${deviceId})`);
		const camera = _.findWhere(this.cameras, {device_id: deviceId});
		if (camera) return new NestCam(camera);
		return undefined;
	}
}

module.exports = NestAccount;
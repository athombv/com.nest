'use strict';

const EventEmitter = require('events');
const Firebase = require('firebase');
const request = require('request');
const _ = require('underscore');

/**
 * Class that represents a single Nest account. It requires an
 * accessToken and will keep up-to-date lists of all devices and
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
			if (authData === null) this.emit('unauthenticated');
			else this.emit('authenticated');
		});

		// Keep track of devices in Nest API
		this.thermostats = [];
		this.smoke_co_alarms = [];
		this.cameras = [];

		// Keep track of structures in Nest API
		this.structures = [];

		console.log('NestAccount: construct new nest account');

		// Authenticate NestAccount
		this.authenticate()
			.then(() => this.emit('initialized', true))
			.catch(() => this.emit('initialized', false));
	}

	/**
	 * Authenticate with Nest API using accessToken
	 * stored in this instance or if provided
	 * the parameter accessToken.
	 * @param accessToken
	 * @returns {Promise}
	 */
	authenticate(accessToken) {
		return new Promise((resolve, reject) => {

			// Store provided accessToken
			if (accessToken) this.accessToken = accessToken;

			// Reject if no accessToken is found
			if (!this.accessToken) {

				console.error('NestAccount: authentication failed, no access token available');

				return reject('NestAccount: no access token available');
			}

			// Check if not authenticated yet
			if (!this.db.getAuth()) {

				// Authenticate using accessToken
				this.db.authWithCustomToken(this.accessToken, err => {
					if (err) {

						console.error('NestAccount: failed to authenticate', err);

						return reject(err);
					}

					console.log('NestAccount: authentication successful');

					// Start listening for realtime updates from Nest API
					this._listenForRealtimeUpdates().then(() => resolve());
				});
			} else return resolve();
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

			// Remove stored access token
			Homey.manager('settings').unset('nestAccesstoken');

			// Reset list of devices in NestAccount
			this.thermostats = [];
			this.smoke_co_alarms = [];
			this.cameras = [];

			// Reset list of of structures in NestAccount
			this.structures = [];

			// Post authorization url with needed credentials
			request.del(
				`https://api.home.nest.com/oauth2/access_tokens/${this.accessToken}`, {}, (err, response) => {
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
		return new Promise(resolve => {

			console.log('NestAccount: start listening for incoming realtime updates');

			this.db.child('structures').on('value', snapshot => {
				this.registerStructures(snapshot);

				const promises = [];

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
					// ,
					// new Promise(camerasResolve => {
					//
					// 	this.db.child('devices/cameras').on('value', camerasSnapshot => {
					// 		this.registerDevices(camerasSnapshot, 'cameras');
					// 		camerasResolve();
					// 	});
					// })
				);

				Promise.all(promises).then(() => {
					resolve();
				});
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
				const structure = _.findWhere(this.structures, { structure_id: device.structure_id });

				// Add device to its array
				foundDevices.push({
					device_id: device.device_id,
					name_long: device.name_long,
					structure_id: device.structure_id,
					structure_name: (structure) ? structure.name : null,
					nest_account: this
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
				const oldStructure = _.findWhere(this.structures, { structure_id: structure.structure_id });
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
					structure_id: structure.structure_id
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
		const thermostat = _.findWhere(this.thermostats, { device_id: deviceId });
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
		const protect = _.findWhere(this.smoke_co_alarms, { device_id: deviceId });
		if (protect) return new NestProtect(protect);
		return undefined;
	}

	/**
	 * Factory method to return NestCamera instance.
	 * @param deviceId
	 * @returns {NestThermostat}
	 */
	createCamera(deviceId) {
		console.log(`NestAccount: create NestCamera (${deviceId})`);
		const camera = _.findWhere(this.cameras, { device_id: deviceId });
		if (camera) return new NestCamera(camera);
		return undefined;
	}
}

/**
 * Abstract class that handles all common functionality
 * for the NestThermostat, NestProtect and NestCamera.
 * It will listen for updates on the device, and call
 * the child's checkForChanges method to register changes
 * in data.
 */
class NestDevice extends EventEmitter {

	/**
	 * Creates a Nest device and starts listening
	 * for updates from the realtime database.
	 * Provide options object with device_id, device_type
	 * and db reference.
	 * @param options
	 */
	constructor(options) {
		super();

		// Check for valid options
		if (!options || !options.device_id || !options.device_type || !options.nest_account || !options.nest_account.db) {
			return console.error(options, 'NestDevice: could not construct NestDevice, invalid options object provided to constructor');
		}

		// Store provided options in this
		Object.assign(this, options);

		// Start listening for updates on this device
		this._listenForRealtimeUpdates();
	}

	get structure() {
		return _.findWhere(this.nest_account.structures, { structure_id: this.structure_id });
	}

	/**
	 * Listen for realtime updates from database.
	 * Call child's checkForChanges method with updated
	 * data to let it detect changes in data.
	 * @private
	 */
	_listenForRealtimeUpdates() {

		// Authenticate
		this.nest_account.authenticate().then(() => {

			// Listen for changes on this specific device
			this.nest_account.db.child(`devices/${this.device_type}`).child(this.device_id).on('value', this.checkForChanges.bind(this));
		});
	}

	/**
	 * Check incoming data update for changed values,
	 * emit corresponding events when data is changed.
	 * @param snapshot
	 */
	checkForChanges(snapshot) {
		const data = snapshot.val();

		// If no data in API indicate device is removed
		if (!data) return this.emit('removed');

		// Check if capabilities are set
		if (this.capabilities) {

			// Loop all registered capabilities
			this.capabilities.forEach(capability => {

				// Detect change in value and emit it
				if (typeof this[capability] !== 'undefined' &&
					typeof data.hasOwnProperty(capability) !== 'undefined' &&
					this[capability] !== data[capability]) {

					// Emit change
					this.emit(capability, data[capability]);
				}
			});

			// Assign all values from snapshot to this instance
			Object.assign(this, data);
		}
	}

	/**
	 * Clean up the instance.
	 */
	destroy() {
		this.nest_account.db.child(`devices/${this.device_type}`).child(this.device_id).off('value', this.checkForChanges);
		console.log(`NestDevice: destroyed device ${this.device_id}`);
	}
}

/**
 * Class representing NestThermostat, extends
 * NestDevice.
 */
class NestThermostat extends NestDevice {

	/**
	 * Pass options object to NestDevice.
	 * @param options
	 */
	constructor(options) {

		// Set proper device type
		if (options) options.device_type = 'thermostats';

		super(options);

		// Store capabilities of thermostat
		this.capabilities = ['target_temperature_c', 'ambient_temperature_c', 'humidity', 'hvac_state'];
	}

	/**
	 * Set the target temperature of this Nest Thermostat.
	 * @param temperature in Celsius
	 */
	setTargetTemperature(temperature) {
		return new Promise((resolve, reject) => {

			// Authenticate
			this.nest_account.authenticate().then(() => {

				// Handle cases where temperature could not be set
				if (this.is_using_emergency_heat) {
					return reject(__('error.emergency_heat', {
						temp: temperature,
						name: this.name_long
					}));
				}
				if (this.structure.away !== 'home') {
					return reject(__('error.structure_is_away', {
						temp: temperature,
						name: this.name_long
					}));
				}
				if (this.hvac_mode === 'heat-cool') {
					return reject(__('error.hvac_mode_is_cool', {
						temp: temperature,
						name: this.name_long
					}));
				}
				if (this.is_locked && (temperature < this.locked_temp_min_c || temperature > this.locked_temp_max_c)) {
					return reject(__('error.temp_lock', {
						temp: temperature,
						min: this.locked_temp_min_c,
						max: this.locked_temp_max_c,
						name: this.name_long
					}));
				}

				// All clear to change the target temperature
				this.nest_account.db.child(`devices/thermostats/${this.device_id}/target_temperature_c`).set(temperature);

				return resolve(temperature);
			}).catch(err => console.error(err));
		});
	}
}

/**
 * Class representing NestProtect, extends
 * NestDevice.
 */
class NestProtect extends NestDevice {

	/**
	 * Pass options object to NestDevice.
	 * @param options
	 */
	constructor(options) {

		// Set proper device type
		if (options) options.device_type = 'smoke_co_alarms';

		super(options);

		// Store capabilities of protect
		this.capabilities = ['battery_health', 'co_alarm_state', 'smoke_alarm_state'];
	}
}

/**
 * Class representing NestCamera, extends
 * NestDevice.
 */
class NestCamera extends NestDevice {

	/**
	 * Pass options object to NestDevice.
	 * @param options
	 */
	constructor(options) {

		// Set proper device type
		if (options) options.device_type = 'cameras';

		super(options);

		// Store capabilities of camera
		this.capabilities = ['last_event', 'is_streaming'];
	}

	/**
	 * Set streaming capability of camera.
	 * @param onoff Boolean
	 */
	setStreaming(onoff) {

		// Authenticate
		this.nest_account.authenticate().then(() => {

			if (typeof onoff !== 'boolean') console.error('NestCamera: setStreaming parameter "onoff" is not a boolean', onoff);

			// All clear to change the target temperature
			this.nest_account.db.child(`devices/cameras/${this.device_id}/is_streaming`).set(onoff);
		});
	}
}

module.exports = { NestAccount, NestThermostat, NestProtect };

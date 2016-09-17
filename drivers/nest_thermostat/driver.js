'use strict';

const semver = require('semver');

let devices = [];

/**
 * Initially store devices present on Homey, and try to authenticate.
 * @param devicesData
 * @param callback
 */
module.exports.init = (devicesData, callback) => {

	// Mark all devices as unavailable
	if (devicesData) devicesData.forEach(deviceData => module.exports.setUnavailable(deviceData, __('reconnecting')));

	// Wait for nest account to be initialized
	Homey.app.nestAccountInitialization.then(authenticated => {

		// Listen for authentication events
		Homey.app.nestAccount
			.on('authenticated', () => {
				devices.forEach(device => {

					// If device is not yet initialized
					if (!device.initialized) {
						initDevice(device.data);
					} else {
						module.exports.setAvailable(device.data);
					}
				});
			})
			.on('unauthenticated', () => {
				devices.forEach(device => module.exports.setUnavailable(device.data, __('unauthenticated')));
			});

		// Nest account authenticated
		if (authenticated) {
			devicesData.forEach(deviceData => initDevice(deviceData));
		} else {
			devicesData.forEach(deviceData => {

				// Store device and mark as not initialized
				devices.push({ data: deviceData, initialized: false });
				module.exports.setUnavailable(deviceData, __('unauthenticated'));
			});
		}
	});

	registerFlowListeners();

	// Ready
	callback(null, true);
};

module.exports.pair = socket => {

	/**
	 * Passes credentials to front-end, to be used to construct the authorization url,
	 * gets called when user initiates pairing process.
	 */
	socket.on('authenticate', (data, callback) => {
		if (Homey.manager('settings').get('nestAccesstoken')) return callback(null, true);

		// Start fetching access token flow
		Homey.app.fetchAccessToken(result => {
			callback(null, result);
		}).then(accessToken => {

			// Store new token
			Homey.manager('settings').set('nestAccesstoken', accessToken);

			// Authenticate nest account
			Homey.app.nestAccount.authenticate(accessToken).then(() => socket.emit('authenticated'));
		});
	});

	/**
	 * Called when user is presented the list_devices template,
	 * this function fetches relevant data from devices and passes
	 * it to the front-end.
	 */
	socket.on('list_devices', (data, callback) => {
		const devicesList = [];
		Homey.app.nestAccount.thermostats.forEach(thermostat => {
			devicesList.push({
				name: thermostat.name_long,
				data: {
					id: thermostat.device_id,
					appVersion: Homey.app.appVersion
				}
			});
		});
		callback(null, devicesList);
	});
};

/**
 * These represent the capabilities of the Nest Thermostat.
 */
module.exports.capabilities = {

	target_temperature: {
		get: (deviceData, callback) => {
			if (deviceData instanceof Error) return callback(deviceData);

			// Get device data
			const thermostat = getDevice(deviceData);
			if (thermostat
				&& thermostat.hasOwnProperty('client')
				&& thermostat.client.hasOwnProperty('target_temperature_c')) {
				return callback(null, thermostat.client.target_temperature_c);
			}
			return callback('Could not find device');
		},
		set: (deviceData, temperature, callback) => {
			if (deviceData instanceof Error) return callback(deviceData);

			// Fix temperature range
			// TODO remove this once custom temperature range can be set
			if (temperature < 9) temperature = 9;
			else if (temperature > 32) temperature = 32;
			temperature = Math.round(temperature * 2) / 2;

			// Get device data
			const thermostat = getDevice(deviceData);
			if (thermostat
				&& thermostat.hasOwnProperty('client')) {
				thermostat.client.setTargetTemperature(temperature)
					.then(() => callback(null, temperature))
					.catch(err => {
						console.error(err);
						Homey.app.registerLogItem({ msg: err, timestamp: new Date() });
						return callback(err);
					});
			}

			return callback(true);
		}
	},

	measure_temperature: {
		get: (deviceData, callback) => {
			if (deviceData instanceof Error) return callback(deviceData);

			// Get device data
			const thermostat = getDevice(deviceData);
			if (thermostat
				&& thermostat.hasOwnProperty('client')
				&& thermostat.client.hasOwnProperty('ambient_temperature_c')
			) {
				return callback(null, thermostat.client.ambient_temperature_c);
			} else return callback('Could not find device');
		}
	},

	measure_humidity: {
		get: (deviceData, callback) => {
			if (deviceData instanceof Error) return callback(deviceData);

			// Get device data
			const thermostat = getDevice(deviceData);
			if (thermostat
				&& thermostat.hasOwnProperty('client')
				&& thermostat.client.hasOwnProperty('humidity')
			) {
				return callback(null, thermostat.client.humidity);
			}
			return callback('Could not find device');
		}
	}
};

/**
 * Added a device, store it internally.
 * @param deviceData
 * @param callback
 */
module.exports.added = (deviceData, callback) => {
	initDevice(deviceData);
	callback(null, true);
};

/**
 * Delete devices internally when users removes one
 * @param deviceData
 */
module.exports.deleted = (deviceData) => {

	// Reset array with device removed and deregister push event subscription
	devices = devices.filter(device => {

		// Destroy device
		if (device.data.id === deviceData.id) device.client.destroy();

		// Return filtered devices array
		return device.data.id !== deviceData.id;
	});
};

/**
 * Initialize device, setup client, and event listeners.
 * @param deviceData
 * @returns {*}
 */
function initDevice(deviceData) {

	// If device was added below 2.0.0 make sure to re-pair
	if (!deviceData.hasOwnProperty('appVersion') || !deviceData.appVersion || !semver.gte(deviceData.appVersion, '2.0.0')) return module.exports.setUnavailable(deviceData, __('version_repair'));

	// Create thermostat
	const client = Homey.app.nestAccount.createThermostat(deviceData.id);

	// If client construction failed, set device unavailable
	if (!client) return module.exports.setUnavailable(deviceData, __('removed_externally'));

	// Subscribe to events on data change
	client
		.on('target_temperature_c', targetTemperatureC => {
			module.exports.realtime(deviceData, 'target_temperature', targetTemperatureC);
		})
		.on('ambient_temperature_c', ambientTemperatureC => {
			module.exports.realtime(deviceData, 'measure_temperature', ambientTemperatureC);
		})
		.on('humidity', humidity => {
			module.exports.realtime(deviceData, 'measure_humidity', humidity);
		})
		.on('hvac_state', hvacState => {

			// Trigger the hvac_status_changed flow
			Homey.manager('flow').triggerDevice('hvac_status_changed', {}, hvacState, deviceData, err => {
				if (err) return Homey.error(err);
			});
		})
		.on('removed', () => {
			module.exports.setUnavailable(deviceData, __('removed_externally'));
		});

	// Store it
	const device = getDevice(deviceData);
	if (device) {
		device.client = client;
		device.initialized = true;
	} else devices.push({ data: deviceData, client: client, initialized: true });

	module.exports.setAvailable(deviceData);
}

/**
 * Registers flow listeners in order to parse incoming
 * flow events.
 */
function registerFlowListeners() {

	// When triggered, get latest structure data and check status
	Homey.manager('flow').on('condition.hvac_status', (callback, args) => {

		// Check for proper incoming arguments
		if (args && args.hasOwnProperty('status') && args.hasOwnProperty('deviceData')) {

			// Get device
			const device = getDevice(args.deviceData);
			callback(null, device && device.client.hvac_state === args.status);
		} else callback(true);
	});

	// Parse flow trigger when hvac status changed
	Homey.manager('flow').on('trigger.hvac_status_changed', (callback, args) => {

		// Check for proper incoming arguments
		if (args && args.hasOwnProperty('status') && args.hasOwnProperty('deviceData')) {

			// Get device
			const device = getDevice(args.deviceData);
			callback(null, device && device.client.hvac_state === args.status);
		} else callback(true);
	});
}

/**
 * Gets a device based on an id
 * @param deviceData
 * @returns {*}
 */
function getDevice(deviceData) {

	// If only id provided
	if (typeof deviceData !== 'object') deviceData = { id: deviceData };

	// Loop over devices
	return devices.find(device => device.data.id === deviceData.id);
}

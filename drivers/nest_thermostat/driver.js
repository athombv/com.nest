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
	if (devicesData) {
		devicesData.forEach(deviceData => {
			module.exports.setUnavailable(deviceData, __('reconnecting'));
		});
	}

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

		// Ready
		callback(null, true);
	});

	registerFlowListeners();
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
		let devicesList = [];

		Homey.app.nestAccount.thermostats.forEach(thermostat => {
			devicesList.push({
				name: (Homey.app.nestAccount.structures.length > 1 && thermostat.structure_name) ? `${thermostat.name_long} - ${thermostat.structure_name}` : thermostat.name_long,
				data: {
					id: thermostat.device_id,
					appVersion: Homey.app.appVersion,
				},
			});
		});
		if (devicesList.length === 0) return callback(__('pair.no_devices_found'));
		return callback(null, devicesList);
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
			} else return callback('No Nest client found');
		},
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
			}
			return callback('Could not find device');
		},
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
		},
	},
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
		if (device.data.id === deviceData.id && device.client) device.client.destroy();

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
			Homey.manager('flow').triggerDevice('hvac_status_changed', {}, deviceData, deviceData, (err) => {
				if (err) return Homey.error('Error triggeringDevice:', err);
			});
		})
		.on('hvac_mode', hvacMode => {

        	// Trigger the hvac_mode_changed flow
        	Homey.manager('flow').triggerDevice('hvac_mode_changed', {}, deviceData, deviceData, (err) => {
        		if (err) return Homey.error('Error triggeringDevice:', err);
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
	} else devices.push({ data: deviceData, client, initialized: true });

	module.exports.setAvailable(deviceData);
}

/**
 * Registers flow listeners in order to parse incoming
 * flow events.
 */
function registerFlowListeners() {

	// When triggered, get latest structure data and check status
	Homey.manager('flow').on('condition.hvac_status', (callback, args, state) => {

		// Check for proper incoming arguments
		if (args && args.hasOwnProperty('status') && args.hasOwnProperty('deviceData')) {

			// Get device
			const device = getDevice(args.deviceData);
			callback(null, device && device.client.hvac_state === args.status);
		} else callback('invalid arguments and or state provided');
	});

    // When triggered, get latest structure data and check status
    Homey.manager('flow').on('condition.hvac_mode', (callback, args, state) => {

        // Check for proper incoming arguments
        if (args && args.hasOwnProperty('mode') && args.hasOwnProperty('deviceData')) {

        	// Get device
        	const device = getDevice(args.deviceData)
        	callback(null, device && device.client.hvac_mode === args.mode);
    	} else callback('invalid arguments and or state provided');
	});

	// Parse flow trigger when hvac status changed
	Homey.manager('flow').on('trigger.hvac_status_changed', (callback, args, state) => {

		// Check for proper incoming arguments
		if (args && args.hasOwnProperty('status') && state) {

			// Get device
			const device = getDevice(state);
			callback(null, device && device.client.hvac_state === args.status);
		} else callback('invalid arguments and or state provided');
	});

    // Parse flow trigger when hvac mode changed
    Homey.manager('flow').on('trigger.hvac_mode_changed', (callback, args, state) => {

        // Check for proper incoming arguments
        if (args && args.hasOwnProperty('mode') && state) {

        	// Get device
        	const device = getDevice(state);
        	callback(null, device && device.client.hvac_mode === args.mode);
    	} else callback('invalid arguments and or state provided');
	});

    // Set hvac mode
    Homey.manager('flow').on('action.hvac_mode', (callback, args, state) => {

        // Check for proper incoming arguments
        if (args && args.hasOwnProperty('mode') && args.hasOwnProperty('deviceData')) {

        	// Get device
        	const thermostat = getDevice(args.deviceData);

			if (thermostat
				&& thermostat.hasOwnProperty('client')) {
				thermostat.client.setHvacMode(args.mode)
					.then(() => callback(null, args.mode))
					.catch(err => {
						console.error(err);
						Homey.app.registerLogItem({ msg: err, timestamp: new Date() });
						return callback(err);
					});
			} else return callback('No Nest client found');
    	} else callback('invalid arguments and or state provided');
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

'use strict';

let devices = [];

/**
 * Initially store devices present on Homey, and try to authenticate.
 * @param devicesData
 * @param callback
 */
module.exports.init = (devicesData, callback) => {

	// Mark all devices as unavailable
	devicesData.forEach(deviceData => module.exports.setUnavailable(deviceData, __('reconnecting')));

	// Wait for nest account to be initialized
	Homey.app.nestAccount.on('initialized', () => {
		devicesData.forEach(deviceData => {
			initDevice(deviceData);
		});
	});

	// Listen for authentication events
	Homey.app.nestAccount
		.on('authenticated', () => {
			devices.forEach(device => module.exports.setAvailable(device.data));
		})
		.on('unauthenticated', () => {
			devices.forEach(device => module.exports.setUnavailable(device.data, __('unauthenticated')));
		});

	// When triggered, get latest structure data and check status
	Homey.manager('flow').on('condition.hvac_status', (callback, args) => {

		// Check for proper incoming arguments
		if (args && args.hasOwnProperty('status') && args.hasOwnProperty('deviceData')) {

			// Get device
			const device = getDevice(args.deviceData);

			callback(null, device && device.state.hvac_state === args.status);
		}
	});

	// Parse flow trigger when hvac status changed
	Homey.manager('flow').on('trigger.hvac_status_changed', (callback, args) => {

		// Check for proper incoming arguments
		if (args != null && args.hasOwnProperty('status') && args.hasOwnProperty('deviceData')) {

			// Get device
			const device = getDevice(args.deviceData);

			callback(null, device && device.state.hvac_state === args.status);
		}
	});

	// Ready
	callback(true);
};

module.exports.pair = socket => {

	/**
	 * Passes credentials to front-end, to be used to construct the authorization url,
	 * gets called when user initiates pairing process
	 */
	socket.on('authenticate', (data, callback) => {
		if (Homey.manager('settings').get('nestAccessToken')) return callback(null, true);

		// Start fetching access token flow
		Homey.app.fetchAccessToken(result => {
			callback(null, result);
		}).then(accessToken => {
			Homey.manager('settings').set('nestAccessToken', accessToken);
			socket.emit('authenticated');
		});
	});

	/**
	 * Called when user is presented the list_devices template,
	 * this function fetches relevant data from devices and passes
	 * it to the front-end
	 */
	socket.on('list_devices', (data, callback) => {
		const devicesList = [];
		Homey.app.nestAccount.thermostats.forEach(thermostat => {
			devicesList.push({
				name: thermostat.name_long,
				data: {
					id: thermostat.device_id
				}
			});
		});

		callback(null, devicesList);
	});
};

/**
 * These represent the capabilities of the Nest Thermostat
 */
module.exports.capabilities = {

	target_temperature: {
		get: (deviceData, callback) => {
			if (deviceData instanceof Error) return callback(deviceData);

			// Get device data
			const thermostat = getDevice(deviceData);
			if (thermostat) return callback(null, thermostat.client.target_temperature_c);
			return callback('Could not find device');
		},
		set: (deviceData, temperature, callback) => {
			if (deviceData instanceof Error) return callback(deviceData);

			// Fix temperature range
			if (temperature < 9) temperature = 9;
			else if (temperature > 32) temperature = 32;
			temperature = Math.round(temperature * 2) / 2;

			// Get device data
			const thermostat = getDevice(deviceData);
			if (thermostat) {
				thermostat.client.setTargetTemperature(temperature)
					.then(() => callback(null, temperature))
					.catch(err => {
						console.error('Failed to set target temperature', err);
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
			if (thermostat) callback(null, thermostat.client.ambient_temperature_c);
			else callback('Could not find device');
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
	devices = devices.filter(device => device.data.id !== deviceData.id);
};

function initDevice(deviceData) {

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
		.on('removed', () => {
			module.exports.setUnavailable(deviceData, __('removed_externally'));
		});

	// Store it
	devices.push({ data: deviceData, client: client });

	module.exports.setAvailable(deviceData);
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

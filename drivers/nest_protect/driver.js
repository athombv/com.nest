'use strict';

const semver = require('semver');

let devices = [];

/**
 * Initially store devices present on Homey, and try to authenticate
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

					// Check if devices need re-initialisation
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

		// Nest account is authenticated, add all devices
		if (authenticated) {
			devicesData.forEach(deviceData => initDevice(deviceData));
		} else {

			// Store it as not-initialized
			devicesData.forEach(deviceData => {
				devices.push({ data: deviceData, initialized: false });
				module.exports.setUnavailable(deviceData, __('unauthenticated'));
			});
		}
	});

	// Ready
	callback();
};

module.exports.pair = socket => {

	/**
	 * Passes credentials to front-end, to be used to construct the authorization url,
	 * gets called when user initiates pairing process
	 */
	socket.on('authenticate', (data, callback) => {
		if (Homey.manager('settings').get('nestAccesstoken')) return callback(null, true);

		// Start fetching access token flow
		Homey.app.fetchAccessToken(result => {
			callback(null, result);
		}).then(accessToken => {

			// Store access token
			Homey.manager('settings').set('nestAccesstoken', accessToken);

			// Authenticate nest account
			Homey.app.nestAccount.authenticate(accessToken).then(() => {
				socket.emit('authenticated');
			});
		});
	});

	/**
	 * Called when user is presented the list_devices template,
	 * this function fetches relevant data from devices and passes
	 * it to the front-end
	 */
	socket.on('list_devices', (data, callback) => {
		const devicesList = [];
		Homey.app.nestAccount.smoke_co_alarms.forEach(thermostat => {
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
 * These represent the capabilities of the Nest Protect
 */
module.exports.capabilities = {

	alarm_co: {
		get: (deviceData, callback) => {
			if (deviceData instanceof Error) return callback(deviceData);

			// Get device data
			const protect = getDevice(deviceData);
			if (protect
				&& protect.hasOwnProperty('client')
				&& protect.client.hasOwnProperty('co_alarm_state')) {
				return callback(null, protect.client.co_alarm_state !== 'ok');
			}
			return callback('Could not find device');
		},
	},

	alarm_smoke: {
		get: (deviceData, callback) => {
			if (deviceData instanceof Error) return callback(deviceData);

			// Get device data
			const protect = getDevice(deviceData);
			if (protect
				&& protect.hasOwnProperty('client')
				&& protect.client.hasOwnProperty('smoke_alarm_state')) {
				return callback(null, protect.client.smoke_alarm_state !== 'ok');
			}
			return callback('Could not find device');
		},
	},

	alarm_battery: {
		get: (deviceData, callback) => {
			if (deviceData instanceof Error) return callback(deviceData);

			// Get device data
			const protect = getDevice(deviceData);
			if (protect
				&& protect.hasOwnProperty('client')
				&& protect.client.hasOwnProperty('battery_health')) {
				return callback(null, protect.client.battery_health !== 'ok');
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
 * Delete devices internally when users removes one.
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
	const client = Homey.app.nestAccount.createProtect(deviceData.id);

	// If client construction failed, set device unavailable
	if (!client) return module.exports.setUnavailable(deviceData, __('removed_externally'));

	// Subscribe to events on data change
	client
		.on('co_alarm_state', coAlarmState => {
			if (!((client.co_alarm_state === 'warning' ||
				client.co_alarm_state === 'emergency') &&
				(coAlarmState === 'warning' ||
				coAlarmState === 'emergency'))) {

				console.log(`realtime alarm_co: ${(coAlarmState !== 'ok')}`);

				module.exports.realtime(deviceData, 'alarm_co', (coAlarmState !== 'ok'));
			}
		})
		.on('smoke_alarm_state', smokeAlarmState => {
			if (!((client.smoke_alarm_state === 'warning' ||
				client.smoke_alarm_state === 'emergency') &&
				(smokeAlarmState === 'warning' ||
				smokeAlarmState === 'emergency'))) {

				module.exports.realtime(deviceData, 'alarm_smoke', (smokeAlarmState !== 'ok'));
			}
		})
		.on('battery_health', batteryHealth => {
			module.exports.realtime(deviceData, 'alarm_battery', (batteryHealth !== 'ok'));
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

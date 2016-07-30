'use strict';

let devices = [];

/**
 * Initially store devices present on Homey, and try to authenticate
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
		Homey.app.nestAccount.smoke_co_alarms.forEach(thermostat => {
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
 * These represent the capabilities of the Nest Protect
 */
module.exports.capabilities = {

	alarm_co: {
		get: (deviceData, callback) => {
			if (deviceData instanceof Error) return callback(deviceData);

			// Get device data
			const protect = getDevice(deviceData);
			if (protect) return callback(null, protect.client.co_alarm_state !== 'ok');
			return callback('Could not find device');
		}
	},

	alarm_smoke: {
		get: (deviceData, callback) => {
			if (deviceData instanceof Error) return callback(deviceData);

			// Get device data
			const protect = getDevice(deviceData);
			if (protect) return callback(null, protect.client.smoke_alarm_state !== 'ok');
			return callback('Could not find device');
		}
	},

	alarm_battery: {
		get: (deviceData, callback) => {
			if (deviceData instanceof Error) return callback(deviceData);

			// Get device data
			const protect = getDevice(deviceData);
			if (protect) return callback(null, protect.client.battery_health !== 'ok');
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
	devices = devices.filter(device => device.data.id !== deviceData.id);
};

function initDevice(deviceData) {

	// Create thermostat
	const client = Homey.app.nestAccount.createProtect(deviceData.id);

	// Subscribe to events on data change
	client.on('co_alarm_state', coAlarmState => {
		if (!((client.co_alarm_state === 'warning' ||
			client.co_alarm_state === 'emergency') &&
			(coAlarmState === 'warning' ||
			coAlarmState === 'emergency'))) {

			module.exports.realtime(deviceData, 'alarm_co', (coAlarmState !== 'ok'));
		}
	}).on('smoke_alarm_state', smokeAlarmState => {
		if (!((client.smoke_alarm_state === 'warning' ||
			client.smoke_alarm_state === 'emergency') &&
			(smokeAlarmState === 'warning' ||
			smokeAlarmState === 'emergency'))) {

			module.exports.realtime(deviceData, 'alarm_smoke', (smokeAlarmState !== 'ok'));
		}
	}).on('battery_health', batteryHealth => {
		module.exports.realtime(deviceData, 'alarm_battery', (batteryHealth !== 'ok'));
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

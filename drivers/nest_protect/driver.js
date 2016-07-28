/**
 * Import nest driver and underscore
 */
var nestDriver = require('./../../app.js');
var _ = require('underscore');

/**
 * devices stores all devices registered on the users nest account
 * installedDevices is an array holding the ID's of installed devices
 */
var devices = [];
var installedDevices = [];

/**
 * Initially store devices present on Homey, and try to authenticate
 * @param devices_data
 * @param callback
 */
module.exports.init = function (devices_data, callback) {

	// Pass already installed devices to nestDriver
	devices_data.forEach(function (device_data) {

		// Register installed devices
		installedDevices.push(device_data.id);
	});

	// Authenticate
	nestDriver.authWithToken(function (success) {
		if (success) {
			// Already authorized
			Homey.log('Authorization with Nest successful');
		}
		else {
			// Get new access_token and authenticate with Nest
			Homey.log('Initializing driver failed, try adding devices.');
		}
	});

	// Fetch data
	nestDriver.fetchDeviceData('smoke_co_alarms', devices);

	// And keep listening for updated data
	nestDriver.events.on('smoke_co_alarms_devices', function (data) {

		// Get all devices from api
		devices = _.filter(data [0], function (val) {
			return _.some(this, function (val2) {
				return val2 === val.data.id;
			});
		}, data [1]);

		// Check for each device if unreachable and check if installedDevices contains unreachable device
		installedDevices.forEach(function (device_id) {
			nestDriver.registerDeviceReachability(data[0], data[1], installedDevices, device_id);
		});

		// Update to usable installed devices
		installedDevices = _.intersection(installedDevices, data[1]);
	});

	// Handle not authenticated by disabling devices
	nestDriver.events.on('not_authenticated', function () {

		// Not authenticated with Nest, so no devices in API available
		installedDevices.forEach(function (device_id) {
			nestDriver.registerDeviceReachability(devices, [], installedDevices, device_id);
		});
	});

	// Handle authenticated, to re-enable devices
	nestDriver.events.on('authenticated', function () {
		nestDriver.fetchDeviceData('smoke_co_alarms', devices);
	});

	// Start listening to alarms
	listenForAlarms();

	// Ready
	callback(true);
};

module.exports.pair = function (socket) {

	/**
	 * Passes credentials to front-end, to be used to construct the authorization url,
	 * gets called when user initiates pairing process
	 */
	socket.on("authenticate", function (data, callback) {

		// Authenticate using access_token
		nestDriver.authWithToken(function (success) {
			if (success) {
				Homey.log('Authorization with Nest successful');

				// Fetch data
				nestDriver.fetchDeviceData('smoke_co_alarms', devices);

				// Continue to list devices
				callback(null, true);
			}
			else {

				// Get new access_token and authenticate with Nest
				nestDriver.fetchAccessToken(function (result) {
					callback(null, result);
				}, socket);
			}
		});
	});

	/**
	 * Called when user is presented the list_devices template,
	 * this function fetches relevant data from devices and passes
	 * it to the front-end
	 */
	socket.on('list_devices', function (data, callback) {

		// Fetch data
		nestDriver.fetchDeviceData('smoke_co_alarms', devices, function () {
			// Create device list from found devices
			var devices_list = [];
			devices.forEach(function (device) {
				devices_list.push({
					data: {
						id: device.data.id
					},
					name: device.name
				});
			});

			// Return list to front-end
			callback(null, devices_list);
		});
	});

	/**
	 * When a user adds a device, make sure the driver knows about it
	 */
	socket.on('add_device', function (device, callback) {

		// Mark device as installed
		installedDevices.push(device.data.id);

		// Start listening for alarms
		listenForAlarms();
	});
};

/**
 * These represent the capabilities of the Nest Protect
 */
module.exports.capabilities = {

	alarm_co: {
		get: function (device_data, callback) {
			if (device_data instanceof Error) return callback(device_data);

			// Check if authenticated
			nestDriver.authWithToken();

			// Get device data
			var protect = nestDriver.getDevice(devices, installedDevices, device_data.id);
			if (!protect) return callback(device_data);

			var value = (protect.data.co_alarm_state !== 'ok' && protect.data.hasOwnProperty("alarm_co"));

			if (callback) callback(null, value);

			// Return casted boolean of co_alarm (int)
			return value;
		}
	},

	alarm_smoke: {
		get: function (device_data, callback) {
			if (device_data instanceof Error) return callback(device_data);

			// Check if authenticated
			nestDriver.authWithToken();

			// Get device data
			var protect = nestDriver.getDevice(devices, installedDevices, device_data.id);
			if (!protect) return callback(device_data);

			var value = (protect.data.smoke_alarm_state !== 'ok' && protect.data.hasOwnProperty("alarm_smoke"));

			if (callback) callback(null, value);

			// Return casted boolean of smoke_alarm_state (int)
			return value;
		}
	},

	alarm_battery: {
		get: function (device_data, callback) {
			if (device_data instanceof Error) return callback(device_data);

			// Check if authenticated
			nestDriver.authWithToken();

			// Get device data
			var protect = nestDriver.getDevice(devices, installedDevices, device_data.id);
			if (!protect) return callback(device_data);

			var value = (protect.data.battery_health !== 'ok' && protect.data.hasOwnProperty("battery_health"));

			if (callback) callback(null, value);

			// Return casted boolean of battery_health (int)
			return value;
		}
	}
};

/**
 * When a device gets deleted, make sure to clean up
 * @param device_data
 */
module.exports.deleted = function (device_data) {

	// Remove ID from installed devices array
	for (var x = 0; x < installedDevices.length; x++) {
		if (installedDevices[x] === device_data.id) {
			installedDevices = _.reject(installedDevices, function (id) {
				return id === device_data.id;
			});
		}
	}
};

/**
 * Disables previous connections and creates new listeners on the updated set of installed devices
 */
function listenForAlarms() {

	// Listen for incoming value events
	nestDriver.socket.child('devices/smoke_co_alarms').once('value', function (snapshot) {
			for (var id in snapshot.val()) {

				// Get device
				var device = snapshot.child(id);

				// Get device id
				var device_id = snapshot.child(id).child('device_id').val();

				// Only listen on added device
				if (nestDriver.getDevice(devices, installedDevices, device_id)) {

					// Activate listeners
					listenForSmokeAlarms(device);
					listenForCOAlarms(device);
					listenForBatteryAlarms(device);
				}
			}
		}
	);
};

/**
 * Listen for smoke alarms on a Protect
 */
function listenForSmokeAlarms(device) {
	var deviceState = null;

	// Listen on changes to smoke_alarm_state
	device.child('smoke_alarm_state').ref().on('value', function (state) {

		// Get device data
		var stored_device = nestDriver.getDevice(devices, installedDevices, device.child('device_id').val());
		var device_data = (stored_device) ? stored_device.data : null;

		// Act on the state change of the device
		switch (state.val()) {
			case 'warning':
				if (deviceState && deviceState !== 'warning' && device_data) { // only alert the first change

					// Update alarm_co2
					module.exports.realtime({id:device_data.id}, 'alarm_smoke', true);
				}
				break;
			case 'emergency':
				if (deviceState && deviceState !== 'emergency' && device_data) { // only alert the first change

					// Update alarm_co2
					module.exports.realtime({id:device_data.id}, 'alarm_smoke', true);
				}
				break;
			default:
				if (deviceState) {

					// Update alarm_co2
					module.exports.realtime({id:device_data.id}, 'alarm_smoke', false);
				}
		}

		// Reset deviceState to prevent multiple events from one change
		deviceState = state.val();
	});
};

/**
 * Listen for CO alarms on a Protect
 */
function listenForCOAlarms(device) {
	var deviceState = null;

	// Start listening on co_alarm_state changes
	device.child('co_alarm_state').ref().on('value', function (state) {

		// Get device data
		var stored_device = nestDriver.getDevice(devices, installedDevices, device.child('device_id').val());
		var device_data = (stored_device) ? stored_device.data : null;

		// Act on device state change
		switch (state.val()) {
			case 'warning':
				if (deviceState && deviceState !== 'warning' && device_data) { // only alert the first change

					// Update alarm_co
					module.exports.realtime({id:device_data.id}, 'alarm_co', true);
				}
				break;
			case 'emergency':
				if (deviceState && deviceState !== 'emergency' && device_data) { // only alert the first change

					// Update alarm_co
					module.exports.realtime({id:device_data.id}, 'alarm_co', true);
				}
				break;
			default:
				if (deviceState) {

					// Update alarm_co
					module.exports.realtime({id:device_data.id}, 'alarm_co', false);
				}
		}

		// Reset deviceState to prevent multiple events from one change
		deviceState = state.val();
	});
};

/**
 * Listen for low battery on a Protect
 */
function listenForBatteryAlarms(device) {
	var deviceState = null;

	// Start listening for changes on battery_health
	device.child('battery_health').ref().on('value', function (state) {

		// Get device data
		var stored_device = nestDriver.getDevice(devices, installedDevices, device.child('device_id').val());
		var device_data = (stored_device) ? stored_device.data : null;

		// Don't show battery alerts if a more
		// important alert is already showing
		if (state.val() === 'replace' &&
			device_data && deviceState && deviceState !== 'replace'
		) {

			// Update battery_empty
			module.exports.realtime({id:device_data.id}, 'alarm_battery', true);

			// Update state
			deviceState = state.val();
		}
		else if (deviceState) {

			// Update battery_empty
			module.exports.realtime({id:device_data.id}, 'alarm_battery', false);

			// Update state
			deviceState = 'good';
		}

		// Reset deviceState to prevent multiple events from one change
		if (state.val() != null) deviceState = state.val();
	});
};
"use strict";

/**
 * Include necessary dependencies
 */
var Firebase = require('firebase');
var request = require('request');
var _ = require('underscore');
var events = require('events');

/**
 * Declare static nest driver variables
 * @type {Object}
 */
var nestDriver = {
	socket: new Firebase('wss://developer-api.nest.com'),
	credentials: {clientID: Homey.env.NEST_CLIENT_ID, clientSecret: Homey.env.NEST_CLIENT_SECRET},
	events: new events.EventEmitter()
};

/**
 * Authenticate with Nest using access_token
 * @param callback
 */
nestDriver.authWithToken = function (callback) {

	// If already authenticated
	if (!nestDriver.socket.getAuth()) {

		// Authenticate using access_token
		nestDriver.socket.authWithCustomToken(Homey.manager("settings").get("nestAccesstoken") || '', function (err) {
			if (err) {
				if (callback) callback(null);

				// Emit not authenticate, to disable all devices
				nestDriver.events.emit('not_authenticated');
			}
			else {
				if (callback) callback(true);
			}
		});
	}
	else {
		if (callback)callback(true);
	}
};

/**
 * Starts OAuth2 flow with Nest to get authorization url
 * @param callback
 */
nestDriver.fetchAuthorizationURL = function (callback) {

	// Generate OAuth2 callback, this helps to catch the authorization token
	Homey.manager('cloud').generateOAuth2Callback('https://home.nest.com/login/oauth2?client_id=' + nestDriver.credentials.clientID + '&state=NEST',

		// Before fetching authorization code
		function (err, result) {

			// Pass needed credentials to front-end
			callback(err, {url: result});
		},

		// After fetching authorization code
		function (err, result) {

			// Post authorization url with needed credentials
			request.post(
				'https://api.home.nest.com/oauth2/access_token?client_id=' + nestDriver.credentials.clientID + '&code=' + result + '&client_secret=' + nestDriver.credentials.clientSecret + '&grant_type=authorization_code', {
					json: true
				}, function (err, response, body) {
					if (err) {

						// Catch error
						Homey.log(err);
					}
					else {
						// Store access token for later reference
						Homey.manager("settings").set("nestAccesstoken", body.access_token);

						// Authenticate with Nest using the access_token
						nestDriver.authWithToken(function (success) {
							if (success) {
								Homey.log('Authorization with Nest successful');
								nestDriver.events.emit('authenticated');

								Homey.manager('api').realtime('authorized_state', success);

								// Let the front-end know we are authorized
								Homey.manager('api').realtime('authorized');
							}
							else {
								Homey.log('' + err);
								Homey.manager('api').realtime('authorized_state', false);
							}
						});
					}
				}
			);
		}
	);
};

/**
 * Starts OAuth2 flow with Nest to get authenticated
 * @param callback
 * @param socket
 */
nestDriver.fetchAccessToken = function (callback, socket) {

	// Only clear tokens when fetching new one
	if (socket) {

		// Reset access_token to make sure front-end doesn't receive old (invalid) tokens
		Homey.manager("settings").set("nestAccesstoken", null);
	}

	// Generate OAuth2 callback, this helps to catch the authorization token
	Homey.manager('cloud').generateOAuth2Callback('https://home.nest.com/login/oauth2?client_id=' + nestDriver.credentials.clientID + '&state=NEST',

		// Before fetching authorization code
		function (err, result) {

			// Pass needed credentials to front-end
			callback({url: result});
		},

		// After fetching authorization code
		function (err, result) {

			// Post authorization url with needed credentials
			request.post(
				'https://api.home.nest.com/oauth2/access_token?client_id=' + nestDriver.credentials.clientID + '&code=' + result + '&client_secret=' + nestDriver.credentials.clientSecret + '&grant_type=authorization_code', {
					json: true
				}, function (err, response, body) {
					if (err) {

						// Catch error
						Homey.log(err);
					}
					else {

						// Store access_token for the long run
						Homey.manager("settings").set("nestAccesstoken", body.access_token);

						// Authenticate with Nest using the access_token
						nestDriver.authWithToken(function (success) {
							if (success) {
								Homey.log('Authorization with Nest successful');

								Homey.manager('api').realtime('authorized_state', success);

								// Emit event to look for devices that need to be re-enabled
								nestDriver.events.emit('authenticated');

								// Let the front-end know we are authorized
								if (socket) {
									socket.emit('authorized');
								}
								else {
									Homey.manager('api').realtime('authorized');
								}
							}
							else {
								Homey.log('' + err);
								Homey.manager('api').realtime('authorized_state', false);
							}
						});
					}
				}
			);
		}
	);
};

/**
 * Listens for incoming updates, and updates the internal device data
 * @param device_type
 * @param devices
 * @param callback
 */
nestDriver.fetchDeviceData = function (device_type, devices, callback) {

	// First fetch structures
	nestDriver.socket.child('structures').on('value', function (snapshot) {
		var structures = snapshot.val();

		// Second fetch device data
		nestDriver.socket.child('devices/' + device_type).on('value', function (snapshot) {
			var devices_data = snapshot.val();

			var devices_in_api = [];
			for (var id in devices_data) {
				var device_data = snapshot.child(id).val();

				// Map device_id to id for internal use
				device_data.id = device_data.device_id;

				// Keep track of away state
				device_data.structure_away = _.findWhere(structures, device_data.structure_id).away;

				// Create device object
				var device = {
					data: device_data,
					name: device_data.name_long
				};

				// Check if device already present, then replace it with new data
				var added = false;
				for (var x = 0; x < devices.length; x++) {
					if (devices[x].data && devices[x].data.id === device_data.id) {
						devices[x].data = device_data;
						devices[x].name = device_data.name_long;
						added = true;
					}
				}

				// If device was not already present in devices array, add it
				if (!added) {
					devices.push(device);
				}

				devices_in_api.push(device.data.id);
			}

			// Make sure if devices removed from API also removed as installed device
			nestDriver.events.emit(device_type + '_devices', [devices, devices_in_api]);

			if (typeof callback == "function") callback();
		});
	});
};

/**
 * Removes the authorized connection between Homey and Nest
 * @param callback
 * @param access_tokens
 */
nestDriver.removeWWNConnection = function (callback, access_tokens) {

	// Turn into array if necessary
	access_tokens = ( access_tokens instanceof String) ? [access_tokens] : _.uniq(access_tokens);

	// If Nest accesstoken is stored in settings, add it to be removed
	if (Homey.manager("settings").get("nestAccesstoken")) access_tokens.push(Homey.manager("settings").get("nestAccesstoken"));

	// Double check for array to loop over
	if (access_tokens instanceof Array) {
		_.each(access_tokens, function (access_token) {
			// Post authorization url with needed credentials
			request.del(
				'https://api.home.nest.com/oauth2/access_tokens/' + access_token, {}, function (err, response) {
					if (!err && response) {
						Homey.manager('api').realtime('deauthorized', access_token);
						Homey.log('Connection removed');
						Homey.manager('api').realtime('authorized_state', false);
						if (callback) callback(null, true);
					}
					else {
						// Catch error
						Homey.manager('api').realtime('deauthorized', null);
						Homey.log('Failed to remove Connection');
						if (callback) callback(err, null);
					}
				}
			);
		});
	}
};

/**
 * Register devices as unreachable when not found in Nest API,
 * or device is marked as offline
 * @param devices
 * @param installedDevices
 * @param device_id
 */
nestDriver.registerDeviceReachability = function (devices, api_devices, installedDevices, device_id) {

	// Register unreachable devices
	installedDevices.forEach(function (device_id) {

		// Check if device is present in Nest API
		if (_.indexOf(api_devices, device_id) === -1) {

			// Device not present in api, set as unavailable
			Homey.manager('drivers').getDriver("nest_thermostat").registerUnavailable(device_id, __("removed_externally"), function (err, success) {
				if (!err && success) {
					Homey.log('Disabled Nest device with device_id: ' + device_id);
				}
				else {
					Homey.log('Failed to disable Nest device with device_id: ' + device_id);
				}
			});
		}
		else {
			// Try to get the device internally
			var device = nestDriver.getDevice(devices, installedDevices, device_id);

			// If it exists, but is not online
			if (device && !device.data.is_online) {
				Homey.manager('drivers').getDriver("nest_thermostat").registerUnavailable(device_id, __("offline"));
			}
			else {
				Homey.manager('drivers').getDriver("nest_thermostat").registerAvailable(device_id);
			}
		}
	});
};

/**
 * Util function that returns device according to its id
 */
nestDriver.getDevice = function (devices, installedDevices, device_id) {
	var device = _.filter(devices, function (device) {
		if (_.indexOf(installedDevices, device_id) > -1) {
			return device.data.id === device_id;
		}
	})[0];

	return device;
};

/**
 * Export nest driver
 */
module.exports = nestDriver;
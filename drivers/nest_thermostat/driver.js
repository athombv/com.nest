'use strict';

const Homey = require('homey');

class NestThermostatDriver extends Homey.Driver {

	onInit() {

		new Homey.FlowCardCondition('hvac_status')
			.on('run', (args, state, callback) => {
				if (args && args.hasOwnProperty('status') && (args.hasOwnProperty('device') || args.hasOwnProperty('deviceData'))) {
					const device = args.device || args.deviceData; // Legacy
					return callback(null, device.client.hvac_state === args.status);
				}
				return callback('invalid arguments and or state provided');
			})
			.register()

		new Homey.FlowCardCondition('hvac_mode')
			.on('run', (args, state, callback) => {
				if (args && args.hasOwnProperty('mode') && (args.hasOwnProperty('device') || args.hasOwnProperty('deviceData'))) {
					const device = args.device || args.deviceData; // Legacy
					return callback(null, device.client.hvac_mode === args.mode);
				}
				return callback('invalid arguments and or state provided');
			})
			.register()

		new Homey.FlowCardAction('hvac_mode')
			.on('run', (args, state, callback) => {
				if (args && args.hasOwnProperty('mode') && (args.hasOwnProperty('device') || args.hasOwnProperty('deviceData'))) {
					const device = args.device || args.deviceData; // Legacy
					if (device.hasOwnProperty('client')) {
						device.client.setHvacMode(args.mode)
							.then(() => callback(null, args.mode))
							.catch(err => {
								Homey.app.registerLogItem({ msg: err, timestamp: new Date() });
								return callback(err);
							});
					} else return callback('No Nest client found');
				} else callback('invalid arguments and or state provided');
			})
			.register()
	}

	onPair(socket) {

		// Start fetching access token flow
		Homey.app.fetchAccessToken(result => {
			socket.emit('url', result.url);
		}).then(accessToken => {

			// Store new token
			Homey.ManagerSettings.set('nestAccesstoken', accessToken);

			// Authenticate nest account
			Homey.app.nestAccount.authenticate(accessToken).then(() => socket.emit('authorized'));
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
						appVersion: Homey.manifest.version,
					},
				});
			});
			if (devicesList.length === 0) return callback(Homey.__('pair.no_devices_found'));
			return callback(null, devicesList);
		});
	}
}

module.exports = NestThermostatDriver;
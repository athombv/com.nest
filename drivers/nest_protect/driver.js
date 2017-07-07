'use strict';

const Homey = require('homey');

class NestProtectDriver extends Homey.Driver {

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

module.exports = NestProtectDriver;

'use strict';

const Homey = require('homey');

class NestDriver extends Homey.Driver {

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

			Homey.app.nestAccount[this.driverType].forEach(device => {
				devicesList.push({
					name: (Homey.app.nestAccount.structures.length > 1 && device.structure_name) ? `${device.name_long} - ${device.structure_name}` : device.name_long,
					data: {
						id: device.device_id,
						appVersion: Homey.manifest.version,
					},
				});
			});
			if (devicesList.length === 0) return callback(Homey.__('pair.no_devices_found'));
			return callback(null, devicesList);
		});
	}
}

module.exports = NestDriver;

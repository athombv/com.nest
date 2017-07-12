'use strict';

const Homey = require('homey');
const OAuth2Driver = require('homey-wifidriver').OAuth2Driver;

class NestDriver extends OAuth2Driver {

	/**
	 * The method will be called during pairing when a list of devices is needed. Only when this class
	 * extends WifiDriver and provides a oauth2ClientConfig onInit. The data parameter contains an
	 * temporary OAuth2 account that can be used to fetch the devices from the users account.
	 * @returns {Promise}
	 */
	onPairOAuth2ListDevices() {

		// Cameras only available after client_version has been updated (user accepts permission change)
		if (this.driverType === 'cameras' && Homey.app.nestAccount.client_version <= 4) {
			return Promise.reject(new Error(Homey.__('error.camera_permission')));
		}

		// Authenticate nest account
		return Homey.app.nestAccount.authenticate()
			.then(() => {
				const devicesList = [];
				Homey.app.nestAccount[this.driverType].forEach(device => {
					devicesList.push({
						name: (Homey.app.nestAccount.structures.length > 1 && device.structure_name) ? `${device.name_long} - ${device.structure_name}` : device.name_long,
						data: {
							id: device.device_id,
							appVersion: Homey.manifest.version,
						},
					});
				});
				return devicesList;
			});
	}
}

module.exports = NestDriver;

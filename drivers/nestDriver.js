'use strict';

const Homey = require('homey');
const WifiDriver = require('homey-wifidriver').Driver;

class NestDriver extends WifiDriver {

	/**
	 * The method will be called during pairing when a list of devices is needed. Only when this class
	 * extends WifiDriver and provides a oauth2ClientConfig onInit. The data parameter contains an
	 * temporary OAuth2 account that can be used to fetch the devices from the users account.
	 * @param data {Object}
	 * @returns {Promise}
	 */
	onPairOAuth2ListDevices(data) {

		// Cameras only available after client_version has been updated (user accepts permission change)
		if (this.driverType === 'cameras' && Homey.app.nestAccount.client_version <= 4)
			return Promise.reject(new Error(Homey.__('error.camera_permission')));

		// Authenticate nest account
		return Homey.app.nestAccount.authenticate()
			.then(() => {
				let devicesList = [];
				Homey.app.nestAccount[this.driverType].forEach(device => {
					devicesList.push({
						name: (Homey.app.nestAccount.structures.length > 1 && device.structure_name) ? `${device.name_long} - ${device.structure_name}` : device.name_long,
						data: {
							id: device.device_id,
							appVersion: Homey.manifest.version,
						},
						store: {
							tempOAuth2Account: Object.assign({
								accessToken: data.oauth2Account.accessToken,
								refreshToken: data.oauth2Account.refreshToken,
							}, Homey.app.oauth2ClientConfig),
						},
					});
				});
				return devicesList;
			});
	}
}

module.exports = NestDriver;

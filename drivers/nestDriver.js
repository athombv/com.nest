'use strict';

const Homey = require('homey');
const WifiDriver = require('homey-wifidriver').Driver;

const oauth2ClientConfig = {
	url: `https://home.nest.com/login/oauth2?client_id=${Homey.env.NEST_CLIENT_ID}&state=NEST`,
	tokenEndpoint: 'https://api.home.nest.com/oauth2/access_token',
	key: Homey.env.NEST_CLIENT_ID,
	secret: Homey.env.NEST_CLIENT_SECRET,
	allowMultipleAccounts: false,
	refreshingEnabled: false,
};

class NestDriver extends WifiDriver {

	onInit() {
		// Start OAuth2Client
		super.onInit({
			oauth2ClientConfig,
		});
	}

	/**
	 * The method will be called during pairing when a list of devices is needed. Only when this class
	 * extends WifiDriver and provides a oauth2ClientConfig onInit. The data parameter contains an
	 * temporary OAuth2 account that can be used to fetch the devices from the users account.
	 * @param data {Object}
	 * @returns {Promise}
	 */
	onPairOAuth2ListDevices(data) {

		// Authenticate nest account
		return Homey.app.nestAccount.authenticate(data.oauth2Account.accessToken)
			.then(() => {
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
				return devicesList;
			});
	}
}

module.exports = NestDriver;

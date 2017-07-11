'use strict';

const Homey = require('homey');
const semver = require('semver');
const WifiDevice = require('homey-wifidriver').Device;

class NestDevice extends WifiDevice {

	onInit() {
		this.setUnavailable(Homey.__('reconnecting'));

		// If device was added below 2.0.0 make sure to re-pair
		if (!this.getData().hasOwnProperty('appVersion') || !this.getData().appVersion || !semver.gte(this.getData().appVersion, '2.0.0')) return this.setUnavailable(Homey.__('version_repair'));

		Homey.app.nestAccount.initialized
			.then(() => {
				this.bindAuthenticationListeners();
				this.createClient();
				this.setAvailable();
			})
			.catch(() => {
				this.setUnavailable(Homey.__('unauthenticated'));
				this.bindAuthenticationListeners();
			});
	}

	bindAuthenticationListeners() {

		// Listen for authentication events
		Homey.app.nestAccount
			.on('unauthenticated', () => {
				this.log('unauthenticated');
				this.setUnavailable(Homey.__('unauthenticated'));
			})
			.on('initialized', success => { // TODO fix, this doesn't get called
				this.log('initialized', success);
				if (success) {
					this.createClient();
					this.setAvailable();
				}
			});
	}

	onDeleted() {
		if (this.client) this.client.destroy();
		super.onDeleted();
	}
}

module.exports = NestDevice;

'use strict';

const Homey = require('homey');
const semver = require('semver');
const WifiDevice = require('homey-wifidriver').Device;

class NestDevice extends WifiDevice {

	onInit() {
		this.setUnavailable(Homey.__('reconnecting'));

		// If device was added below 2.0.0 make sure to re-pair
		if (!this.getData().hasOwnProperty('appVersion') || !this.getData().appVersion || !semver.gte(this.getData().appVersion, '2.0.0')) return this.setUnavailable(Homey.__('version_repair'));

		// Listen for authentication events
		Homey.app.nestAccount
			.on('authenticated', () => {
				this.log('authenticated')
				this.createClient();
				this.setAvailable();
			})
			.on('initialized', result => {
				if (result) {
					this.createClient();
					this.setAvailable();
					this.log('initialized and authenticated');
				}
				this.log('initialized but not authenticated');
			})
			.on('unauthenticated', () => {
				this.log('unauthenticated')
				this.setUnavailable(Homey.__('unauthenticated'));
			});

		// If account already authenticated
		if (Homey.app.nestAccount.isAuthenticated()) {
			this.createClient();
			this.setAvailable();
		} else {
			this.setUnavailable(Homey.__('unauthenticated'));
		}
	}

	onDeleted() {
		if (this.client) this.client.destroy();
		super.onDeleted();
	}
}

module.exports = NestDevice;

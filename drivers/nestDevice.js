'use strict';

const Homey = require('homey');
const semver = require('semver');
const WifiDevice = require('homey-wifidriver').Device;

class NestDevice extends WifiDevice {

	onInit() {
		this.setUnavailable(Homey.__('reconnecting'));

		// If device was added below 2.0.0 make sure to re-pair
		if (!this.getData().hasOwnProperty('appVersion') || !this.getData().appVersion || !semver.gte(this.getData().appVersion, '2.0.0')) return this.setUnavailable(Homey.__('version_repair'));

		// Wait for nest account to be initialized
		Homey.app.nestAccountInitialization.then(authenticated => {
			this.log('nestAccount initialized')
			// Listen for authentication events
			Homey.app.nestAccount
				.on('authenticated', () => {

					this.log('authenticated')
					this.createClient();
					this.setAvailable();
				})
				.on('initialized', () => {
					this.log('initialized')
					this.createClient();
					this.setAvailable();
				})
				.on('unauthenticated', () => {
					this.log('unauthenticated')
					this.setUnavailable(Homey.__('unauthenticated'));
				});

			// Nest account authenticated
			if (!authenticated) {
				this.setUnavailable(Homey.__('unauthenticated'));
			}
			else {
				this.createClient();
				this.setAvailable();
			}
		});

		Homey.app.nestAccount.authenticate(this.getOAuth2Account());
	}

	onDeleted() {
		if (this.client) this.client.destroy();
	}
}

module.exports = NestDevice;

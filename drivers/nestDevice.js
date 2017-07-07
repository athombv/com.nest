'use strict';

const Homey = require('homey');
const semver = require('semver');

class NestDevice extends Homey.Device {

	onInit() {
		this.setUnavailable(Homey.__('reconnecting'));

		// If device was added below 2.0.0 make sure to re-pair
		if (!this.getData().hasOwnProperty('appVersion') || !this.getData().appVersion || !semver.gte(this.getData().appVersion, '2.0.0')) return this.setUnavailable(Homey.__('version_repair'));

		// Wait for nest account to be initialized
		Homey.app.nestAccountInitialization.then(authenticated => {

			// Listen for authentication events
			Homey.app.nestAccount
				.on('authenticated', () => {
					this.createClient();
					this.setAvailable();
				})
				.on('unauthenticated', () => {
					this.setUnavailable(Homey.__('unauthenticated'));
				});

			// Nest account authenticated
			if (!authenticated) this.setUnavailable(Homey.__('unauthenticated'));
			else {
				this.createClient();
				this.setAvailable();
			}
		});
	}

	onDeleted() {
		if (this.client) this.client.destroy();
	}
}

module.exports = NestDevice;

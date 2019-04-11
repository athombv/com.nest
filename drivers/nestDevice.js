'use strict';

const Homey = require('homey');
const semver = require('semver');
const OAuth2Device = require('homey-wifidriver').OAuth2Device;

class NestDevice extends OAuth2Device {

	onInit() {
		this.setUnavailable(Homey.__('reconnecting'));

		// If device was added below 2.0.0 make sure to re-pair
		if (!this.getData().hasOwnProperty('appVersion') || !this.getData().appVersion || !semver.gte(this.getData().appVersion, '2.0.0')) return this.setUnavailable(Homey.__('version_repair'));

		// Listen for authentication events
		Homey.app.nestAccount
			.on('unauthenticated', () => {
				clearTimeout(this.unauthenticatedTimeout);
				this.log('unauthenticated');
				this.setUnavailable(Homey.__('unauthenticated'));
			})
			.on('initialized', authenticated => {
				clearTimeout(this.unauthenticatedTimeout);
				this.log('initialized', authenticated);
				if (authenticated) {
					this.createClient();
					this.setAvailable();
				} else {
					this.log('unauthenticated');
					this.setUnavailable(Homey.__('unauthenticated'));
				}
			});

		// Check if account was already properly initialized, then we can continue
		if (Homey.app.nestAccount.isAuthenticatedAndHasData()) {
			this.createClient();
			this.setAvailable();
		} else {

			// If after 10 seconds the account has no data, mark device as unauthenticated
			this.unauthenticatedTimeout = setTimeout(() => {
				if (!Homey.app.nestAccount.isAuthenticated()) {
					this.log('unauthenticated');
					this.setUnavailable(Homey.__('unauthenticated'));
				}
			}, 15000);
		}
	}

	onDeleted() {
		if (this.client) this.client.destroy();
		super.onDeleted();
	}
}

module.exports = NestDevice;

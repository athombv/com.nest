'use strict';

const Homey = require('homey');

const semver = require('semver');

class NestProtect extends Homey.Device {
	onInit(){

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

	createClient(){
		// Create thermostat
		this.client = Homey.app.nestAccount.createProtect(this.getData().id);

		// If client construction failed, set device unavailable
		if (!this.client) return this.setUnavailable(Homey.__('removed_externally'));

		// Subscribe to events on data change
		this.client
			.on('co_alarm_state', coAlarmState => {
				if (!((this.client.co_alarm_state === 'warning' ||
					this.client.co_alarm_state === 'emergency') &&
					(coAlarmState === 'warning' ||
					coAlarmState === 'emergency'))) {
					this.setCapabilityValue('alarm_co', (coAlarmState !== 'ok'));
				}
			})
			.on('smoke_alarm_state', smokeAlarmState => {
				if (!((this.client.smoke_alarm_state === 'warning' ||
					this.client.smoke_alarm_state === 'emergency') &&
					(smokeAlarmState === 'warning' ||
					smokeAlarmState === 'emergency'))) {
					this.setCapabilityValue('alarm_smoke', (smokeAlarmState !== 'ok'));
				}
			})
			.on('battery_health', batteryHealth => {
				this.setCapabilityValue('alarm_battery', (batteryHealth !== 'ok'));
			})
			.on('removed', () => {
				this.setUnavailable(Homey.__('removed_externally'));
			});
	}

	onDeleted() {
		if(this.client) this.client.destroy();
	}
}

module.exports = NestProtect;

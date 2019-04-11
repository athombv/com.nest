'use strict';

const Homey = require('homey');
const NestDevice = require('./../nestDevice');

class NestProtect extends NestDevice {

	onInit() {
		super.onInit();
	}

	/**
	 * Create client and bind event listeners.
	 * @returns {*}
	 */
	createClient() {

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
}

module.exports = NestProtect;

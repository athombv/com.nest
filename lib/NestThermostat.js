'use strict';

const Homey = require('homey');

const NestDevice = require('./NestDevice');

/**
 * Class representing NestThermostat, extends
 * NestDevice.
 */
class NestThermostat extends NestDevice {

	/**
	 * Pass options object to NestDevice.
	 * @param options
	 */
	constructor(options) {

		// Set proper device type
		if (options) options.device_type = 'thermostats';

		super(options);

		// Store capabilities of thermostat
		this.capabilities = ['target_temperature_c', 'ambient_temperature_c', 'humidity', 'hvac_state', 'hvac_mode'];
	}

	/**
	 * Set the target temperature of this Nest Thermostat.
	 * @param temperature in Celsius
	 */
	setTargetTemperature(temperature) {
		return new Promise((resolve, reject) => {

			// Authenticate
			this.nest_account.authenticate().then(() => {

				// Handle cases where temperature could not be set
				if (this.is_using_emergency_heat) {
					return reject(Homey.__('error.emergency_heat', {
						temp: temperature,
						name: this.name_long,
					}));
				}
				if (this.hvac_mode === 'heat-cool') {
					return reject(Homey.__('error.hvac_mode_is_heat_cool', {
						temp: temperature,
						name: this.name_long,
					}));
				}
				if (this.hvac_mode === 'eco') {
					return reject(Homey.__('error.hvac_mode_is_eco', {
						temp: temperature,
						name: this.name_long,
					}));
				}
				if (this.is_locked && (temperature < this.locked_temp_min_c || temperature > this.locked_temp_max_c)) {
					return reject(Homey.__('error.temp_lock', {
						temp: temperature,
						min: this.locked_temp_min_c,
						max: this.locked_temp_max_c,
						name: this.name_long,
					}));
				}

				// All clear to change the target temperature
				this.nest_account.db.child(`devices/thermostats/${this.device_id}/target_temperature_c`).set(temperature, error => {
					if (error) {
						return reject(Homey.__('error.unknown', {
							temp: temperature,
							name: this.name_long,
							error,
						}));
					}
					return resolve(temperature);
				});
			}).catch(err => reject(err));
		});
	}

	/**
	 * Check if devce software version is greater than or
	 * equal to the provided version parameter.
	 * @param version
	 * @returns {boolean}
	 */
	checkSoftwareVersionGTE(version) {
		const major = this.software_version.split('.')[0];
		const minor = this.software_version.split('.')[1];
		return (major >= version.split('.')[0] && minor >= version.split('.')[1]);
	}

	/**
	 * Set the target HVAC mode of this Nest Thermostat.
	 * @param mode
	 */
	setHvacMode(mode) {
		return new Promise((resolve, reject) => {

			// Authenticate
			this.nest_account.authenticate().then(() => {

				// Handle cases where mode is unsupported
				if (this.is_using_emergency_heat) {
					return reject(Homey.__('error.hvac_emergency_heat', {
						name: this.name_long,
					}));
				} else if (mode === 'heat-cool' && !(this.can_cool && this.can_heat)) {
					return reject(Homey.__('error.hvac_mode_heat-cool_unsupported', {
						name: this.name_long,
					}));
				} else if (mode === 'cool' && !this.can_cool) {
					return reject(Homey.__('error.hvac_mode_cool_unsupported', {
						name: this.name_long,
					}));
				} else if (mode === 'heat' && !this.can_heat) {
					return reject(Homey.__('error.hvac_mode_heat_unsupported', {
						name: this.name_long,
					}));
				} else if (mode === 'eco' && (!this.checkSoftwareVersionGTE('5.6.0') || !(this.can_cool || this.can_heat))) {
					return reject(Homey.__('error.hvac_mode_eco_unsupported', {
						name: this.name_long,
					}));
				}

				// All clear to change the HVAC mode
				this.nest_account.db.child(`devices/thermostats/${this.device_id}/hvac_mode`).set(mode, error => {
					if (error) {
						return reject(Homey.__('error.unknown', {
							hvac_mode: mode,
							name: this.name_long,
							error,
						}));
					}
					return resolve(mode);
				});
			}).catch(err => reject(err));
		});
	}
}

module.exports = NestThermostat;

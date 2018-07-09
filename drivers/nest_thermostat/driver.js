'use strict';

const Homey = require('homey');

const NestDriver = require('./../nestDriver');

class NestThermostatDriver extends NestDriver {

	onInit() {
		super.onInit();

		this.driverType = 'thermostats';

		new Homey.FlowCardCondition('hvac_status')
			.register()
			.registerRunListener(args => {
				if (args && args.hasOwnProperty('status') && (args.hasOwnProperty('device') ||
					args.hasOwnProperty('deviceData'))) {
					const device = args.device || args.deviceData; // Legacy
					return Promise.resolve(device.client.hvac_state === args.status);
				}
				return Promise.reject(new Error('invalid arguments and or state provided'));
			});

		new Homey.FlowCardCondition('hvac_mode')
			.register()
			.registerRunListener(args => {
				if (args && args.hasOwnProperty('mode') && (args.hasOwnProperty('device') ||
					args.hasOwnProperty('deviceData'))) {
					const device = args.device || args.deviceData; // Legacy
					return Promise.resolve(device.client.hvac_mode === args.mode);
				}
				return Promise.reject('invalid arguments and or state provided');
			});

		new Homey.FlowCardAction('hvac_mode')
			.register()
			.registerRunListener(args => {
				if (args && args.hasOwnProperty('mode') && (args.hasOwnProperty('device') ||
					args.hasOwnProperty('deviceData'))) {
					const device = args.device || args.deviceData; // Legacy
					if (device.hasOwnProperty('client')) {
						return device.client.setHvacMode(args.mode)
							.catch(err => {
								Homey.app.registerLogItem({ msg: err, timestamp: new Date() });
								throw err;
							});
					}
					return Promise.reject(new Error('No Nest client found'));
				}
				return Promise.reject(new Error('invalid arguments and or state provided'));
			});
	}
}

module.exports = NestThermostatDriver;

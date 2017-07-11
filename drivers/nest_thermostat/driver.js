'use strict';

const Homey = require('homey');

const NestDriver = require('./../nestDriver');

class NestThermostatDriver extends NestDriver {

	onInit() {
		super.onInit();

		this.driverType = 'thermostats';

		new Homey.FlowCardCondition('hvac_status')
			.on('run', (args, state, callback) => {
				if (args && args.hasOwnProperty('status') && (args.hasOwnProperty('device') || args.hasOwnProperty('deviceData'))) {
					const device = args.device || args.deviceData; // Legacy
					return callback(null, device.client.hvac_state === args.status);
				}
				return callback('invalid arguments and or state provided');
			})
			.register();

		new Homey.FlowCardCondition('hvac_mode')
			.on('run', (args, state, callback) => {
				if (args && args.hasOwnProperty('mode') && (args.hasOwnProperty('device') || args.hasOwnProperty('deviceData'))) {
					const device = args.device || args.deviceData; // Legacy
					return callback(null, device.client.hvac_mode === args.mode);
				}
				return callback('invalid arguments and or state provided');
			})
			.register();

		new Homey.FlowCardAction('hvac_mode')
			.on('run', (args, state, callback) => {
				if (args && args.hasOwnProperty('mode') && (args.hasOwnProperty('device') || args.hasOwnProperty('deviceData'))) {
					const device = args.device || args.deviceData; // Legacy
					if (device.hasOwnProperty('client')) {
						device.client.setHvacMode(args.mode)
							.then(() => callback(null, args.mode))
							.catch(err => {
								Homey.app.registerLogItem({ msg: err, timestamp: new Date() });
								return callback(err);
							});
					} else return callback('No Nest client found');
				} else callback('invalid arguments and or state provided');
			})
			.register();
	}
}

module.exports = NestThermostatDriver;
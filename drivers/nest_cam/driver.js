'use strict';

const Homey = require('homey');
const NestDriver = require('./../nestDriver');

class NestCamDriver extends NestDriver {
	onInit() {
		super.onInit();
		this.driverType = 'cameras';

		new Homey.FlowCardCondition('is_streaming')
			.on('run', (args, state, callback) => {
				if (args && (args.hasOwnProperty('device'))) {
					const device = args.device;
					return callback(null, device.client.is_streaming);
				}
				return callback('invalid arguments provided');
			})
			.register();

		new Homey.FlowCardCondition('on_going_event')
			.on('run', (args, state, callback) => {
				if (args && (args.hasOwnProperty('device'))) {
					const device = args.device;
					return callback(null, device.eventIsHappening);
				}
				return callback('invalid arguments provided');
			})
			.register();

	}
}

module.exports = NestCamDriver;

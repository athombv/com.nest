'use strict';

const Homey = require('homey');
const NestDriver = require('./../nestDriver');

class NestCamDriver extends NestDriver {
	onInit() {
		super.onInit();
		this.driverType = 'cameras';

		new Homey.FlowCardCondition('is_streaming')
			.register()
			.registerRunListener(args => {
				if (args && (args.hasOwnProperty('device'))) {
					const device = args.device;
					return Promise.resolve(device.client.is_streaming);
				}
				return Promise.reject(new Error('invalid arguments provided'));
			});

		new Homey.FlowCardCondition('on_going_event')
			.register()
			.registerRunListener(args => {
				if (args && (args.hasOwnProperty('device'))) {
					const device = args.device;
					return Promise.resolve(device.eventIsHappening);
				}
				return Promise.reject(new Error('invalid arguments provided'));
			});
	}
}

module.exports = NestCamDriver;

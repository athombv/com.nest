'use strict';

const NestDevice = require('./NestDevice');

/**
 * Class representing NestProtect, extends
 * NestDevice.
 */
class NestProtect extends NestDevice {

	/**
	 * Pass options object to NestDevice.
	 * @param options
	 */
	constructor(options) {

		// Set proper device type
		if (options) options.device_type = 'smoke_co_alarms';

		super(options);

		// Store capabilities of protect
		this.capabilities = ['battery_health', 'co_alarm_state', 'smoke_alarm_state'];
	}
}

module.exports = NestProtect;

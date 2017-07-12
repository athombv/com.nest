'use strict';

const NestDriver = require('./../nestDriver');

class NestProtectDriver extends NestDriver {
	onInit() {
		super.onInit();
		this.driverType = 'smoke_co_alarms';
	}
}

module.exports = NestProtectDriver;

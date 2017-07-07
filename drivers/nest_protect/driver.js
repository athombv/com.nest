'use strict';

const NestDriver = require('./../nestDriver');

class NestProtectDriver extends NestDriver {
	onInit(){
		this.deviceType = 'smoke_co_alarms';
	}
}

module.exports = NestProtectDriver;

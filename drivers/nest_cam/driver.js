'use strict';

const NestDriver = require('./../nestDriver');

class NestCamDriver extends NestDriver {
	onInit(){
		super.onInit();
		this.driverType = 'cameras';
	}
}

module.exports = NestCamDriver;

'use strict';

const NestDriver = require('../../lib/NestDriver');
const { DRIVER_TYPE } = require('../../constants');

class NestProtectDriver extends NestDriver {
  onInit() {
    // Set correct driver type
    this.driverType = DRIVER_TYPE.SMOKE_CO_ALARMS;
  }
}

module.exports = NestProtectDriver;

'use strict';

const Homey = require('homey');
const { DRIVER_TYPE } = require('../constants');

class NestDriver extends Homey.Driver {
  onPair(socket) {
    this.log('onPair()');
    Homey.app.startOAuth2Process(socket);
    socket.on('list_devices', this._onPairListDevices.bind(this));
  }

  async _onPairListDevices(data, callback) {
    this.log('_onPairListDevices()');

    // Cameras only available after client_version has been updated (user accepts permission change)
    if (this.driverType === DRIVER_TYPE.CAMERAS && !Homey.app.hasUpdatedClientVersion()) {
      return callback(new Error(Homey.__('error.camera_permission')));
    }

    // Get structures attached to this nest account
    const structures = await Homey.app.getStructures();
    this.log(`_onPairListDevices() -> received structures (length: ${structures.length})`);

    // Get devices attached to this nest account
    const devices = await Homey.app.getDevices({ driverType: this.driverType });
    this.log(`_onPairListDevices() -> received devices (length: ${devices.length})`);

    // Construct devices array for listing in pair wizard
    const result = devices.map(device => {
      let name = device.name_long;

      // If there are more structures find structure name and append
      if (structures.length > 1) {
        const structure = structures.find(structure => structure.structure_id === device.structure_id);
        if (structure) name = `${name} - ${structure.name}`;
      }

      return {
        name,
        data: {
          id: device.device_id,
          appVersion: Homey.manifest.version,
        },
      };
    });

    return callback(null, result);
  }
}

module.exports = NestDriver;

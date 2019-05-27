'use strict';

const Homey = require('homey');

const semver = require('semver');

const { DEVICE_DATA_EVENT } = require('../constants');

class NestDevice extends Homey.Device {
  async onInit() {
    // Handle migration from com.nest@1.x
    this._migrateFromV1();

    // Mark device for reconnecting
    this.setUnavailable(Homey.__('reconnecting'));

    // Set driver type
    this.driverType = this.getDriver().driverType;

    // Listen for data events
    Homey.app.on(DEVICE_DATA_EVENT, this._updateDeviceData.bind(this));

    // Check if device is still available in remote API
    const deviceData = await Homey.app.getDevice({ driverType: this.driverType, id: this.getData().id });
    if (!deviceData) return this._onExternallyDeleted();

    // Process initially retrieved device data
    this._updateDeviceData();
    this.setAvailable();
  }

  /**
   * Handles deletion of the device instance, cleans up event listeners.
   */
  onDeleted() {
    super.onDeleted();
    // Remove event listener if possible
    if (Homey.app) {
      Homey.app.removeListener(`${this.driverType}:${this.getData().id}`, this._updateDeviceData.bind(this));
    }
    this.log('onDeleted() -> removed event listeners');
  }

  /**
   * Check incoming data update for changed values, emit corresponding events when data is changed.
   * @returns {boolean}
   * @private
   */
  async _updateDeviceData() {
    this.log('_updateDeviceData()');

    // Check if device is still available in remote API
    const data = await Homey.app.getDevice({ driverType: this.driverType, id: this.getData().id });
    if (!data) {
      this.log('_updateDeviceData() -> no data, assume device is removed');
      return this._onExternallyDeleted();
    }

    // Update all capabilities with new values
    this._updateCapabilityValues(data);
  }

  /**
   * Method that parses incoming data and updates the capabilities of the device accordingly.
   * @param data
   */
  _updateCapabilityValues(data = {}) {
    // Check if capabilities are set
    if (Array.isArray(this.capabilities)) {
      // Loop all registered capabilities and call device specific capability value handler
      this.capabilities.forEach(capability => this.onCapabilityValue(capability, data[capability]));

      // Assign all values from data object to this instance
      Object.assign(this, data);
    }
  }

  /**
   * Method that checkes whether a capability value actually changed is was not known before.
   * @param capabilityId
   * @param value
   * @returns {boolean}
   */
  valueChangedAndNotNew(capabilityId, value) {
    return value !== this[capabilityId] && this[capabilityId] !== null && this[capabilityId] !== undefined;
  }

  /**
   * Method that checks if device was added before com.nest@2.0.0, if so a re-pair is required.
   * @returns {*}
   * @private
   */
  _migrateFromV1() {
    const { appVersion } = this.getData();
    if (!appVersion || !semver.gte(appVersion, '2.0.0')) {
      return this.setUnavailable(Homey.__('version_repair'));
    }
  }

  /**
   * Event handler for the event that the device is removed in the Nest API.
   * @private
   */
  _onExternallyDeleted() {
    this.log('_onExternallyDeleted()');
    this.setUnavailable(Homey.__('removed_externally'));
  }
}

module.exports = NestDevice;

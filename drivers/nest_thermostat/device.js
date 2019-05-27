'use strict';

const Homey = require('homey');

const NestDevice = require('../../lib/NestDevice');
const {
  SETTINGS, CAPABILITIES, NEST_CAPABILITIES, HVAC_MODE,
} = require('../../constants');

class NestThermostat extends NestDevice {
  async onInit() {
    await super.onInit();

    // Set default settings
    if (this.getSetting(SETTINGS.ECO_OVERRIDE_BY)) this.setSettings({ [SETTINGS.ECO_OVERRIDE_BY]: HVAC_MODE.HEAT });
    if (this.getSetting(SETTINGS.ECO_OVERRIDE_ALLOW) === null) this.setSettings({ [SETTINGS.ECO_OVERRIDE_ALLOW]: false });

    // Register capability
    this.registerCapabilityListener(CAPABILITIES.TARGET_TEMPERATURE, this.onCapabilityTargetTemperature.bind(this));
  }

  /**
   * Getter for device specific capabilities
   * @returns {*[]}
   */
  get capabilities() {
    return [
      NEST_CAPABILITIES.HUMIDITY,
      NEST_CAPABILITIES.HVAC_MODE,
      NEST_CAPABILITIES.HVAC_STATE,
      NEST_CAPABILITIES.TARGET_TEMPERATURE_C,
      NEST_CAPABILITIES.AMBIENT_TEMPERATURE_C,
    ];
  }

  /**
   * Method that is called when a capability value update is received.
   * @param capabilityId
   * @param value
   */
  onCapabilityValue(capabilityId, value) {
    if (capabilityId === NEST_CAPABILITIES.AMBIENT_TEMPERATURE_C) {
      this.setCapabilityValue(CAPABILITIES.MEASURE_TEMPERATURE, value).catch(this.error);
    } else if (capabilityId === NEST_CAPABILITIES.TARGET_TEMPERATURE_C) {
      this.setCapabilityValue(CAPABILITIES.TARGET_TEMPERATURE, value).catch(this.error);
    } else if (capabilityId === NEST_CAPABILITIES.HUMIDITY) {
      this.setCapabilityValue(CAPABILITIES.MEASURE_HUMIDITY, value).catch(this.error);
    } else if (capabilityId === NEST_CAPABILITIES.HVAC_STATE && this.valueChangedAndNotNew(capabilityId, value)) {
      const driver = this.getDriver();
      driver.triggerHVACStatusChangedFlow(this);
    } else if (capabilityId === NEST_CAPABILITIES.HVAC_MODE && this.valueChangedAndNotNew(capabilityId, value)) {
      const driver = this.getDriver();
      driver.triggerHVACModeChangedFlow(this);
    }
  }

  /**
   * This method will be called when the target temperature needs to be changed.
   * @param temperature
   * @param options
   * @returns {Promise}
   */
  async onCapabilityTargetTemperature(temperature, options) {
    this.log('onCapabilityTargetTemperature()', 'temperature:', temperature, 'options:', options);

    // Determine if mode is Eco and if it may be overridden
    if (Object.prototype.hasOwnProperty.call(this, NEST_CAPABILITIES.HVAC_MODE)
      && this.hvac_mode === HVAC_MODE.ECO
      && this.getSetting(SETTINGS.ECO_OVERRIDE_ALLOW) === true
      && [HVAC_MODE.HEAT, HVAC_MODE.COOL, HVAC_MODE.HEAT_COOL].indexOf(this.getSetting(SETTINGS.ECO_OVERRIDE_BY)) >= 0) {
      try {
        await this.setHvacMode(this.getSetting(SETTINGS.ECO_OVERRIDE_BY));
      } catch (err) {
        // Override failed
        const errOverride = Homey.__('error.hvac_mode_eco_override_failed', { name: this.getName() }) + err;
        Homey.app.registerLogItem({ msg: errOverride, timestamp: new Date() });
        // Abort
        return;
      }
      // Override succeeded: re-attempt to set target temperature
      await this.onCapabilityTargetTemperature(temperature);
    }

    // Fix temperature range
    temperature = Math.round(temperature * 2) / 2;

    try {
      await this.setTargetTemperature(temperature);
    } catch (err) {
      this.error('Error setting target temperature', err);
      throw new Error(err);
    }
  }

  /**
   * Set the target temperature of this Nest Thermostat.
   * @param temperature in Celsius
   */
  async setTargetTemperature(temperature) {
    // Handle cases where temperature could not be set
    if (this.is_using_emergency_heat) {
      // Register error in log
      const errorMessage = Homey.__('error.emergency_heat', {
        temp: temperature,
        name: this.getName(),
      });
      Homey.app.registerLogItem({ msg: errorMessage, timestamp: new Date() });
      throw new Error(errorMessage);
    }
    if (this.hvac_mode === HVAC_MODE.HEAT_COOL) {
      // Register error in log
      const errorMessage = Homey.__('error.hvac_mode_is_heat_cool', {
        temp: temperature,
        name: this.getName(),
      });
      Homey.app.registerLogItem({ msg: errorMessage, timestamp: new Date() });
      throw new Error(errorMessage);
    }
    if (this.hvac_mode === HVAC_MODE.ECO) {
      // Register error in log
      const errorMessage = Homey.__('error.hvac_mode_is_eco', {
        temp: temperature,
        name: this.getName(),
      });
      Homey.app.registerLogItem({ msg: errorMessage, timestamp: new Date() });
      throw new Error(errorMessage);
    }
    if (this.is_locked && (temperature < this.locked_temp_min_c || temperature > this.locked_temp_max_c)) {
      // Register error in log
      const errorMessage = Homey.__('error.temp_lock', {
        temp: temperature,
        min: this.locked_temp_min_c,
        max: this.locked_temp_max_c,
        name: this.getName(),
      });
      Homey.app.registerLogItem({ msg: errorMessage, timestamp: new Date() });
      throw new Error(errorMessage);
    }

    // All clear to change the target temperature
    try {
      await Homey.app.executePutRequest(`devices/${this.driverType}/${this.getData().id}`, NEST_CAPABILITIES.TARGET_TEMPERATURE_C, temperature);
    } catch (err) {
      this.error(`setTargetTemperature(${temperature}) -> failed, reason: ${err}`);

      // Register error in log
      const errorMessage = Homey.__('error.unknown', {
        temp: temperature,
        name: this.getName(),
        error: err,
      });
      Homey.app.registerLogItem({ msg: errorMessage, timestamp: new Date() });
      throw new Error(errorMessage);
    }
  }

  /**
   * Set the target HVAC mode of this Nest Thermostat.
   * @param mode
   */
  async setHvacMode(mode) {
    // Handle cases where mode is unsupported
    if (this.is_using_emergency_heat) {
      // Register error in log
      const errorMessage = Homey.__('error.hvac_emergency_heat', { name: this.getName() });
      Homey.app.registerLogItem({ msg: errorMessage, timestamp: new Date() });
      throw new Error(errorMessage);
    }
    if (mode === HVAC_MODE.HEAT_COOL && !(this.can_cool && this.can_heat)) {
      // Register error in log
      const errorMessage = Homey.__('error.hvac_mode_heat-cool_unsupported', { name: this.getName() });
      Homey.app.registerLogItem({ msg: errorMessage, timestamp: new Date() });
      throw new Error(errorMessage);
    }
    if (mode === HVAC_MODE.COOL && !this.can_cool) {
      // Register error in log
      const errorMessage = Homey.__('error.hvac_mode_cool_unsupported', { name: this.getName() });
      Homey.app.registerLogItem({ msg: errorMessage, timestamp: new Date() });
      throw new Error(errorMessage);
    }
    if (mode === HVAC_MODE.HEAT && !this.can_heat) {
      // Register error in log
      const errorMessage = Homey.__('error.hvac_mode_heat_unsupported', { name: this.getName() });
      Homey.app.registerLogItem({ msg: errorMessage, timestamp: new Date() });
      throw new Error(errorMessage);
    }
    if (mode === HVAC_MODE.ECO && (!NestThermostat.checkSoftwareVersionGTE(this.software_version, '5.6.0') || !(this.can_cool || this.can_heat))) {
      // Register error in log
      const errorMessage = Homey.__('error.hvac_mode_eco_unsupported', { name: this.getName() });
      Homey.app.registerLogItem({ msg: errorMessage, timestamp: new Date() });
      throw new Error(errorMessage);
    }

    // Good to go, execute command
    try {
      await Homey.app.executePutRequest(`devices/${this.driverType}/${this.getData().id}`, NEST_CAPABILITIES.HVAC_MODE, mode);
    } catch (err) {
      this.error(`setHvacMode(${mode}) -> failed, reason: ${err}`);

      // Register error in log
      const errorMessage = Homey.__('error.unknown', {
        hvac_mode: mode,
        name: this.getName(),
        error: err,
      });
      Homey.app.registerLogItem({ msg: errorMessage, timestamp: new Date() });

      throw new Error(errorMessage);
    }
  }

  /**
   * Check if device software version is greater than or
   * equal to the provided version parameter.
   * @param currentVersion
   * @param newVersion
   * @returns {boolean}
   */
  static checkSoftwareVersionGTE(currentVersion, newVersion) {
    const major = currentVersion.split('.')[0];
    const minor = currentVersion.split('.')[1];
    return (major >= newVersion.split('.')[0] && minor >= newVersion.split('.')[1]);
  }
}

module.exports = NestThermostat;

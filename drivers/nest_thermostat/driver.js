'use strict';

const Homey = require('homey');

const NestDriver = require('../../lib/NestDriver');
const { DRIVER_TYPE } = require('../../constants');

const FLOW_CARD_ACTION_HVAC_MODE = 'hvac_mode';
const FLOW_CARD_CONDITION_HVAC_MODE = 'hvac_mode';
const FLOW_CARD_CONDITION_HVAC_STATUS = 'hvac_status';
const FLOW_CARD_TRIGGER_DEVICE_HVAC_MODE_CHANGED = 'hvac_mode_changed';
const FLOW_CARD_TRIGGER_DEVICE_HVAC_STATUS_CHANGED = 'hvac_status_changed';

class NestThermostatDriver extends NestDriver {
  onInit() {
    // Set correct driver type
    this.driverType = DRIVER_TYPE.THERMOSTATS;

    // Register Flow cards
    this._registerFlowCardActions();
    this._registerFlowCardConditions();
    this._registerFlowCardTriggerDevices();
  }

  /**
   * Method that triggers the FlowCardTriggerDevice instance for a changed HVAC status.
   * @param device
   * @param tokens
   * @param state
   */
  triggerHVACStatusChangedFlow(device, tokens = {}, state = {}) {
    this.log('triggerHVACStatusChangedFlow()');
    this._flowCardTriggerDeviceHVACStatusChanged
      .trigger(device, tokens, state)
      .catch(this.error);
  }

  /**
   * Method that triggers the FlowCardTriggerDevice instance for a changed HVAC mode.
   * @param device
   * @param tokens
   * @param state
   */
  triggerHVACModeChangedFlow(device, tokens = {}, state = {}) {
    this.log('triggerHVACModeChangedFlow()');
    this._flowCardTriggerDeviceHVACModeChanged
      .trigger(device, tokens, state)
      .catch(this.error);
  }

  _registerFlowCardConditions() {
    new Homey.FlowCardCondition(FLOW_CARD_CONDITION_HVAC_STATUS)
      .register()
      .registerRunListener(NestThermostatDriver._onFlowCardConditionHVACStatus.bind(this));

    new Homey.FlowCardCondition(FLOW_CARD_CONDITION_HVAC_MODE)
      .register()
      .registerRunListener(NestThermostatDriver._onFlowCardConditionHVACMode.bind(this));
  }

  _registerFlowCardActions() {
    new Homey.FlowCardAction(FLOW_CARD_ACTION_HVAC_MODE)
      .register()
      .registerRunListener(NestThermostatDriver._onFlowCardActionHVACMode.bind(this));
  }

  _registerFlowCardTriggerDevices() {
    this._flowCardTriggerDeviceHVACStatusChanged = new Homey.FlowCardTriggerDevice(FLOW_CARD_TRIGGER_DEVICE_HVAC_STATUS_CHANGED)
      .register()
      .registerRunListener(this._onFlowCardTriggerDeviceHVACStatusChanged.bind(this));

    this._flowCardTriggerDeviceHVACModeChanged = new Homey.FlowCardTriggerDevice(FLOW_CARD_TRIGGER_DEVICE_HVAC_MODE_CHANGED)
      .register()
      .registerRunListener(this._onFlowCardTriggerDeviceHVACModeChanged.bind(this));
  }

  static async _onFlowCardConditionHVACStatus(args = {}) {
    this.log('_onFlowCardConditionHVACStatus()');
    if (Object.prototype.hasOwnProperty.call(args, 'status')
      && (Object.prototype.hasOwnProperty.call(args, 'device')
        || Object.prototype.hasOwnProperty.call(args, 'deviceData'))) {
      const device = args.device || args.deviceData; // Legacy
      const result = device.hvac_state === args.status;
      this.log('_onFlowCardConditionHVACStatus() -> returned', result);
      return result;
    }
    throw new Error(Homey.__('error.missing_argument'));
  }

  static async _onFlowCardConditionHVACMode(args = {}) {
    this.log('_onFlowCardConditionHVACMode()');
    if (Object.prototype.hasOwnProperty.call(args, 'mode')
      && (Object.prototype.hasOwnProperty.call(args, 'device')
        || Object.prototype.hasOwnProperty.call(args, 'deviceData'))) {
      const device = args.device || args.deviceData; // Legacy
      const result = device.hvac_mode === args.mode;
      this.log('_onFlowCardConditionHVACMode() -> returned', result);
      return result;
    }
    throw new Error(Homey.__('error.missing_argument'));
  }

  static async _onFlowCardActionHVACMode(args = {}) {
    this.log('_onFlowCardActionHVACMode()');

    if (Object.prototype.hasOwnProperty.call(args, 'mode')
      && (Object.prototype.hasOwnProperty.call(args, 'device')
        || Object.prototype.hasOwnProperty.call(args, 'deviceData'))) {
      const device = args.device || args.deviceData; // Legacy

      this.log('_onFlowCardActionHVACMode() -> setHvacMode:', args.mode);

      // Try to set HVAC mode
      return device.setHvacMode(args.mode);
    }
    throw new Error(Homey.__('error.missing_argument'));
  }

  async _onFlowCardTriggerDeviceHVACStatusChanged(args = {}) {
    this.log('_onFlowCardTriggerDeviceHVACStatusChanged()');
    if (Object.prototype.hasOwnProperty.call(args, 'status')
      && Object.prototype.hasOwnProperty.call(args, 'device')) {
      const device = args.device || args.deviceData; // Legacy
      const result = device.hvac_state === args.status;
      this.log('_onFlowCardTriggerDeviceHVACStatusChanged() -> returned', result);
      return result;
    }
    throw new Error(Homey.__('error.missing_argument'));
  }

  async _onFlowCardTriggerDeviceHVACModeChanged(args = {}) {
    this.log('_onFlowCardTriggerDeviceHVACStatusChanged');
    if (Object.prototype.hasOwnProperty.call(args, 'mode')
      && Object.prototype.hasOwnProperty.call(args, 'device')) {
      const device = args.device || args.deviceData; // Legacy
      const result = device.hvac_mode === args.mode;
      this.log('_onFlowCardTriggerDeviceHVACStatusChanged() -> returned', result);
      return result;
    }
    throw new Error(Homey.__('error.missing_argument'));
  }
}

module.exports = NestThermostatDriver;

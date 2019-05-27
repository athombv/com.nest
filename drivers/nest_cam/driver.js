'use strict';

const Homey = require('homey');

const NestDriver = require('../../lib/NestDriver');
const { DRIVER_TYPE } = require('../../constants');

const FLOW_CARD_CONDITION_IS_STREAMING = 'is_streaming';
const FLOW_CARD_ACTION_CREATE_SNAPSHOT = 'create_snapshot';
const FLOW_CARD_CONDITION_EVENT_IS_HAPPENING = 'on_going_event';
const FLOW_CARD_TRIGGER_DEVICE_EVENT_STARTED = 'event_started';
const FLOW_CARD_TRIGGER_DEVICE_EVENT_STOPPED = 'event_stopped';
const FLOW_CARD_TRIGGER_DEVICE_SNAPSHOT_CREATED = 'snapshot_created';
const FLOW_CARD_TRIGGER_DEVICE_STARTED_STREAMING = 'started_streaming';
const FLOW_CARD_TRIGGER_DEVICE_STOPPED_STREAMING = 'stopped_streaming';

class NestCamDriver extends NestDriver {
  onInit() {
    // Set correct driver type
    this.driverType = DRIVER_TYPE.CAMERAS;

    // Register Flow cards
    this._registerFlowCardActions();
    this._registerFlowCardConditions();
    this._registerFlowCardTriggerDevices();
  }

  /**
   * Method that triggers the FlowCardTriggerDevice instance when device started streaming.
   * @param device
   * @param tokens
   * @param state
   */
  triggerStartedStreamingFlow(device, tokens = {}, state = {}) {
    this.log('triggerStartedStreamingFlow()');
    this._flowCardTriggerDeviceStartedStreaming
      .trigger(device, tokens, state)
      .catch(this.error);
  }

  /**
   * Method that triggers the FlowCardTriggerDevice instance when device stopped streaming.
   * @param device
   * @param tokens
   * @param state
   */
  triggerStoppedStreamingFlow(device, tokens = {}, state = {}) {
    this.log('triggerStoppedStreamingFlow()');
    this._flowCardTriggerDeviceStoppedStreaming
      .trigger(device, tokens, state)
      .catch(this.error);
  }

  /**
   * Method that triggers the FlowCardTriggerDevice instance when event started.
   * @param device
   * @param tokens
   * @param state
   */
  triggerEventStartedFlow(device, tokens = {}, state = {}) {
    this.log('triggerEventStartedFlow()');
    this._flowCardTriggerDeviceEventStarted
      .trigger(device, tokens, state)
      .catch(this.error);
  }

  /**
   * Method that triggers the FlowCardTriggerDevice instance when event stopped.
   * @param device
   * @param tokens
   * @param state
   */
  triggerEventStoppedFlow(device, tokens = {}, state = {}) {
    this.log('triggerEventStoppedFlow()');
    this._flowCardTriggerDeviceEventStopped
      .trigger(device, tokens, state)
      .catch(this.error);
  }

  /**
   * Method that triggers the FlowCardTriggerDevice instance when snapshot was created.
   * @param device
   * @param tokens
   * @param state
   */
  triggerSnapshotCreatedFlow(device, tokens = {}, state = {}) {
    this.log('triggerSnapshotCreatedFlow()');
    this._flowCardTriggerDeviceSnapshotCreated
      .trigger(device, tokens, state)
      .catch(this.error);
  }

  _registerFlowCardActions() {
    new Homey.FlowCardAction(FLOW_CARD_ACTION_CREATE_SNAPSHOT)
      .register()
      .registerRunListener(NestCamDriver._onFlowCardActionCreateSnapshot.bind(this));
  }

  _registerFlowCardConditions() {
    new Homey.FlowCardCondition(FLOW_CARD_CONDITION_IS_STREAMING)
      .register()
      .registerRunListener(NestCamDriver._onFlowCardConditionIsStreaming.bind(this));

    new Homey.FlowCardCondition(FLOW_CARD_CONDITION_EVENT_IS_HAPPENING)
      .register()
      .registerRunListener(NestCamDriver._onFlowCardConditionEventIsHappening.bind(this));
  }

  _registerFlowCardTriggerDevices() {
    this._flowCardTriggerDeviceSnapshotCreated = new Homey.FlowCardTriggerDevice(FLOW_CARD_TRIGGER_DEVICE_SNAPSHOT_CREATED)
      .register();
    this._flowCardTriggerDeviceStartedStreaming = new Homey.FlowCardTriggerDevice(FLOW_CARD_TRIGGER_DEVICE_STARTED_STREAMING)
      .register();
    this._flowCardTriggerDeviceStoppedStreaming = new Homey.FlowCardTriggerDevice(FLOW_CARD_TRIGGER_DEVICE_STOPPED_STREAMING)
      .register();
    this._flowCardTriggerDeviceEventStarted = new Homey.FlowCardTriggerDevice(FLOW_CARD_TRIGGER_DEVICE_EVENT_STARTED)
      .register();
    this._flowCardTriggerDeviceEventStopped = new Homey.FlowCardTriggerDevice(FLOW_CARD_TRIGGER_DEVICE_EVENT_STOPPED)
      .register();
  }

  static async _onFlowCardActionCreateSnapshot(args = {}) {
    if (Object.prototype.hasOwnProperty.call(args, 'device')) {
      // Try to create new snapshot
      return args.device.updateSnapshot();
    }
    throw new Error(Homey.__('error.missing_argument'));
  }

  static async _onFlowCardConditionIsStreaming(args = {}) {
    if (Object.prototype.hasOwnProperty.call(args, 'device')) {
      const result = args.device.is_streaming;
      this.log('_onFlowCardConditionIsStreaming() -> returned', result);
      return result;
    }
    throw new Error(Homey.__('error.missing_argument'));
  }

  static async _onFlowCardConditionEventIsHappening(args = {}) {
    if (Object.prototype.hasOwnProperty.call(args, 'device')) {
      const result = args.device.eventIsHappening;
      this.log('_onFlowCardConditionEventIsHappening() -> returned', result);
      return result;
    }
    throw new Error(Homey.__('error.missing_argument'));
  }
}

module.exports = NestCamDriver;

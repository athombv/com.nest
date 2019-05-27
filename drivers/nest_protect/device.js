'use strict';

const NestDevice = require('../../lib/NestDevice');
const {
  CAPABILITIES, NEST_CAPABILITIES, SMOKE_ALARM_STATES, CO_ALARM_STATES,
} = require('../../constants');

class NestProtect extends NestDevice {
  /**
   * Getter for device specific capabilities
   * @returns {*[]}
   */
  get capabilities() {
    return [
      NEST_CAPABILITIES.BATTERY_HEALTH,
      NEST_CAPABILITIES.CO_ALARM_STATE,
      NEST_CAPABILITIES.SMOKE_ALARM_STATE,
    ];
  }

  /**
   * Method that is called when a capability value update is received.
   * @param capabilityId
   * @param value
   */
  onCapabilityValue(capabilityId, value) {
    if (capabilityId === NEST_CAPABILITIES.CO_ALARM_STATE) {
      if (!((this.co_alarm_state === CO_ALARM_STATES.WARNING
        || this.co_alarm_state === CO_ALARM_STATES.EMERGENCY)
        && (value === CO_ALARM_STATES.WARNING
          || value === CO_ALARM_STATES.EMERGENCY))) {
        this.setCapabilityValue(CAPABILITIES.ALARM_CO, (value !== CO_ALARM_STATES.OK)).catch(this.error);
      }
    }

    if (capabilityId === NEST_CAPABILITIES.SMOKE_ALARM_STATE) {
      if (!((this.smoke_alarm_state === SMOKE_ALARM_STATES.WARNING
        || this.smoke_alarm_state === SMOKE_ALARM_STATES.EMERGENCY)
        && (value === SMOKE_ALARM_STATES.WARNING
          || value === SMOKE_ALARM_STATES.EMERGENCY))) {
        this.setCapabilityValue(CAPABILITIES.ALARM_SMOKE, (value !== SMOKE_ALARM_STATES.OK)).catch(this.error);
      }
    }

    if (capabilityId === NEST_CAPABILITIES.BATTERY_HEALTH) {
      this.setCapabilityValue(CAPABILITIES.ALARM_BATTERY, (value !== SMOKE_ALARM_STATES.OK)).catch(this.error);
    }
  }
}

module.exports = NestProtect;

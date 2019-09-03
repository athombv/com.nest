'use strict';

module.exports.DRIVER_TYPE = {
  THERMOSTATS: 'thermostats',
  CAMERAS: 'cameras',
  SMOKE_CO_ALARMS: 'smoke_co_alarms',
};

module.exports.NEST_CAPABILITIES = {
  HUMIDITY: 'humidity',
  HVAC_MODE: 'hvac_mode',
  LAST_EVENT: 'last_event',
  HVAC_STATE: 'hvac_state',
  IS_STREAMING: 'is_streaming',
  SNAPSHOT_URL: 'snapshot_url',
  BATTERY_HEALTH: 'battery_health',
  CO_ALARM_STATE: 'co_alarm_state',
  SMOKE_ALARM_STATE: 'smoke_alarm_state',
  TARGET_TEMPERATURE_C: 'target_temperature_c',
  AMBIENT_TEMPERATURE_C: 'ambient_temperature_c',
};

module.exports.CAPABILITIES = {
  ALARM_CO: 'alarm_co',
  ALARM_SMOKE: 'alarm_smoke',
  ALARM_BATTERY: 'alarm_battery',
  MEASURE_HUMIDITY: 'measure_humidity',
  TARGET_TEMPERATURE: 'target_temperature',
  MEASURE_TEMPERATURE: 'measure_temperature',
};

module.exports.SETTINGS = {
  ECO_OVERRIDE_ALLOW: 'eco_override_allow',
  ECO_OVERRIDE_BY: 'eco_override_by',
};

module.exports.SMOKE_ALARM_STATES = {
  OK: 'ok',
  WARNING: 'warning',
  EMERGENCY: 'emergency',
};

module.exports.CO_ALARM_STATES = {
  OK: 'ok',
  WARNING: 'warning',
  EMERGENCY: 'emergency',
};

module.exports.HVAC_MODE = {
  OFF: 'off',
  HEAT: 'heat',
  COOL: 'cool',
  HEAT_COOL: 'heat-cool',
  ECO: 'eco',
};

module.exports.DEVICE_DATA_EVENT = 'deviceDataEvent';
module.exports.CLIENT_VERSION_SETTING_KEY = 'clientVersionNestAccount';

module.exports.NEST_API_URL = 'https://developer-api.nest.com/';
module.exports.NEST_TOKEN_URL = 'https://api.home.nest.com/oauth2/access_token';
module.exports.NEST_REDIRECT_URL = 'https://callback.athom.com/oauth2/callback/';
module.exports.NEST_AUTHORIZATION_URL = 'https://home.nest.com/login/oauth2';

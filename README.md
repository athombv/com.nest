# Nest App for Homey

This app provides support for the following devices:

- Nest Learning Thermostat
- Nest Thermostat E (except for the Thermostat E with Heat Link in the EU)
- Nest Protect Smoke and CO Alarm

Unfortunately, the Nest API currently [does not support](https://developers.nest.com/reference/api-thermostat) the Nest Thermostat E with Heat Link in the EU.

You can use this app to:

- Control and read the target temperature
- Read the measured temperature
- Get emergency notifications for smoke, carbonoxide and battery level
- Use the Nest Away state in your Flows
- Use HVAC _(Heating, Ventilating, and Air Conditioning)_ in your Flows:
    - HVAC state _(actively heating, actively cooling or not active)_ trigger and condition;
    - HVAC mode _(heating mode, cooling mode, heating and cooling mode, eco mode or system is off)_ trigger, condition and action.
- If set in a thermostat's device settings: Homey can override that thermostat's eco HVAC mode to regain control of the target temperature.
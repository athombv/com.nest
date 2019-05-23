# Nest App for Homey

Note: this app will stop working after August 31st 2019. [Read more](https://mailchi.mp/16841c6489fc/your-homey-nest-integration-will-stop-working).

This app provides support for the following devices:

- Nest Learning Thermostat
- Nest Thermostat E (except for the Thermostat E with Heat Link in the EU)
- Nest Protect Smoke and CO Alarm
- Nest Cam Indoor, Nest Cam Outdoor, Nest Cam IQ Indoor, Nest Cam IQ Outdoor and Nest Hello

Unfortunately, the Nest API currently [does not support](https://developers.nest.com/reference/api-thermostat) the Nest Thermostat E with Heat Link in the EU. Please be aware that some Nest Cam functionality might require a Nest Aware subscription)

You can use this app to:

- Control and read the target temperature
- Read the measured temperature
- Get emergency notifications for smoke, carbonoxide and battery level
- Use the Nest Away mode in your Flows as Trigger, Condition and Action.
- Use HVAC _(Heating, Ventilating, and Air Conditioning)_ in your Flows:
    - HVAC state _(actively heating, actively cooling or not active)_ trigger and condition;
    - HVAC mode _(heating mode, cooling mode, heating and cooling mode, eco mode or system is off)_ trigger, condition and action.
- If set in a thermostat's device settings: Homey can override that thermostat's eco HVAC mode to regain control of the target temperature.
- Get a snapshot image from a Nest Cam
- Use Nest Cam events in your Flows (Nest Aware subscription required)

var nestDriver = require( '../nest_driver.js' );

/**
 * Initially store devices present on Homey, and try to authenticate
 * @param devices_data
 * @param callback
 */
module.exports.init = function ( devices_data, callback ) {

    // Pass already installed devices to nestDriver
    if ( devices_data.length > 0 ) {
        nestDriver.storeDevices( devices_data );
    }

    // Authenticate using access_token
    nestDriver.authWithToken( function ( success ) {
        if ( success ) {

            // Already authorized
            Homey.log( 'Authorization with Nest successful' );

            // Fetch new device data
            nestDriver.fetchDeviceData( 'thermostats', callback );
        }
        else {
            // Get new access_token and authenticate with Nest
            Homey.log( 'Initializing driver failed, try adding devices.' );

            // Not ready
            callback();
        }
    } );
};

/**
 * Pairing process that starts with authentication with nest, and declares some callbacks when devices are added and
 * removed
 */
module.exports.pair = {

    /**
     * Passes credentials to front-end, to be used to construct the authorization url,
     * gets called when user initiates pairing process
     */
    authenticate: function ( callback, emit ) {

        // Authenticate using access_token
        nestDriver.authWithToken( function ( success ) {
            if ( success ) {
                Homey.log( 'Authorization with Nest successful' );

                // Fetch new device data
                nestDriver.fetchDeviceData( 'thermostats', callback );
            }
            else {
                // Get new access_token and authenticate with Nest
                nestDriver.fetchAccessToken( function ( result ) {

                    // Fetch new device data
                    nestDriver.fetchDeviceData( 'thermostats' );

                    callback( result );
                }, emit );
            }
        } );
    },

    /**
     * Called when user is presented the list_devices template,
     * this function fetches all available devices from the Nest
     * API and displays them to be selected by the user for adding
     */
    list_devices: function ( callback ) {

        // Listen for incoming data from nestDriver
        nestDriver.fetchDeviceData( 'thermostats', callback );
    },

    /**
     * When a user adds a device, make sure the driver knows about it
     */
    add_device: function ( callback, emit, data ) {
        nestDriver.addDevice( data );
    }
};

/**
 * These represent the capabilities of the Nest Thermostat
 */
module.exports.capabilities = {

    target_temperature: {
        get: function ( device, callback ) {

            if ( device instanceof Error ) return callback( device );

            // Get device data
            var thermostat = nestDriver.getDeviceData( device.id );

            callback( thermostat.target_temperature_c );
        },
        set: function ( device, temperature, callback ) {

            // Catch faulty trigger
            if ( !temperature ) {
                callback();
                return false;
            }

            // Get device data
            var thermostat = nestDriver.getDeviceData( device.id );

            // Perform api call
            setTemperature( thermostat, temperature, thermostat.temperature_scale );

            if ( callback ) callback( temperature );
        }
    },

    measure_temperature: {
        get: function ( device, callback ) {
            if ( device instanceof Error ) return callback( device );

            // Get device data
            var thermostat = nestDriver.getDeviceData( device.id );

            // Callback ambient temperature
            callback( thermostat.ambient_temperature_c );
        }
    },

    heating: {
        get: function ( device, callback ) {
            if ( device instanceof Error ) return callback( device );

            // Get device data
            var thermostat = nestDriver.getDeviceData( device.id );

            // Get HVAC mode
            var mode = (thermostat.hvac_mode == 'heat') ? true : false;

            if ( callback ) callback( mode );
        },
        set: function ( device, data, callback ) {

            setHvacMode( device, 'heat' );

            if ( callback ) callback();
        }
    },

    cooling: {
        get: function ( device, callback ) {
            if ( device instanceof Error ) return callback( device );

            // Get device data
            var thermostat = nestDriver.getDeviceData( device.id );

            // Get HVAC mode
            var mode = (thermostat.hvac_mode == 'cool') ? true : false;

            if ( callback ) callback( mode );
        },
        set: function ( device, data, callback ) {

            setHvacMode( device, 'cool' );

            if ( callback ) callback();
        }
    }
};

/**
 * When a device gets deleted, make sure to clean up
 * @param device_data
 */
module.exports.deleted = function ( device_data ) {
    // run when the user has deleted the device from Homey
    nestDriver.removeDevice( device_data );
};

/**
 * Function that connects to the Nest API and performs a temperature update if possible
 * @param thermostat
 * @param degrees
 * @param scale
 * @param type
 */
function setTemperature ( thermostat, degrees, scale, type ) {

    // Make sure connection is set-up
    nestDriver.authWithToken( function ( success ) {
        if ( success ) {
            scale = scale.toLowerCase();
            type = type ? type + '_' : '';

            var path = getApiPath( thermostat ) + '/target_temperature_' + type + scale;

            // Check for blocking events
            if ( thermostat.is_using_emergency_heat ) {
                Homey.log( "Can't adjust target temperature while using emergency heat." );
            }
            else if ( thermostat.hvac_mode === 'heat-cool' && !type ) {
                Homey.log( "Can't adjust target temperature while in Heat • Cool mode, use target_temperature_high/low instead." );
            }
            else if ( type && thermostat.hvac_mode !== 'heat-cool' ) {
                Homey.log( "Can't adjust target temperature " + type + " while in " + thermostat.hvac_mode + " mode, use target_temperature instead." );
            }
            else if ( thermostat.structure.away.indexOf( 'away' ) > -1 ) {
                Homey.log( "Can't adjust target temperature while structure is set to Away or Auto-away." );
            }
            else {
                // All clear to change the target temperature
                nestDriver.socket.child( path ).set( degrees );
            }
        }
        else {
            Homey.log( 'Error, not authenticated' );
        }
    } );
}

/**
 * Set thermostat to heating or cooling mode
 * @param thermostat
 * @param mode (String: 'heat'/'cool'/'heat-cool')
 */
function setHvacMode ( thermostat, mode ) {

    // Construct API path
    var path = getApiPath( thermostat ) + '/hvac_mode';

    // Make sure connection is set-up
    nestDriver.authWithToken( function ( success ) {
        if ( success ) {

            // Set updated mode
            nestDriver.socket.child( path ).set( mode );
        }
        else {
            Homey.log( 'Error, not authenticated' );
        }
    } );
}

/**
 * Create API path for communication with Nest
 * @param thermostat
 * @returns {string} API path
 */
function getApiPath ( thermostat ) {
    return 'devices/thermostats/' + thermostat.device_id;
}
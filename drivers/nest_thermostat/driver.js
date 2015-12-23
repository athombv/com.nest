/**
 * Import nest driver and underscore
 */
var nestDriver = require( '../nest/driver.js' );
var _ = require( 'underscore' );

/**
 * devices stores all devices registered on the users nest account
 * installedDevices is an array holding the ID's of installed devices
 */
var devices = [];
var installedDevices = [];

/**
 * Initially store devices present on Homey, and try to authenticate
 * @param devices_data
 * @param callback
 */
module.exports.init = function ( devices_data, callback ) {

    // Pass already installed devices to nestDriver
    devices_data.forEach( function ( device_data ) {

        // Register installed devices
        installedDevices.push( device_data.id );
    } );

    // Authenticate using access_token
    nestDriver.authWithToken( function ( success ) {
        if ( success ) {

            // Already authorized
            Homey.log( 'Authorization with Nest successful' );
        }
        else {
            // Get new access_token and authenticate with Nest
            Homey.log( 'Initializing driver failed, try adding devices.' );
        }
    } );

    // Fetch data
    nestDriver.fetchDeviceData( 'thermostats', devices );

    // And keep listening for updated data
    nestDriver.events.on( 'thermostats_devices', function ( data ) {

        devices = _.filter(data [0], function(val){
            return _.some(this,function(val2){
                return val2 === val.data.id;
            });
        }, data [ 1 ]);

        // Store latest devices + data internally
        //devices = data[ 0 ];

        // Check for each device if unreachable and check if installedDevices contains unreachable device
        installedDevices.forEach( function ( device_id ) {
            nestDriver.registerDeviceReachability( data [ 0 ], data [ 1 ], installedDevices, device_id );
        } );

        // Update to usable installed devices
        installedDevices = _.intersection( installedDevices, data[ 1 ] );
    } );

    // Handle not authenticated by disabling devices
    nestDriver.events.on( 'not_authenticated', function () {

        // Not authenticated with Nest, so no devices in API available
        installedDevices.forEach( function ( device_id ) {
            nestDriver.registerDeviceReachability( devices, [], installedDevices, device_id );
        } );
    } );

    // Handle authenticated, to re-enable devices
    nestDriver.events.on( 'authenticated', function () {
        nestDriver.fetchDeviceData( 'thermostats', devices );
    } );

    // Bind realtime updates to changes in devices
    bindRealtimeUpdates();

    // Ready
    callback( true );
};

module.exports.pair = function ( socket ) {

    /**
     * Passes credentials to front-end, to be used to construct the authorization url,
     * gets called when user initiates pairing process
     */
    socket.on("authenticate", function ( data, callback ) {
        // Authenticate using access_token
        nestDriver.authWithToken( function ( success ) {
            if ( success ) {
                Homey.log( 'Authorization with Nest successful' );

                // Fetch data
                nestDriver.fetchDeviceData( 'thermostats', devices );

                // Continue to list devices
                callback(null, true);
            }
            else {
                // Get new access_token and authenticate with Nest
                nestDriver.fetchAccessToken( function ( result ) {
                    callback(null, result);
                }, socket );
            }
        } );
    });

    /**
     * Called when user is presented the list_devices template,
     * this function fetches relevant data from devices and passes
     * it to the front-end
     */
    socket.on( 'list_devices', function ( data, callback ) {
        // Create device list from found devices
        var devices_list = [];
        devices.forEach( function ( device ) {
            devices_list.push( {
                data: {
                    id: device.data.id
                },
                name: device.name
            } );
        } );

        // Return list to front-end
        callback( null, devices_list );
    } );

    /**
     * When a user adds a device, make sure the driver knows about it
     */
    socket.on( 'add_device', function ( device, callback) {

        // Mark device as installed
        installedDevices.push( device.data.id );

        if (callback) callback(null, device.data.id);
    } );
}

/**
 * These represent the capabilities of the Nest Thermostat
 */
module.exports.capabilities = {

    target_temperature: {
        get: function ( device, callback ) {
            if ( device instanceof Error ) return callback( device );

            // Make sure we are authenticated
            nestDriver.authWithToken();

            // Get device data
            var thermostat = nestDriver.getDevice( devices, installedDevices, device.id );
            if ( !thermostat ) return callback( device );

            callback( null, thermostat.data.target_temperature_c );
        },
        set: function ( device, temperature, callback ) {
            if ( device instanceof Error ) return callback( device );

            // Make sure we are authenticated
            nestDriver.authWithToken();

            // Catch faulty trigger
            if ( !temperature ) {
                callback();
                return false;
            }
            else if ( temperature < 9 ) {
                temperature = 9;
            }
            else if ( temperature > 32 ) {
                temperature = 32;
            }

            // Get device data
            var thermostat = nestDriver.getDevice( devices, installedDevices, device.id );
            if ( !thermostat ) return callback( device );

            // Perform api call
            setTemperature( thermostat.data, Math.round( temperature * 2 ) / 2, 'c' );

            if ( callback ) callback( null, Math.round( temperature * 2 ) / 2 );
        }
    },

    measure_temperature: {
        get: function ( device, callback ) {
            if ( device instanceof Error ) return callback( device );

            // Make sure we are authenticated
            nestDriver.authWithToken();

            // Get device data
            var thermostat = nestDriver.getDevice( devices, installedDevices, device.id );
            if ( !thermostat ) return callback( device );

            // Callback ambient temperature
            callback( null, thermostat.data.ambient_temperature_c );
        }
    }
};

/**
 * When a device gets deleted, make sure to clean up
 */
module.exports.deleted = function ( device_data ) {

    // Remove ID from installed devices array
    for ( var x = 0; x < installedDevices.length; x++ ) {
        if ( installedDevices[ x ] === device_data.id ) {
            installedDevices = _.reject( installedDevices, function ( id ) {
                return id === device_data.id;
            } );
        }
    }
};

/**
 * Listens for specific changes on thermostats, and triggers
 * realtime updates if necessary
 */
function bindRealtimeUpdates () {

    // Listen for incoming value events
    nestDriver.socket.child( 'devices/thermostats' ).once( 'value', function ( snapshot ) {

        for ( var id in snapshot.val() ) {
            var device_id = snapshot.child( id ).child( 'device_id' ).val();

            // Listen for specific changes
            listenForChange( device_id, id, 'target_temperature_c', 'target_temperature' );
            listenForChange( device_id, id, 'ambient_temperature_c', 'measure_temperature' );
        }
    } );

    var listenForChange = function ( device_id, id, attribute, capability ) {
        var init = true;
        nestDriver.socket.child( 'devices/thermostats/' + id + '/' + attribute ).on( 'value', function ( value ) {
            var device = nestDriver.getDevice( devices, installedDevices, device_id );

            // Check if device is present, and skip initial event (on device added)
            if ( device && device.data && !init ) {
                module.exports.realtime( device.data, capability, value.val() );
            }
            init = false;
        } );
    };
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
            Homey.log( 'Set Temperature to: ' + degrees );

            scale = scale.toLowerCase();
            type = type ? type + '_' : '';

            var path = getApiPath( thermostat ) + '/target_temperature_' + type + scale;

            // Check for blocking events
            if ( thermostat.is_using_emergency_heat ) {
                Homey.log( "Can't adjust target temperature while using emergency heat." );
            }
            else if ( thermostat.hvac_mode === 'heat-cool' && !type ) {
                // Set correct hvac mode for desired temperature
                setHvacMode( thermostat, (thermostat.ambient_temperature_c > degrees) ? 'cool' : 'heat', function(err, result){
                    if(!err && result){
                        // All clear to change the target temperature
                        nestDriver.socket.child( path ).set( degrees );
                    }
                } );
            }
            else if ( type && thermostat.hvac_mode !== 'heat-cool' ) {
                // Set correct hvac mode for desired temperature
                setHvacMode( thermostat, (thermostat.ambient_temperature_c > degrees) ? 'cool' : 'heat', function(err, result){
                    if(!err && result){
                        // All clear to change the target temperature
                        nestDriver.socket.child( path ).set( degrees );
                    }
                } );
            }
            else if ( thermostat.structure_away.indexOf( 'away' ) > -1 ) {
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
function setHvacMode ( thermostat, mode, callback ) {
    Homey.log( 'setHvacMode ' + mode );

    // Construct API path
    var path = getApiPath( thermostat ) + '/hvac_mode';

    // Make sure connection is set-up
    nestDriver.authWithToken( function ( success ) {
        if ( success ) {

            // Set updated mode
            nestDriver.socket.child( path ).set( mode );

            callback(false, true)
        }
        else {
            Homey.log( 'Error, not authenticated' );

            callback(true, false);
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
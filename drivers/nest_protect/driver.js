var nestDriver = require( '../nest_driver.js' );

/**
 * Initially store devices present on Homey, and try to authenticate
 * @param devices_data
 * @param callback
 */
module.exports.init = function ( devices_data, callback ) {

    // Pass already installed devices to nestDriver
    if ( devices_data.length > 0 ) {
        nestDriver.storeDevices( devices_data, listenForAlarms );
    }

    // Authenticate
    nestDriver.authWithToken( function ( success ) {
        if ( success ) {
            // Already authorized
            Homey.log( 'Authorization with Nest successful' );

            // Fetch new device data
            nestDriver.fetchDeviceData( 'smoke_co_alarms', callback );
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
                nestDriver.fetchDeviceData( 'smoke_co_alarms', callback );

            }
            else {

                // Get new access_token and authenticate with Nest
                nestDriver.fetchAccessToken( function ( result ) {

                    // Fetch new device data
                    nestDriver.fetchDeviceData( 'smoke_co_alarms' );

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
        nestDriver.fetchDeviceData( 'smoke_co_alarms', callback );
    },

    /**
     * When a user adds a device, make sure the driver knows about it
     */
    add_device: function ( callback, emit, device ) {
        nestDriver.addDevice( device.data, listenForAlarms );
    }
};

/**
 * These represent the capabilities of the Nest Protect
 */
module.exports.capabilities = {

    alarm_co: {
        get: function ( device_data, callback ) {
            var value = (nestDriver.getDeviceData( device_data.id ).co_alarm_state !== 'ok');
            if ( callback ) callback( value );

            // Return casted boolean of co_alarm (int)
            return value;
        }
    },

    alarm_co2: {
        get: function ( device_data, callback ) {
            var value = (nestDriver.getDeviceData( device_data.id ).smoke_alarm_state !== 'ok');
            if ( callback ) callback( value );

            // Return casted boolean of smoke_alarm_state (int)
            return value;
        }
    },

    alarm_battery: {
        get: function ( device_data, callback ) {
            var value = (nestDriver.getDeviceData( device_data.id ).battery_health !== 'ok');
            if ( callback ) callback( value );

            // Return casted boolean of battery_health (int)
            return value;
        }
    }
};

/**
 * When a device gets deleted, make sure to clean up
 * @param device_data
 */
module.exports.deleted = function ( device_data ) {

    // Run when the user has deleted the device from Homey
    nestDriver.removeDevice( device_data );

    // Reset alarms
    listenForAlarms();
};

/**
 * Disables previous connections and creates new listeners on the updated set of installed devices
 */
function listenForAlarms () {

    // Remove possible previous listeners
    nestDriver.socket.off();

    // Listen for incoming value events
    nestDriver.socket.once( 'value', function ( snapshot ) {

        // Get alarms
        var alarms = snapshot.child( 'devices/smoke_co_alarms' );
        var stored_devices = nestDriver.getDevices( 'smoke_co_alarms' );

        for ( var x = 0; x < stored_devices.length; x++ ) {
            var device = stored_devices[ x ];

            // Check if alarms are activated
            for ( var id in alarms.val() ) {

                var alarm = alarms.child( id );

                // Only listen on added device
                if ( alarm.child( 'device_id' ).val() === device.id ) {

                    listenForSmokeAlarms( alarm );

                    listenForCOAlarms( alarm );

                    listenForBatteryAlarms( alarm );
                }
            }
        }
    } );
};

/**
 * Listen for smoke alarms on a Protect
 * @param alarm
 */
function listenForSmokeAlarms ( alarm ) {
    var alarmState;
    alarm.child( 'smoke_alarm_state' ).ref().on( 'value', function ( state ) {
        var device_data = nestDriver.getDeviceData( alarm.child( 'device_id' ).val() );
        switch ( state.val() ) {
            case 'warning':
                if ( alarmState !== 'warning' && device_data ) { // only alert the first change

                    // Trigger smoke_detected flow
                    Homey.manager( 'flow' ).trigger( 'smoke_detected' );
                }
                break;
            case 'emergency':
                if ( alarmState !== 'emergency' && device_data ) { // only alert the first change

                    // Trigger emergency_smoke_detected flow
                    Homey.manager( 'flow' ).trigger( 'emergency_smoke_detected' );
                }
                break;
        }
        alarmState = state.val();
    } );
};

/**
 * Listen for CO alarms on a Protect
 * @param alarm
 */
function listenForCOAlarms ( alarm ) {
    var alarmState;

    alarm.child( 'co_alarm_state' ).ref().on( 'value', function ( state ) {
        var device_data = nestDriver.getDeviceData( alarm.child( 'device_id' ).val() );

        switch ( state.val() ) {
            case 'warning':
                if ( alarmState !== 'warning' && device_data ) { // only alert the first change

                    // Trigger co_detected flow
                    Homey.manager( 'flow' ).trigger( 'co_detected' );
                }
                break;
            case 'emergency':
                if ( alarmState !== 'emergency' && device_data ) { // only alert the first change

                    // Trigger emergency_co_detected flow
                    Homey.manager( 'flow' ).trigger( 'emergency_co_detected' );
                }
                break;
        }
        alarmState = state.val();
    } );
};

/**
 * Listen for low battery on a Protect
 * @param alarm
 */
function listenForBatteryAlarms ( alarm ) {

    alarm.child( 'battery_health' ).ref().on( 'value', function ( state ) {
        var device_data = nestDriver.getDeviceData( alarm.child( 'device_id' ).val() );

        // Don't show battery alerts if a more
        // important alert is already showing
        if ( state.val() === 'replace' &&
            alarm.child( 'smoke_alarm_state' ).val() === 'ok' &&
            alarm.child( 'co_alarm_state' ).val() === 'ok' &&
            device_data ) {

            // Trigger battery_empty flow
            Homey.manager( 'flow' ).trigger( 'battery_empty' );
        }
    } );
};
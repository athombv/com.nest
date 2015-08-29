var Firebase = require( 'firebase' );
var request = require( 'request' );
var events = require( 'events' );
var _ = require( 'underscore' );

/**
 * Global array to store all the incoming Nest data in
 * @type {Array}
 */
var devices = [];

/**
 * Declare static nest driver variables
 * @type {Object}
 */
var nestDriver = {
    socket: new Firebase( 'wss://developer-api.nest.com' ),
    credentials: Homey.env.nestCredentials,
    events: new events.EventEmitter()
};

/**
 * Authenticate with Nest using access_token
 * @param callback
 */
nestDriver.authWithToken = function ( callback ) {

    // If already authenticated
    if ( !nestDriver.socket.getAuth() ) {

        // Authenticate using access_token
        nestDriver.socket.authWithCustomToken( nestDriver.credentials.access_token || '', function ( err ) {
            if ( err ) {
                callback( null );
            }
            else {
                callback( true );
            }
        } );
    }
    else {
        callback( true );
    }
};

/**
 * Starts OAuth2 flow with Nest to get authenticated
 */
nestDriver.fetchAccessToken = function ( callback, emit ) {

    // Reset access_token to make sure front-end doesn't receive old (invalid) tokens
    nestDriver.credentials.access_token = null;

    // Generate OAuth2 callback, this helps to catch the authorization token
    Homey.manager( 'cloud' ).generateOAuth2Callback( 'https://home.nest.com/login/oauth2?client_id=' + nestDriver.credentials.clientID + '&state=NEST',

        // Before fetching authorization code
        function ( err, result ) {

            // Pass needed credentials to front-end
            callback( { url: result } );
        },

        // After fetching authorization code
        function ( err, result ) {

            // Post authorization url with needed credentials
            request.post(
                'https://api.home.nest.com/oauth2/access_token?client_id=' + nestDriver.credentials.clientID + '&code=' + result + '&client_secret=' + nestDriver.credentials.clientSecret + '&grant_type=authorization_code', {
                    json: true
                }, function ( err, response, body ) {
                    if ( err ) {

                        // Catch error
                        Homey.log( err );
                    }
                    else {

                        // Store access token for later reference
                        nestDriver.credentials.access_token = body.access_token;

                        // Authenticate with Nest using the access_token
                        nestDriver.authWithToken( function ( success ) {
                            if ( success ) {
                                Homey.log( 'Authorization with Nest successful' );

                                // Let the front-end know we are authorized
                                emit( 'authorized' );
                            }
                            else {
                                Homey.log( '' + err );
                            }
                        } );
                    }
                }
            );
        }
    );
};

/**
 * Starts listening to incoming data from Nest, it keeps the devices array filled with the latest data
 * @param callback
 */
nestDriver.fetchDeviceData = function ( device_type, callback ) {

    // Listen for incoming value events
    nestDriver.socket.on( 'value', function ( snapshot ) {
        var data = snapshot.val();

        // To avoid piling up of devices
        var found_devices = [];

        // Loop over all devices from different categories
        for ( var device_category in data.devices ) {
            for ( var x in data.devices[ device_category ] ) {

                // Thermostat or smoke_co_alarms
                var device = data.devices[ device_category ][ x ];

                // Store device_id as id
                device[ "id" ] = device.device_id;

                // Store structure protect is in
                device[ "structure" ] = data.structures[ device.structure_id ];

                // Store device type in device_data
                device[ "type" ] = device_category;

                // Store access_token to enable quick re-authentication
                device[ "access_token" ] = nestDriver.credentials.access_token;

                // Add device to devices array
                found_devices.push( {
                    data: device,
                    name: (_.keys( data.structures ).length > 1) ? device.structure.name + ' - ' + device.name_long : device.name_long,
                    type: device_category
                } );
            }
        }

        // Give back the array containing all devices of the type that is asked for
        if ( callback ) callback( _.where( found_devices, { type: device_type } ) );

        // Emit event to notify
        nestDriver.events.emit( 'fetchedDeviceData', snapshot );
    } );
};

/**
 * Adds a device to the devices array
 * @param callback
 */
nestDriver.addDevice = function ( device, callback ) {
    // Add device
    devices.push( device );

    if ( callback ) callback()
};

/**
 * Removes a device from the devices array
 * @param device_data
 */
nestDriver.removeDevice = function ( device_data ) {
    // Removes device
    devices = _.reject( devices, function ( device ) {
        return device.id === device_data.id
    } );
};

/**
 * Searches all devices for the parameter device id, returns data object of device
 * @param device_id
 * @returns {*}
 */
nestDriver.getDeviceData = function ( device_id ) {
    for ( var x = 0; x < devices.length; x++ ) {
        if ( devices[ x ].id === device_id ) {
            return devices[ x ];
        }
    }
};

/**
 * Gets all devices from a specific device_type
 * @param device_type (thermostats/smoke_co_alarms)
 * @param callback
 * @returns {*}
 */
nestDriver.getDevices = function ( device_type, callback ) {

    if ( callback ) {
        callback( _.filter( devices, function ( device ) {
            return _.where( device, { type: device_type } );
        } ) );
    }
    else {
        return _.filter( devices, function ( device ) {
            return _.where( device, { type: device_type } );
        } );
    }
};

/**
 * Stores devices that are already installed when driver is initiated
 * @param init_devices (devices array)
 */
nestDriver.storeDevices = function ( init_devices, callback ) {

    // Store devices
    devices = init_devices;

    // Store access token from first device
    nestDriver.credentials.access_token = init_devices[ 0 ].access_token;

    if ( callback ) callback();
};

module.exports = nestDriver;
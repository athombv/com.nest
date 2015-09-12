/**
 * Include necessary dependencies
 */
var Firebase = require( 'firebase' );
var request = require( 'request' );
var _ = require( 'underscore' );
var events = require( 'events' );

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

nestDriver.fetchDeviceData = function ( device_type, devices ) {

    // First fetch structures
    nestDriver.socket.child( 'structures' ).on( 'value', function ( snapshot ) {
        var structures = snapshot.val();

        // Second fetch device data
        nestDriver.socket.child( 'devices/' + device_type ).on( 'value', function ( snapshot ) {
            var devices_data = snapshot.val();

            var devices_in_api = [];
            for ( var id in devices_data ) {
                var device_data = snapshot.child( id ).val();

                // Map device_id to id for internal use
                device_data.id = device_data.device_id;

                // Store access token for quick restart
                device_data.access_token = nestDriver.credentials.access_token;

                // Keep track of away state
                device_data.structure_away = _.findWhere( structures, device_data.structure_id ).away;

                // Create device object
                var device = {
                    data: device_data,
                    name: device_data.name_long
                };

                // Check if device already present, then replace it with new data
                var added = false;
                for ( var x = 0; x < devices.length; x++ ) {
                    if ( devices[ x ].data && devices[ x ].data.id === device_data.id ) {
                        devices [ x ].data = device_data;
                        added = true;
                    }
                }

                // If device was not already present in devices array, add it
                if ( !added ) {
                    console.log(device);
                    devices.push( device );
                }

                devices_in_api.push( device.data.id );
            }
            // Make sure if devices removed from API also removed as installed device
            nestDriver.events.emit( device_type + '_devices', [ devices, devices_in_api ] );

        } );
    } );
};

/**
 * Util function that returns device according to its id
 */
nestDriver.getDevice = function ( devices, installedDevices, device_id ) {
    var device = _.filter( devices, function ( device ) {
        if ( _.indexOf( installedDevices, device_id ) > -1 ) {
            return device.data.id === device_id;
        }
    } )[ 0 ];

    return device;
};

/**
 * Export nest driver
 */
module.exports = nestDriver;
/**
 * Include necessary dependencies
 */
var Firebase = require( 'firebase' );
var request = require( 'request' );
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

/**
 * Export nest driver
 */
module.exports = nestDriver;
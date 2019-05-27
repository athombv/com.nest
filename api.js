'use strict';

const Homey = require('homey');

const { isAppReady } = require('./util');

/**
 * Method that handles the login.
 * @param callback
 * @returns {Promise<*>}
 */
async function handleLogin(callback) {
  try {
    await Homey.app.login();
    return callback(null, true);
  } catch (err) {
    return callback(new Error(Homey.__('api.error_login_failed', { error: err.message || err.toString() })));
  }
}

/**
 * Method that handles the logout.
 * @param callback
 * @returns {Promise<*>}
 */
async function handleLogout(callback) {
  try {
    await Homey.app.logout();
    return callback(null, true);
  } catch (err) {
    return callback(new Error(Homey.__('api.error_logout_failed', { error: err.message || err.toString() })));
  }
}

module.exports = [
  {
    description: 'Get logged in state',
    method: 'GET',
    path: '/login/',
    fn: async (args, callback) => {
      if (!isAppReady()) return callback(new Error(Homey.__('api.retry')));

      // Try to get the authenticated state
      try {
        const authenticated = await Homey.app.isAuthenticated();
        return callback(null, authenticated);
      } catch (err) {
        return callback(new Error(Homey.__('api.error_get_authenticated_state', { error: err.message || err.toString() })));
      }
    },
  },
  {
    description: 'Set logged in state',
    method: 'POST',
    path: '/login/',
    fn: async (args = {}, callback) => {
      if (!isAppReady()) return callback(new Error(Homey.__('api.retry')));

      // Check if args has expected body with state property
      if (!args.body || !Object.prototype.hasOwnProperty.call(args.body, 'state') || typeof args.body.state !== 'boolean') {
        return callback(new Error(Homey.__('api.retry')));
      }

      // Login/logout based on state
      if (args.body.state === true) {
        await handleLogin(callback);
      } else {
        await handleLogout(callback);
      }
    },
  },
];

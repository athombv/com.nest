'use strict';

const Homey = require('homey');

module.exports.isAppReady = () => {
  return (Homey && Homey.app && typeof Homey.app.isAuthenticated === 'function' && typeof Homey.app.logout === 'function' && typeof Homey.app.login === 'function');
};

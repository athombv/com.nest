var nestDriver = require('./drivers/nest/driver.js');
module.exports = [
	{
		description: 'Authorize Nest',
		method: 'GET',
		path: '/authorized/',
		fn: function (callback, args) {

			// Trigger authorizations
			nestDriver.authWithToken(function (authorized) {
				clearTimeout(timeout);
				callback(null, authorized);
			});

			// Create timeout
			var timeout = setTimeout(function () {
				callback(true, null);
			}, 10000);
		}
	},
	{
		description: 'Deauthorize Nest',
		method: 'PUT',
		path: '/deauthorize/',
		fn: function (callback, args) {

			// Trigger authorizations
			nestDriver.removeWWNConnection(function (err, data) {
				clearTimeout(timeout);
				callback(err, data);
			});

			// Create timeout
			var timeout = setTimeout(function () {
				callback(true, null);
			}, 3000);
		}
	},
	{
		description: 'Authorize Nest',
		method: 'PUT',
		path: '/authorize/',
		fn: function (callback, args) {

			// Trigger authorizations
			nestDriver.fetchAuthorizationURL(function (err, data) {
				clearTimeout(timeout);
				callback(err, data);
			});

			// Create timeout
			var timeout = setTimeout(function () {
				callback(true, null);
			}, 3000);
		}
	}
];
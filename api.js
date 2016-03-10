module.exports = [
	{
		description: 'Authorize Nest',
		method: 'GET',
		path: '/authorized/',
		fn: function (callback, args) {

			// Trigger authorizations
			Homey.app.authWithToken(function (authorized) {
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
			Homey.app.removeWWNConnection(function (err, data) {
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
			Homey.app.fetchAuthorizationURL(function (err, data) {
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
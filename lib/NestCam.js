'use strict';

const Homey = require('homey');
const request = require('request');

const NestDevice = require('./NestDevice');

/**
 * Class representing NestCam, extends
 * NestDevice.
 */
class NestCam extends NestDevice {

	/**
	 * Pass options object to NestDevice.
	 * @param options
	 */
	constructor(options) {

		// Set proper device type
		if (options) options.device_type = 'cameras';

		super(options);

		// Store capabilities of camera
		this.capabilities = ['last_event', 'is_streaming'];
	}

	/**
	 * Set streaming capability of camera.
	 * @param onoff Boolean
	 */
	setStreaming(onoff) {

		// Authenticate
		this.nest_account.authenticate().then(() => {

			if (typeof onoff !== 'boolean') console.error('NestCam: setStreaming parameter "onoff" is not a boolean', onoff);

			// All clear to change the target temperature
			this.nest_account.db.child(`devices/cameras/${this.device_id}/is_streaming`).set(onoff);
		});
	}

	/**
	 * Fetch image from snapshot url.
	 * @returns {Promise}
	 */
	getImageBufferFromSnapshotUrl() {
		return new Promise((resolve, reject) => {

			// Can not fetch screenshot if not streaming
			if (!this.is_streaming) {
				return reject(Homey.__('error.not_streaming', {
					name: this.name_long,
				}));
			}

			// Fetch snapshot url
			this.nest_account.db.child(`devices/cameras/${this.device_id}/snapshot_url`).on('value', uri => {
				request.head(uri, err => {
					if (err) return reject('Downloading snapshot failed', err);
					request({url: uri, encoding: null}, (err, response, body) => {
						if (err) return reject(err);
						return resolve(new Buffer(body));
					});
				});
			});
		});
	}

	/**
	 * Fetch image from snapshot url.
	 * @returns {Promise}
	 */
	getImageBufferFromLastEventUrl(uri) {
		return new Promise((resolve, reject) => {

			// Fetch snapshot url
			request.head(uri, err => {
				if (err) return reject('Downloading last event image failed', err);
				request({url: uri, encoding: null}, (err, response, body) => {
					if (err) return reject(err);
					return resolve(new Buffer(body));
				});
			});
		});
	}
}

module.exports = NestCam;
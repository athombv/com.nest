'use strict';

const EventEmitter = require('events');

const _ = require('underscore');

/**
 * Abstract class that handles all common functionality
 * for the NestThermostat, NestProtect and NestCam.
 * It will listen for updates on the device, and call
 * the child's checkForChanges method to register changes
 * in data.
 */
class NestDevice extends EventEmitter {

	/**
	 * Creates a Nest device and starts listening
	 * for updates from the realtime database.
	 * Provide options object with device_id, device_type
	 * and db reference.
	 * @param options
	 */
	constructor(options) {
		super();

		// Check for valid options
		if (!options || !options.device_id || !options.device_type || !options.nest_account || !options.nest_account.db) {
			return console.error(options, 'NestDevice: could not construct NestDevice, invalid options object provided to constructor');
		}

		// Store provided options in this
		Object.assign(this, options);

		// Start listening for updates on this device
		this._listenForRealtimeUpdates();
	}

	get structure() {
		return _.findWhere(this.nest_account.structures, {structure_id: this.structure_id});
	}

	/**
	 * Listen for realtime updates from database.
	 * Call child's checkForChanges method with updated
	 * data to let it detect changes in data.
	 * @private
	 */
	_listenForRealtimeUpdates() {

		// Authenticate
		this.nest_account.authenticate().then(() => {

			// Listen for changes on this specific device
			this.nest_account.db.child(`devices/${this.device_type}`).child(this.device_id).on('value', this.checkForChanges.bind(this));
		});
	}

	/**
	 * Check incoming data update for changed values,
	 * emit corresponding events when data is changed.
	 * @param snapshot
	 */
	checkForChanges(snapshot) {
		const data = snapshot.val();

		// If no data in API indicate device is removed
		if (!data) return this.emit('removed');

		// Check if capabilities are set
		if (this.capabilities) {

			// Loop all registered capabilities
			this.capabilities.forEach(capability => {
				// Emit change
				this.emit(capability, data[capability]);
			});

			// Assign all values from snapshot to this instance
			Object.assign(this, data);
		}
	}

	/**
	 * Clean up the instance.
	 */
	destroy() {
		this.nest_account.db.child(`devices/${this.device_type}`).child(this.device_id).off('value', this.checkForChanges);
		console.log(`NestDevice: destroyed device ${this.device_id}`);
	}
}

module.exports = NestDevice;
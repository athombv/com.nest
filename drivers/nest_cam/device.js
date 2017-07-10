'use strict';

const Homey = require('homey');
const path = require('path');
const NestDevice = require('./../nestDevice');

class NestCam extends NestDevice {

	onInit() {
		super.onInit();
	}

	/**
	 * Create client and bind event listeners.
	 * @returns {*}
	 */
	createClient() {

		// Create thermostat
		this.client = Homey.app.nestAccount.createCam(this.getData().id);

		// If client construction failed, set device unavailable
		if (!this.client) return this.setUnavailable(Homey.__('removed_externally'));

		// Create new flow token
		this.myImageToken = new Homey.FlowToken('snapshot_token', {
			type: 'image',
			title: {
				en: 'Snapshot'
			}
		});

		// Register flow token
		this.myImageToken
			.register()
			.then(() => {
				this.myImageFlow = new Homey.FlowCardTrigger('new_snapshot')
				this.myImageFlow.register()
				this.registerPollInterval({
					id: 'snapshot', fn: this.fetchSnapshot.bind(this), interval: 20000,
				})
			});
	}

	/**
	 * Method that fetches a snapshot, triggers the image flow and updates the global token.
	 * @returns {Promise}
	 */
	fetchSnapshot() {
		return this.client.getSnapshotUrl()
			.then(filename => {
				let extension = filename.split('.')[1];
				if (extension === 'jpeg') extension = 'jpg';

				// Register new image
				let snapshotImage = new Homey.Image(extension);
				snapshotImage.setPath(path.join(__dirname, 'userdata', filename));
				snapshotImage.register()
					.then(() => {

						this.log('snapshot image registered')

						// Update image in token
						this.myImageToken.setValue(snapshotImage)
							.then(() => this.log('global snapshot token updated'))
							.catch(err => this.error('Error myImageToken.setValue()', err))

						// Trigger image flow
						this.myImageFlow
							.trigger({ snapshot: snapshotImage })
							.catch(err => this.error('Error triggering image flow', err))
					})
			})
			.catch(err => this.error('Error on getSnapshotUrl', err))
	}
}

module.exports = NestCam;

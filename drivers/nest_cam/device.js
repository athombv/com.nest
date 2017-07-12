'use strict';

const Homey = require('homey');
const NestDevice = require('./../nestDevice');

class NestCam extends NestDevice {

	onInit() {
		super.onInit();

		// Register device trigger flow cards
		this.startedStreamingFlowTriggerDevice = new Homey.FlowCardTriggerDevice('started_streaming');
		this.startedStreamingFlowTriggerDevice.register();

		this.stoppedStreamingFlowTriggerDevice = new Homey.FlowCardTriggerDevice('stopped_streaming');
		this.stoppedStreamingFlowTriggerDevice.register();

		this.eventStartedFlowTriggerDevice = new Homey.FlowCardTriggerDevice('event_started');
		this.eventStartedFlowTriggerDevice.register();

		this.eventStoppedFlowTriggerDevice = new Homey.FlowCardTriggerDevice('event_stopped');
		this.eventStoppedFlowTriggerDevice.register();
	}

	/**
	 * Create client and bind event listeners.
	 * @returns {*}
	 */
	async createClient() {

		// Create thermostat
		this.client = Homey.app.nestAccount.createCam(this.getData().id);

		// If client construction failed, set device unavailable
		if (!this.client) return this.setUnavailable(Homey.__('removed_externally'));

		this.client
			.on('is_streaming', isStreaming => {

				// Detect change
				if (typeof this.isStreaming !== 'undefined') {

					// Check if started or ended
					if (this.isStreaming === false && isStreaming === true) {

						// Trigger Flow
						this.startedStreamingFlowTriggerDevice.trigger(this)
							.catch(err => {
								if (err) return this.error('Error triggeringDevice:', err);
							});
					} else if (this.isStreaming === true && isStreaming === false) {

						// Trigger Flow
						this.stoppedStreamingFlowTriggerDevice.trigger(this)
							.catch(err => {
								if (err) return this.error('Error triggeringDevice:', err);
							});
					}
				}
				this.isStreaming = isStreaming;
			})
			.on('last_event', event => {
				const startTime = new Date(event.start_time);
				const endTime = new Date(event.end_time);
				const hasMotion = event.has_motion;
				const hasPerson = event.has_person;
				const hasSound = event.has_sound;

				this.lastEventImageUrl = event.image_url;
				this.lastEventAnimatedImageUrl = event.animated_image_url;

				// Event has ended
				if (endTime > startTime) {

					this.eventIsHappening = false;

					// Event has ended, check if it was not triggered already
					if (this.lastRegisteredStopTime !== endTime && typeof this.lastRegisteredStopTime !== 'undefined') {
						this.eventStoppedFlowTriggerDevice.trigger(this, {
							motion: hasMotion,
							sound: hasSound,
							person: hasPerson,
							image: this.lastEventImage,
							animated_image: this.lastEventAnimatedImage,
						}).catch(err => {
							if (err) return this.error('Error triggeringDevice:', err);
						});
					}
				} else {

					this.eventIsHappening = true;

					// Event has started, check if it was not triggered already
					if (this.lastRegisteredStartTime !== startTime && typeof this.lastRegisteredStartTime !== 'undefined') {

						// Event has started
						this.eventStartedFlowTriggerDevice.trigger(this, {
							motion: hasMotion,
							sound: hasSound,
							person: hasPerson,
							image: this.lastEventImage,
							animated_image: this.lastEventAnimatedImage,
						}).catch(err => {
							if (err) return this.error('Error triggeringDevice:', err);
						});
					}
				}

				this.lastRegisteredStartTime = startTime;
				this.lastRegisteredStopTime = endTime;
			});

		// Register snapshot image and snapshot flow token
		const snapshotImage = await this.registerSnapShotImage();
		await this.registerSnapshotFlowToken(snapshotImage);
		await this.registerLastEventImage();
		await this.registerLastEventAnimatedImage();
		this.log('registered snapshot image, last event image and last even animated image and flow token');
	}

	/**
	 * Register a snapshot image, which will later be fetched from the Nest API.
	 * @returns {Promise|Error}
	 */
	registerSnapShotImage() {

		// Register new image
		// TODO check if nest provides jpg images
		const snapshotImage = new Homey.Image('jpg');

		// This method is called when the image has to be read
		snapshotImage.setBuffer((args, callback) => {

			// Retrieve last snapshot from Nest API
			this.client.getImageBufferFromSnapshotUrl()
				.then(buffer => callback(null, buffer))
				.catch(err => {
					this.error('Error on getImageBufferFromSnapshotUrl', err);
					return callback(err);
				});
		});

		// Register image
		return snapshotImage
			.register()
			.catch(err => this.error('Error registering snapshot image', err));

	}

	/**
	 * Register a last event image, which will later be fetched from the Nest API.
	 * @returns {Promise|Error}
	 */
	registerLastEventImage() {

		// Register new image
		// TODO check if nest provides jpg images
		this.lastEventImage = new Homey.Image('jpg');

		// This method is called when the image has to be read
		this.lastEventImage.setBuffer((args, callback) => {

			// Retrieve last snapshot from Nest API
			this.client.getImageBufferFromLastEventUrl(this.lastEventImageUrl)
				.then(buffer => callback(null, buffer))
				.catch(err => {
					this.error('Error on getImageBufferFromLastEventUrl', err);
					return callback(err);
				});
		});

		// Register image
		return this.lastEventImage
			.register()
			.catch(err => this.error('Error registering last event image', err));
	}

	/**
	 * Register a last event animated image, which will later be fetched from the Nest API.
	 * @returns {Promise|Error}
	 */
	registerLastEventAnimatedImage() {

		// Register new image
		// TODO check if nest provides gif images
		this.lastEventAnimatedImage = new Homey.Image('gif');

		// This method is called when the image has to be read
		this.lastEventAnimatedImage.setBuffer((args, callback) => {

			// Retrieve last snapshot from Nest API
			this.client.getImageBufferFromLastEventUrl(this.lastEventAnimatedImageUrl)
				.then(buffer => callback(null, buffer))
				.catch(err => {
					this.error('Error on getImageBufferFromLastEventUrl', err);
					return callback(err);
				});
		});

		// Register image
		return this.lastEventAnimatedImage
			.register()
			.catch(err => this.error('Error registering last event animated image', err));
	}

	/**
	 * Register image flow token, which holds a snapshot image.
	 * @param snapshotImage
	 * @returns {*}
	 */
	registerSnapshotFlowToken(snapshotImage) {

		// Create new flow image token
		const myImageToken = new Homey.FlowToken('snapshot_token', {
			type: 'image',
			title: {
				en: 'Snapshot',
			},
		});

		// Register flow image token
		return myImageToken
			.register()
			.then(() => {
				this.log('image token registered');

				// Update image in token
				myImageToken.setValue(snapshotImage)
					.catch(err => this.error('failed to setValue() on image token', err));
			});
	}
}

module.exports = NestCam;

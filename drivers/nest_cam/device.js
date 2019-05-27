'use strict';

const Homey = require('homey');

const fetch = require('node-fetch');

const NestDevice = require('../../lib/NestDevice');
const { NEST_CAPABILITIES } = require('../../constants');

const SNAPSHOT_ID = 'snapshot';
const LAST_EVENT_ID = 'lastEvent';

class NestCam extends NestDevice {
  async onInit() {
    // Keep track of image urls
    this._imageUrls = {
      [SNAPSHOT_ID]: null,
      [LAST_EVENT_ID]: null,
    };

    // Register images
    await this._registerSnapshotImage();
    await this._registerLastEventImage();

    // Do this after the above is done
    await super.onInit();
  }

  /**
   * Getter for device specific capabilities
   * @returns {*[]}
   */
  get capabilities() {
    return [
      NEST_CAPABILITIES.SNAPSHOT_URL,
      NEST_CAPABILITIES.LAST_EVENT,
      NEST_CAPABILITIES.IS_STREAMING,
    ];
  }

  /**
   * Method that makes a call to the API to generate a new snapshot and returns the new url.
   * @returns {Promise<*>}
   * @private
   */
  async _getNewSnapshotUrl() {
    const res = await Homey.app.executeGetRequest(`devices/${this.driverType}/${this.getData().id}`, 'snapshot_url');
    if (!res.ok) {
      this.error('_getNewSnapshotUrl() -> failed', res.statusText);
      return null;
    }
    return res.json();
  }

  /**
   * Method that registers a snapshot image and calls setCameraImage.
   * @private
   */
  async _registerSnapshotImage() {
    this._snapshotImage = new Homey.Image();

    // Set stream, this method is called when image.update() is called
    this._snapshotImage.setStream(async (stream) => {
      // First generate new snapshot
      this._imageUrls[SNAPSHOT_ID] = await this._getNewSnapshotUrl();

      this.log('_registerSnapshotImage() -> setStream ->', SNAPSHOT_ID, this._imageUrls[SNAPSHOT_ID]);
      if (!this._imageUrls[SNAPSHOT_ID]) {
        this.error('_registerSnapshotImage() -> setStream ->', SNAPSHOT_ID, 'failed no image url available');
        throw new Error('No image url available');
      }

      // Fetch image from url and pipe
      const res = await fetch(this._imageUrls[SNAPSHOT_ID]);
      if (!res.ok) {
        this.error('_registerSnapshotImage() -> setStream -> failed', res.statusText);
        throw new Error('Could not fetch image');
      }
      res.body.pipe(stream);
    });

    // Register and set camera iamge
    return this._snapshotImage.register()
      .then(() => this.log('_registerSnapshotImage() -> registered'))
      .then(() => this.setCameraImage('snapshot', 'Snapshot', this._snapshotImage))
      .catch(this.error);
  }

  /**
   * Method that registers a last event image and calls setCameraImage
   * @private
   */
  async _registerLastEventImage() {
    this._lastEventImage = new Homey.Image();

    // Set stream, this method is called when image.update() is called
    this._lastEventImage.setStream(async (stream) => {
      this.log('_registerLastEventImage() -> setStream ->', LAST_EVENT_ID, this._imageUrls[LAST_EVENT_ID]);
      if (!this._imageUrls[LAST_EVENT_ID]) {
        this.error('_registerLastEventImage() -> setStream ->', LAST_EVENT_ID, 'failed no image url available');
        throw new Error('No image url available');
      }

      // Fetch image from url and pipe
      const res = await fetch(this._imageUrls[LAST_EVENT_ID]);
      if (!res.ok) {
        this.error('_registerLastEventImage() -> setStream ->', LAST_EVENT_ID, 'failed to fetch image', res.statusText);
        throw new Error('Could not fetch image');
      }
      res.body.pipe(stream);
    });

    // Register and set camera iamge
    return this._lastEventImage.register()
      .then(() => this.log('_registerLastEventImage() -> registered'))
      .then(() => this.setCameraImage('lastEvent', Homey.__('cam_last_event_image_title'), this._lastEventImage))
      .catch(this.error);
  }

  /**
   * Method that is called when a capability value update is received.
   * @param capabilityId
   * @param value
   */
  async onCapabilityValue(capabilityId, value) {
    if (capabilityId === NEST_CAPABILITIES.SNAPSHOT_URL && this.snapshot_url !== value) {
      this.log('onCapabilityValue() -> new snapshot_url');

      // Update url and then update Image instance
      this._imageUrls[SNAPSHOT_ID] = value;
      if (this._snapshotImage) this._snapshotImage.update();
    } else if (capabilityId === NEST_CAPABILITIES.IS_STREAMING && this.valueChangedAndNotNew(capabilityId, value)) {
      this.log('onCapabilityValue() -> new is_streaming', value);
      // Check if started or ended
      const driver = this.getDriver();
      if (value) {
        driver.triggerStartedStreamingFlow(this);
      } else {
        driver.triggerStoppedStreamingFlow(this);
      }
    } else if (capabilityId === NEST_CAPABILITIES.LAST_EVENT && value) { // value can be null
      this.log('onCapabilityValue() -> new last_event');
      const startTime = new Date(value.start_time);
      const endTime = new Date(value.end_time);

      if (typeof value.image_url !== 'string' || typeof value.animated_image_url !== 'string') {
        this.error('onCapabilityValue() -> new last_event -> missing images, abort');
        return;
      }

      // Update url and then update Image instance
      this._imageUrls[LAST_EVENT_ID] = value.animated_image_url || value.image_url;
      this._lastEventImage.update();

      // Create Flow tokens object
      const tokens = {
        motion: value.has_motion,
        sound: value.has_sound,
        person: value.has_person,
        image: this._lastEventImage,
      };

      // Get driver
      const driver = this.getDriver();

      // Event has ended
      if (endTime > startTime) {
        this.log('onCapabilityValue() -> new last_event -> stopped');
        // Mark event stopped
        this.eventIsHappening = false;

        // Event has ended, check if it was not triggered already
        if (typeof this._lastRegisteredStopTime !== 'undefined'
          && this._lastRegisteredStopTime.getTime() !== endTime.getTime()) {
          driver.triggerEventStoppedFlow(this, tokens);
        }
      } else {
        this.log('onCapabilityValue() -> new last_event -> started');
        // Mark event happening
        this.eventIsHappening = true;

        // Event has started, check if it was not triggered already
        if (typeof this._lastRegisteredStartTime !== 'undefined'
          && this._lastRegisteredStartTime.getTime() !== startTime.getTime()) {
          driver.triggerEventStartedFlow(this, tokens);
        }
      }

      // Safe start and stop times
      this._lastRegisteredStartTime = startTime;
      this._lastRegisteredStopTime = endTime;
    }
  }
}

module.exports = NestCam;

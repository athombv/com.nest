'use strict';

const Homey = require('homey');

const fetch = require('node-fetch');

const NestDevice = require('../../lib/NestDevice');
const { NEST_CAPABILITIES } = require('../../constants');

class NestCam extends NestDevice {
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
   * Method that fetches a new snapshot from the Nest API and updates the associated Image and FlowToken instances.
   * @returns {Promise<void>}
   */
  async createNewSnapshot() {
    this.log('createNewSnapshot()');

    // Generate snapshot
    const res = await Homey.app.executeGetRequest(`devices/${this.driverType}/${this.getData().id}`, 'snapshot_url');
    const snapshotUrl = await res.json();

    // Update Image instance
    this._snapshotImage = await this._updateImage({ image: this._snapshotImage, url: snapshotUrl, title: 'Snapshot' });
    try {
      // Update global token
      await this._updateSnapshotFlowToken();
      this.log('createNewSnapshot() -> flow token updated');
    } catch (err) {
      this.error('createNewSnapshot() -> error could not update snapshot token', err);
    }

    // Trigger snapshot done flow
    const driver = this.getDriver();
    driver.triggerSnapshotCreatedFlow(this, { snapshot: this._snapshotImage });
    this.log('createNewSnapshot() -> flow triggered');
  }

  /**
   * Method that updates the value of the snapshot image FlowToken and registers the FlowToken if not
   * already done before.
   * @returns {Promise<Homey.FlowToken|*>}
   */
  async _updateSnapshotFlowToken() {
    this.log('_updateSnapshotFlowToken()');

    // First register snapshot if needed
    if (!this._snapshotImageToken) {
      return this._registerSnapshotFlowToken({ image: this._snapshotImage });
    }

    // Try to set new value
    try {
      await this._snapshotImageToken.setValue(this._snapshotImage);
      this.log('_updateSnapshotFlowToken() -> success');
    } catch (err) {
      this.error('_updateSnapshotFlowToken() -> error', err, this._snapshotImage);
    }
    return this._snapshotImageToken;
  }

  /**
   * Method that creates a Homey.Image instance.
   * @param url
   * @returns {Promise<T> | *}
   * @private
   */
  _createImage({ url }) {
    this.log('_createImage() -> url', url);

    // Register new image
    const image = new Homey.Image();
    image.setStream(async (stream) => {
      this.log('_createImage() -> refresh event');
      const res = await fetch(url);
      res.body.pipe(stream);
    });

    // Register image
    return image
      .register()
      .catch(err => this.error('_createImage() -> error registering last event image', err));
  }

  /**
   * Method that updates the setStream method of a Homey.Image instance.
   * @param image
   * @param url
   * @param title
   * @returns {Promise<*>}
   * @private
   */
  async _updateImage({ image, url, title }) {
    this.log('_updateImage()');
    let _image = image;
    // Create snapshot image if not done before
    if (!_image) {
      _image = await this._createImage({ url });
    } else {
      // Image was already created, only update url
      _image.setStream(async (stream) => {
        this.log('_updateImage() -> refresh event');
        const res = await fetch(url);
        res.body.pipe(stream);
      });
      _image.update();
    }

    // Update camera image
    try {
      await this.setCameraImage(Homey.util.uuid(), title, _image);
    } catch (err) {
      this.error('_updateCameraImage() -> failed', err);
    }

    return _image;
  }

  /**
   * Register image flow token, which holds a snapshot image.
   * @param snapshotImage
   * @returns {*}
   */
  _registerSnapshotFlowToken({ image }) {
    // Create new flow image token
    this._snapshotImageToken = new Homey.FlowToken('snapshot_token', {
      type: 'image',
      title: Homey.__('cam_snapshot_token_title', { name: this.getName() }),
    });

    // Register flow image token
    return this._snapshotImageToken
      .register()
      .then(() => {
        this.log('_registerSnapshotFlowToken() -> image token registered');

        // Update image in token
        this._snapshotImageToken.setValue(image)
          .catch(err => this.error('_registerSnapshotFlowToken() -> failed to setValue() on image token', err));
      });
  }

  /**
   * Method that is called when a capability value update is received.
   * @param capabilityId
   * @param value
   */
  async onCapabilityValue(capabilityId, value) {
    if (capabilityId === NEST_CAPABILITIES.SNAPSHOT_URL && this.snapshot_url !== value) {
      this.log('onCapabilityValue() -> new snapshot_url');
      // Update snapshot image
      this._snapshotImage = await this._updateImage({ image: this._snapshotImage, url: value, title: 'Snapshot' });

      // Update snapshot flow token
      await this._updateSnapshotFlowToken();
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

      // Update image
      this._lastEventImage = await this._updateImage({
        image: this._lastEventImage,
        url: value.image_url,
        title: Homey.__('cam_last_event_image_title'),
      });

      // Update image
      this._lastEventAnimatedImage = await this._updateImage({
        image: this._lastEventAnimatedImage,
        url: value.animated_image_url,
        title: Homey.__('cam_last_event_animated_image_title'),
      });

      // Create Flow tokens object
      const tokens = {
        motion: value.has_motion,
        sound: value.has_sound,
        person: value.has_person,
        image: this._lastEventImage,
        animated_image: this._lastEventAnimatedImage,
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

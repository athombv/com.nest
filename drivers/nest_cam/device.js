'use strict';

const Homey = require('homey');

const fetch = require('node-fetch');

const NestDevice = require('../../lib/NestDevice');
const { NEST_CAPABILITIES } = require('../../constants');

const SNAPSHOT_ID = 'snapshot';
const LAST_EVENT_ID = 'lastEvent';
const LAST_EVENT_ANIMATED_ID = 'lastEventAnimated';

class NestCam extends NestDevice {
  async onInit() {
    // Keep track of image urls
    this._imageUrls = {
      [SNAPSHOT_ID]: null,
      [LAST_EVENT_ID]: null,
      [LAST_EVENT_ANIMATED_ID]: null,
    };

    // Register images
    this._snapshotImage = this._registerCameraImage({
      id: 'snapshot', title: 'Snapshot',
    });
    this._lastEventImage = this._registerCameraImage({
      id: 'lastEvent', title: Homey.__('cam_last_event_image_title'),
    });
    this._lastEventAnimatedImage = this._registerCameraImage({
      id: 'lastEventAnimated', title: Homey.__('cam_last_event_animated_image_title'),
    });

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
   * Method that fetches a new snapshot from the Nest API and updates the associated Image and FlowToken instances.
   * @returns {Promise<void>}
   */
  async createNewSnapshot() {
    this.log('createNewSnapshot()');

    // Generate new snapshot, update url and then update Image instance
    this._imageUrls[SNAPSHOT_ID] = await this._getNewSnapshotUrl();
    this._snapshotImage.update();

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
   * Method that registers a Homey.Image instance and then sets it as camera image. The url is passed by reference so
   * it can be set to a different value and then Image.update() will trigger the setStream method and update the image
   * accordingly.
   * @param id
   * @param title
   * @param url
   * @returns {*}
   * @private
   */
  _registerCameraImage({ id, title }) {
    this.log('_registerCameraImage() -> id', id);
    const image = new Homey.Image();

    // Set stream, this method is called when image.update() is called
    image.setStream(async (stream) => {
      // If snapshot needs to be updated first generate new snapshot
      if (id === SNAPSHOT_ID) this._imageUrls[SNAPSHOT_ID] = await this._getNewSnapshotUrl();

      this.log('_registerCameraImage() -> setStream ->', id, this._imageUrls[id]);
      if (!this._imageUrls[id]) {
        this.error('_registerCameraImage() -> setStream -> failed no image url available');
        throw new Error('No image url available');
      }

      // Fetch image from url and pipe
      const res = await fetch(this._imageUrls[id]);
      if (!res.ok) {
        this.error('_registerCameraImage() -> setStream -> failed', res.statusText);
        throw new Error('Could not fetch image');
      }
      res.body.pipe(stream);
    });

    // Register and set camera iamge
    image.register()
      .then(() => this.setCameraImage(id, title, image))
      .catch(this.error);

    return image;
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

      // Update url and then update Image instance
      this._imageUrls[SNAPSHOT_ID] = value;
      this._snapshotImage.update();

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

      // Update url and then update Image instance
      this._imageUrls[LAST_EVENT_ID] = value.image_url;
      this._lastEventImage.update();

      // Update url and then update Image instance
      this._imageUrls[LAST_EVENT_ANIMATED_ID] = value.animated_image_url;
      this._lastEventAnimatedImage.update();

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

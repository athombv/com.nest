'use strict';

const Homey = require('homey');
const Log = require('homey-log').Log;

const EventEmitter = require('events');
const { URLSearchParams } = require('url');

const fetch = require('node-fetch');
const EventSource = require('eventsource');

const {
  DEVICE_DATA_EVENT, CLIENT_VERSION_SETTING_KEY, NEST_API_URL, NEST_AUTHORIZATION_URL, NEST_TOKEN_URL, NEST_REDIRECT_URL,
} = require('./constants');

const RESTART_REST_STREAM_TIMEOUT = 30 * 60 * 1000; // 30 minutes

const OAUTH2_ACCOUNT_SETTING_KEY = 'oauth2Account';
const NEST_ACCESS_TOKEN_SETTING_KEY = 'nestAccesstoken';

const DEPRECATED_CLIENT_VERSION = 4;
const LOG_ITEMS_SETTING_KEY = 'logItems';
const ACCESS_TOKEN_SETTING_KEY = 'accessTokenNestAccount';

const FLOW_CARD_CONDITION_AWAY_STATUS = 'away_status';
const FLOW_CARD_ACTION_SET_AWAY_STATUS = 'set_away_mode';
const FLOW_CARD_TRIGGER_AWAY_STATUS_CHANGED = 'away_status_changed';

class NestApp extends Homey.App {
  async onInit() {
    this.log(`${this.id} running...`);

    // Migrate if necessary
    this._migrateTokens();

    // Register Flow cards
    this._registerFlowCardActions();
    this._registerFlowCardTriggers();
    this._registerFlowCardConditions();
  }

  /**
   * Sets a promise on this._data that can always be awaited for the actual data to be received. This is necessary since
   * the OAuth2Device does not await the OAuth2Client to be initialized.
   * IMPORTANT: only call this method when accessToken is available.
   * @returns {Promise<*>}
   */
  async getData() {
    this.log('getData()');

    // Only perform API request if this is the first time being called
    if (!this._data) {
      this._data = fetch(NEST_API_URL, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
        },
      }).then(async response => {
        const { headers } = response;
        const contentType = headers.get('Content-Type');
        if (typeof contentType === 'string') {
          if (contentType.startsWith('application/json')) {
            const data = await response.json();
            this._data = data; // Update data
            this.log('getData() -> success');
            this._processData(); // Process new data
            this._startRESTStream(); // Start REST Stream
            return data; // Important return value, else this._data will become undefined
          }
        }
        this.error('getData() -> received invalid (non-json) data');
      }).catch(err => this.error('getData() -> failed', err));
    }
    // Return promise
    return this._data;
  }

  /**
   * Method that checks if there is a OAuth2 session available.
   * @returns {boolean}
   */
  isAuthenticated() {
    return typeof Homey.ManagerSettings.get(ACCESS_TOKEN_SETTING_KEY) === 'string';
  }

  set accessToken(value) {
    if (typeof value !== 'string') throw new Error('Trying to set invalid token');
    Homey.ManagerSettings.set(ACCESS_TOKEN_SETTING_KEY, value);
  }

  get accessToken() {
    const token = Homey.ManagerSettings.get(ACCESS_TOKEN_SETTING_KEY);
    if (typeof token === 'string') return token;
    this.error('WARNING: accessToken was retrieved while not available');
    return null;
  }

  /**
   * Method that checks if the current client version is higher than the deprecated one.
   * @returns {boolean}
   */
  hasUpdatedClientVersion() {
    const result = Homey.ManagerSettings.get(CLIENT_VERSION_SETTING_KEY) > DEPRECATED_CLIENT_VERSION;
    this.log('hasUpdatedClientVersion() ->', result);
    return result;
  }

  /**
   * Method that returns structures, first it awaits the this._data property since it might still be a Promise.
   * @returns {Promise<*>}
   */
  async getStructures() {
    await this.getData(); // Make sure data is retrieved
    if (this._data && Object.prototype.hasOwnProperty.call(this._data, 'structures')) {
      return Object.values(this._data.structures);
    }
    return [];
  }

  /**
   * Method that returns devices by driverType, first it awaits the this._data property since it might still be a
   * Promise.
   * @param driverType
   * @returns {Promise<*>}
   */
  async getDevices({ driverType }) {
    await this.getData(); // Make sure data is retrieved
    if (typeof driverType !== 'string') throw new Error('Missing driverType parameter');
    if (this._data && Object.prototype.hasOwnProperty.call(this._data, 'devices')) {
      return Object.values(this._data.devices[driverType]);
    }
    return [];
  }

  /**
   * Method that returns a specific device object by driverType and device_id.
   * @param driverType
   * @param id
   * @returns {Promise<*>}
   */
  async getDevice({ driverType, id }) {
    const devices = await this.getDevices({ driverType });
    return devices.find(device => device.device_id === id);
  }

  /**
   * Registers a log item, if more than 10 items present it starts removing the oldest items.
   * @param msg
   * @param timestamp
   */
  registerLogItem({ msg, timestamp }) {
    this.log(`registerLogItem(time: ${timestamp}, err: ${msg})`);
    const logItems = Homey.ManagerSettings.get('logItems') || [];
    logItems.push({ msg, timestamp });
    if (logItems.length > 10) logItems.shift();
    Homey.ManagerSettings.set(LOG_ITEMS_SETTING_KEY, logItems);
  }

  /**
   * Method that handles the OAuth login (both from pairing and settings).
   * @returns {Promise<void>}
   */
  async login() {
    this.log('login()');
    const socket = new EventEmitter();
    const urlListener = (url) => Homey.ManagerApi.realtime('url', url);
    const errorListener = (err) => Homey.ManagerApi.realtime('error', err);
    const authorizedListener = () => {
      Homey.ManagerApi.realtime('authorized');
      socket.removeListener('url', urlListener);
      socket.removeListener('error', errorListener);
      socket.removeListener('authorized', authorizedListener);
    };
    socket.on('url', urlListener);
    socket.on('error', errorListener);
    socket.on('authorized', authorizedListener);
    this.startOAuth2Process(socket);
  }

  /**
   * Method that handles the logout process, it removes the accessToken and deauthorizes this token with Nest.
   * @returns {Promise<any[]>}
   */
  async logout() {
    this.log('logout()');

    try {
      this._destroyRESTStream(); // Remove EventSource listeners to prevent auth_revoked events from coming in
      await fetch(`https://api.home.nest.com/oauth2/access_tokens/${this.accessToken}`, { method: 'DELETE' });
      this.log('logout() -> token was revoked');
    } catch (err) {
      this.error('logout() -> failed to revoke token', err);
      throw err;
    }

    // Unset data IMPORTANT else data flow will stop
    this._data = null;

    // Remove token from memory
    Homey.ManagerSettings.unset(ACCESS_TOKEN_SETTING_KEY);

    // Get array of all devices
    const drivers = Object.values(Homey.ManagerDrivers.getDrivers());
    const devices = drivers.reduce((a, driver) => a.concat(driver.getDevices()), []);
    this.log('logout() -> success');
    // Get devices and mark as unavailable
    return Promise.all(devices.map(device => device.setUnavailable(Homey.__('authentication.re-authorize'))));
  }

  /**
   * Method that handles the OAuth2 process from pairing and settings and makes sure the app is filled with data when
   * complete.
   * @param socket
   */
  startOAuth2Process(socket) {
    this.log('startOAuth2Process()');
    if (!socket) throw new Error('Expected socket for OAuth2 pairing process');

    // No OAuth2 process needed
    if (this.isAuthenticated()) {
      setTimeout(() => socket.emit('authorized'), 250); // Delay is needed for race condition fix
      return;
    }

    // Start OAuth2 process
    new Homey.CloudOAuth2Callback(`${NEST_AUTHORIZATION_URL}?client_id=${Homey.env.NEST_CLIENT_ID}&state=${Homey.util.uuid()}`)
      .on('url', url => socket.emit('url', url))
      .on('code', async code => {
        this.log('startOAuth2Process() -> received OAuth2 code');

        try {
          // Exchange token for code
          const body = new URLSearchParams();
          body.append('grant_type', 'authorization_code');
          body.append('client_id', Homey.env.NEST_CLIENT_ID);
          body.append('client_secret', Homey.env.NEST_CLIENT_SECRET);
          body.append('code', code);
          body.append('redirect_uri', NEST_REDIRECT_URL);

          // Make request
          const response = await fetch(NEST_TOKEN_URL, { body, method: 'POST' });
          const { headers } = response;
          const contentType = headers.get('Content-Type');
          if (typeof contentType === 'string') {
            if (contentType.startsWith('application/json')) {
              const json = await response.json();
              if (!json || !Object.prototype.hasOwnProperty.call(json, 'access_token')) throw new Error('Could not parse Token Response');
              this.log('startOAuth2Process() -> received OAuth2 token');
              this.accessToken = json.access_token;
            }
          }
        } catch (err) {
          this.error('startOAuth2Process() -> error could not get OAuth2 token by code', err);
          socket.emit('error', new Error(Homey.__('authentication.re-login_failed_with_error', { error: err.message || err.toString() })));
          return;
        }

        this.log('startOAuth2Process() -> authenticated');

        // Fetch data
        await Homey.app.getData();
        this.log('startOAuth2Process() -> got data');

        socket.emit('authorized');

        // Update authenticated devices
        const drivers = Object.values(Homey.ManagerDrivers.getDrivers());
        const devices = drivers.reduce((a, driver) => a.concat(driver.getDevices()), []);
        devices.forEach(device => device.setAvailable());
        this.log('startOAuth2Process() -> success');
      })
      .generate();
  }

  /**
   * Method that performs a PUT request to the remote API to update a key value pair
   * @param key
   * @param value
   * @returns {Promise<void>}
   */
  async executePutRequest(path, key, value) {
    const res = await fetch(`${NEST_API_URL}${path}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.accessToken}`,
      },
      body: JSON.stringify({ [key]: value }),
    });
    if (res.status >= 300 || res.status < 200) {
      throw new Error(`Request failed with status code ${res.status}`);
    }
    return res;
  }

  /**
   * Method that performs a GET request to the remote API to update a key value pair
   * @param key
   * @returns {Promise<void>}
   */
  async executeGetRequest(path, key) {
    const res = fetch(`${NEST_API_URL}${path}/${key}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${this.accessToken}` },
    });
    if (res.status >= 300 || res.status < 200) {
      throw new Error(`Request failed with status code ${res.status}`);
    }
    return res;
  }

  /**
   * Method that process different types of data in parallel. If necessary it awaits getData().
   * @returns {Promise<void>}
   * @private
   */
  async _processData() {
    await this.getData(); // Make sure data is retrieved
    this._processMetaData();
    this._processDeviceData();
    this._processStructureData();
  }

  /**
   * Processes device data and emits the extracted device object so that device instances can listen for changes.
   * @private
   */
  _processDeviceData() {
    if (!Object.prototype.hasOwnProperty.call(this._data, 'devices')) return;
    this.emit(DEVICE_DATA_EVENT); // Emit event that forces devices to refresh data
  }

  /**
   * Processes structure data and compares the away state of structures to the last known away state, if a change is
   * detected the AwayStatusChangedFlowCardTrigger is triggered.
   * @private
   */
  _processStructureData() {
    if (!Object.prototype.hasOwnProperty.call(this._data, 'structures')) return;

    if (this._historicalStructureData) {
      // Loop new structure data
      Object.values(this._data.structures).forEach(structure => {
        // Compare with old structure data
        const historicalStructureObject = this._historicalStructureData.find(x => x.structure_id === structure.structure_id);
        if (historicalStructureObject && structure.away !== historicalStructureObject.away) {
          this.log(structure.name, 'structure state changed from', historicalStructureObject.away, 'to', structure.away);
          // Trigger away status changed
          this.awayStatusChangedFlowCardTrigger
            .trigger({}, structure)
            .catch(err => this.error('Failed to trigger away_status_changed', err));
        }
      });
    }

    // Store for later event comparisons
    this._historicalStructureData = Object.values(this._data.structures);
  }

  /**
   * Processes meta data, specifically the client_version of the connected Nest API client.
   * @private
   */
  _processMetaData() {
    if (!Object.prototype.hasOwnProperty.call(this._data, 'metadata')
      || !Object.prototype.hasOwnProperty.call(this._data.metadata, 'client_version')) return;
    Homey.ManagerSettings.set(CLIENT_VERSION_SETTING_KEY, this._data.metadata.client_version);
  }

  /**
   * Method that creates a new EventSource (and destroys the old EventSource if necessary), and binds the necessary
   * event listeners ('put', 'error' and 'auth_revoked').
   * @private
   */
  _startRESTStream() {
    this.log('_startRESTStream()');
    if (this._restStreamEventSource) {
      this.log('_startRESTStream() -> destroy former REST Stream');
      this._destroyRESTStream();
    }

    // Create new event source
    this._restStreamEventSource = new EventSource(NEST_API_URL, {
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
      },
    });

    // Attach listeners
    this._restStreamEventSource.addEventListener('put', this._onStreamEvent.bind(this));
    this._restStreamEventSource.addEventListener('error', this._onStreamError.bind(this));
    this._restStreamEventSource.addEventListener('auth_revoked', this._onStreamAuthenticationRevoked.bind(this));
    this._restStreamEventSource.addEventListener('cancel', this._onStreamClientUpdatedEvent.bind(this));
    this.log('_startRESTStream() -> listening');

    // This is necessary when Homey lost its internet connection for example, the REST stream then seems to be
    // disconnected and will not automatically reconnect
    this._restartRESTStreamTimeout = setTimeout(() => {
      clearTimeout(this._restartRESTStreamTimeout);
      this.log('_startRESTStream() -> restarting REST Stream');
      this._startRESTStream();
    }, RESTART_REST_STREAM_TIMEOUT);
  }

  /**
   * Close and destroy event source and remove listeners.
   * @private
   */
  _destroyRESTStream() {
    this.log('_destroyRESTStream()');
    if (this._restStreamEventSource) {
      this._restStreamEventSource.removeEventListener('put', this._onStreamEvent.bind(this));
      this._restStreamEventSource.removeEventListener('error', this._onStreamError.bind(this));
      this._restStreamEventSource.removeEventListener('auth_revoked', this._onStreamAuthenticationRevoked.bind(this));
      this._restStreamEventSource.removeEventListener('cancel', this._onStreamClientUpdatedEvent.bind(this));
      this._restStreamEventSource.close();
      this._restStreamEventSource = null;
      this.log('_destroyRESTStream() -> destroyed');
    }
  }

  /**
   * Method that is called when a 'put' event is received through the REST Stream EventSource.
   * @param event
   * @param event.data
   * @private
   */
  _onStreamEvent(event) {
    if (!Object.prototype.hasOwnProperty.call(event, 'data')) return;

    try {
      const data = JSON.parse(event.data);
      if (!Object.prototype.hasOwnProperty.call(data, 'data')) return;
      this.log('_onStreamEvent()');
      this._data = data.data; // Set updated data object
      this._processData(); // Process this new data object
    } catch (err) {
      this.error('_onStreamEvent() -> error could not parse event data', err);
    }
  }

  /**
   * Method that is called when a 'auth_revoked' or 'error' event (with status 401) is received. This indicates the
   * access token has been externally invalidated and the user should be logged out.
   * @returns {Promise<void>}
   * @private
   */
  async _onStreamAuthenticationRevoked() {
    this.log('_onStreamAuthenticationRevoked() -> authentication token was revoked');
    try {
      // Log out, this also makes sure all devices are marked as unavailable
      await this.logout();
    } catch (err) {
      this.error('_onStreamAuthenticationRevoked() -> failed to logout', err);
    }
  }

  /**
   * Method that is called when a 'error' event is received.
   * @param event
   * @returns {Promise<void>}
   * @private
   */
  _onStreamError(event = {}) {
    if (event.readyState === EventSource.CLOSED) {
      this.error('_onStreamError() -> connection closed');
    } else {
      // Unauthenticated do not try to re-open
      if (event.status === 401) {
        this.error('_onStreamError() -> unauthenticated');
        return this._onStreamAuthenticationRevoked();
      }
      this.error('_onStreamError() -> unknown error', event);
    }

    // Restart stream
    this._startRESTStream();
  }

  /**
   * Method that is called when the nest client's permissions are updated. The event might contain a new access token.
   * @param event
   * @private
   */
  _onStreamClientUpdatedEvent(event = {}) {
    this.log('_onStreamClientUpdatedEvent()');
    if (Object.prototype.hasOwnProperty.call(event, 'data')
      && typeof event.data === 'string') {
      this.log('_onStreamClientUpdatedEvent() -> updated token');
      this.accessToken = event.data;
      return;
    }
    this.log('_onStreamClientUpdatedEvent() -> could not update token');
  }

  _registerFlowCardActions() {
    new Homey.FlowCardAction(FLOW_CARD_ACTION_SET_AWAY_STATUS)
      .register()
      .registerRunListener(this._onFlowCardActionSetAwayStatus.bind(this))
      .getArgument('structure')
      .registerAutocompleteListener(this._onStructureAutoComplete.bind(this));
  }

  _registerFlowCardConditions() {
    new Homey.FlowCardCondition(FLOW_CARD_CONDITION_AWAY_STATUS)
      .register()
      .registerRunListener(this._onFlowCardConditionAwayStatus.bind(this))
      .getArgument('structure')
      .registerAutocompleteListener(this._onStructureAutoComplete.bind(this));
  }

  _registerFlowCardTriggers() {
    this.awayStatusChangedFlowCardTrigger = new Homey.FlowCardTrigger(FLOW_CARD_TRIGGER_AWAY_STATUS_CHANGED)
      .register()
      .registerRunListener(this._onFlowCardTriggerAwayStatusChanged.bind(this));

    this.awayStatusChangedFlowCardTrigger
      .getArgument('structure')
      .registerAutocompleteListener(this._onStructureAutoComplete.bind(this));
  }

  async _onFlowCardActionSetAwayStatus(args) {
    this.log('_onFlowCardActionSetAwayStatus()');
    if (!this.isAuthenticated()) throw new Error(Homey.__('authentication.not_authorized'));
    if (!this.hasUpdatedClientVersion()) throw new Error(Homey.__('error.set_away_permission'));

    if (Object.prototype.hasOwnProperty.call(args, 'structure') && Object.prototype.hasOwnProperty.call(args, 'status')) {
      try {
        await this.executePutRequest(`structures/${args.structure.structure_id}`, 'away', args.status);
      } catch (err) {
        this.error('_onFlowCardActionSetAwayStatus() -> api request failed', err);
        throw new Error(Homey.__('error.missing_argument'));
      }
    }
    this.error('_onFlowCardActionSetAwayStatus() -> error invalid args');
    throw new Error(Homey.__('error.missing_argument'));
  }

  async _onFlowCardConditionAwayStatus(args = {}) {
    this.log('_onFlowCardConditionAwayStatus()');
    if (!this.isAuthenticated()) throw new Error(Homey.__('authentication.not_authorized'));

    if (Object.prototype.hasOwnProperty.call(args, 'structure') && Object.prototype.hasOwnProperty.call(args.structure, 'structure_id')) {
      const structure = await this.getStructures({ id: args.structure.structure_id });
      return !!structure;
    }
    throw new Error(Homey.__('error.missing_argument'));
  }

  async _onFlowCardTriggerAwayStatusChanged(args = {}, state = {}) {
    this.log('_onFlowCardTriggerAwayStatusChanged()');

    if (Object.prototype.hasOwnProperty.call(args, 'structure') && Object.prototype.hasOwnProperty.call(args.structure, 'structure_id')
      && Object.prototype.hasOwnProperty.call(state, 'away') && Object.prototype.hasOwnProperty.call(state, 'structure_id')
      && Object.prototype.hasOwnProperty.call(args, 'status')) {
      return (args.structure.structure_id === state.structure_id && args.status === state.away);
    }
    this.error('_onFlowCardActionSetAwayStatus() -> error invalid args');
    throw new Error(Homey.__('error.missing_argument'));
  }

  async _onStructureAutoComplete(query = '') {
    if (!this.isAuthenticated()) throw new Error(Homey.__('authentication.not_authorized'));
    const structures = await this.getStructures();
    if (Array.isArray(structures)) {
      return structures.filter(structure => structure.name.toLowerCase().includes(query.toLowerCase()));
    }
    return [];
  }

  _migrateTokens() {
    // No migration needed
    if (this.isAuthenticated()) return;

    this.log('_migrateTokens() -> started');

    let accessToken = null;
    if (Homey.ManagerSettings.get(NEST_ACCESS_TOKEN_SETTING_KEY)) {
      this.log('_migrateTokens() -> migrate from nestAccessToken');
      accessToken = Homey.ManagerSettings.get(NEST_ACCESS_TOKEN_SETTING_KEY);
    }

    if (Homey.ManagerSettings.get(OAUTH2_ACCOUNT_SETTING_KEY)) {
      this.log('_migrateTokens() -> migrate from wifi-driver oauth2Account');
      const oauth2Account = Homey.ManagerSettings.get(OAUTH2_ACCOUNT_SETTING_KEY);
      accessToken = oauth2Account._accessToken;
    }

    // Store token
    if (accessToken) {
      this.log('_migrateTokens() -> success');
      this.accessToken = accessToken;
    }
  }
}

module.exports = NestApp;

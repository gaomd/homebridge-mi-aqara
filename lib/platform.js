"use strict";

const crypto = require('crypto');
const dgram = require('dgram');

let Accessory, PlatformAccessory, Service, Characteristic, UUIDGen;
let MiAqaraOutlet, MiAqaraSwitch, MiAqaraDualSwitch, MiAqaraTempHumSensor;

module.exports = function (homebridge) {
  Accessory = homebridge.hap.Accessory;
  PlatformAccessory = homebridge.platformAccessory;
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;
  UUIDGen = homebridge.hap.uuid;

  MiAqaraOutlet = require("./accessories/outlet")(Accessory, PlatformAccessory, Service, Characteristic, UUIDGen);
  MiAqaraSwitch = require("./accessories/switch")(Accessory, PlatformAccessory, Service, Characteristic, UUIDGen);
  MiAqaraDualSwitch = require("./accessories/switch-dual")(Accessory, PlatformAccessory, Service, Characteristic, UUIDGen);
  MiAqaraTempHumSensor = require("./accessories/sensor-temp-hum")(Accessory, PlatformAccessory, Service, Characteristic, UUIDGen);

  return MiAqaraPlatform;
};

function MiAqaraPlatform(log, config, api) {
  this.log = log;
  this.config = config;
  this.api = api;

  /** Hard coded constants */
  this.iv = Buffer.from([0x17, 0x99, 0x6d, 0x09, 0x3d, 0x28, 0xdd, 0xb3, 0xba, 0x69, 0x5a, 0x2e, 0x6f, 0x58, 0x56, 0x2e]);
  this.commonMulticastAddress = '224.0.0.50';
  this.gatewayMulticastListenPort = 4321;
  this.gatewayListenPort = 9898;
  this.serverListenPort = 9898; // Also for multicast listening

  /** Configurable variables */
  this.gatewayDiscoverIntervalSeconds = 300;

  /** Initialization */
  this.server = dgram.createSocket('udp4');
  this.configuredGateways = {};
  this.configuredSubDevices = {};
  this.subDeviceOverrides = this.config['device_overrides'] || {};
  this.accessories = {};
  this.accessoryLastActives = {};

  this.subDeviceModelClassTable = {
    'plug': MiAqaraOutlet,                // 智能插座
    'ctrl_neutral1': MiAqaraSwitch,       // 墙壁开关（单键）
    'ctrl_neutral2': MiAqaraDualSwitch,   // 墙壁开关（双键）
    'sensor_ht': MiAqaraTempHumSensor,    // 温湿度传感器
  };

  this.reinstateGatewaysFromConfiguration();

  // Discover gateways immediately then keep discovering every 300 seconds
  this.api.on('didFinishLaunching', function () {
    // Send whois to discover gateways
    this.discoverGateways();

    setInterval(function () {
      this.discoverGateways();
    }.bind(this), this.gatewayDiscoverIntervalSeconds * 1000);
  }.bind(this));

  // this.scheduleSubDeviceAutoRemoval();
  this.startGatewayCommunicator();
}

MiAqaraPlatform.prototype.initializeGateway = function (id, password) {
  return this.configuredGateways[id] = {
    id: id,
    password: password,
    address: '',
    token: '',
  };
};

MiAqaraPlatform.prototype.initializeSubDevice = function (id) {
  return this.configuredSubDevices[id] = {
    instance: null,
    belonging_gateway_id: 0,
  };
};

/**
 * Load MAC Address and Password pairs from config
 */
MiAqaraPlatform.prototype.reinstateGatewaysFromConfiguration = function () {
  const macs = this.config['gateway_mac_addresses'];
  const passwords = this.config['gateway_passwords'];

  if (!macs || !passwords) {
    throw new Error('Mi Gateway MAC Address or Password required.');
  }

  if (macs.length !== passwords.length) {
    throw new Error('Mi Gateway MAC Address and Password mismatch.')
  }

  for (let i = 0; i < macs.length; i++) {
    const id = macs[i].replace(/:/g, '').toLowerCase();
    this.initializeGateway(id, passwords[i]);
  }
};

MiAqaraPlatform.prototype.getGateway = function (id) {
  return this.configuredGateways[id] || false;
};

MiAqaraPlatform.prototype.getGatewayOrFail = function (id) {
  if (!this.getGateway(id)) {
    throw new Error(`Gateway ${id} not found.`);
  }

  return this.configuredGateways[id];
};

MiAqaraPlatform.prototype.getSubDevice = function (id) {
  return this.configuredSubDevices[id] || false;
};

MiAqaraPlatform.prototype.getSubDeviceOrFail = function (id) {
  if (!this.getSubDevice(id)) {
    throw new Error(`Sub device ${id} not found.`);
  }

  return this.configuredSubDevices[id];
};

MiAqaraPlatform.prototype.setGatewayToken = function (id, token) {
  let gateway = this.getGateway(id);

  if (!gateway) {
    return; // Unrecognized gateway
  }

  gateway.token = token;
  this.log.debug(`Gateway ${id} token ${token} updated.`);
};

MiAqaraPlatform.prototype.setGatewayIp = function (id, address) {
  let gateway = this.getGateway(id);

  if (!gateway) {
    return; // Unrecognized gateway
  }

  gateway.address = address;
  this.log.debug(`Gateway ${id} address ${address} updated.`);
};

MiAqaraPlatform.prototype.getSubDeviceBelongingGateway = function (id) {
  const gatewayId = this.getSubDeviceOrFail(id).belonging_gateway_id;

  return this.getGatewayOrFail(gatewayId);
};

MiAqaraPlatform.prototype.generateAuthKeyForGateway = function (id) {
  const gateway = this.getGatewayOrFail(id);

  if (!gateway.token.length) {
    throw new Error(`Gateway ${id} has no token cached yet.`);
  }

  const cipher = crypto.createCipheriv('aes-128-cbc', gateway.password, this.iv);
  let key = cipher.update(gateway.token, "ascii", "hex");
  key += cipher.final('hex');

  return key;
};

MiAqaraPlatform.prototype.commandGateway = function (id, commandType, params) {
  const gateway = this.getGatewayOrFail(id);
  const query = {cmd: commandType};

  if (Object.prototype.toString.call(params) === "[object Object]") {
    Object.assign(query, params);
  }

  this.log.debug(`Command gateway ${gateway.address}:${this.gatewayListenPort} (${JSON.stringify(query)})`);
  this.server.send(JSON.stringify(query), this.gatewayListenPort, gateway.address);
};

MiAqaraPlatform.prototype.discoverGateways = function () {
  this.server.send(JSON.stringify({cmd: 'whois'}), this.gatewayMulticastListenPort, this.commonMulticastAddress);
};

/**
 * Parse messages from gateways
 * @param message
 * @param rinfo
 */
MiAqaraPlatform.prototype.onGatewayMessage = function (message, rinfo) {
  this.log.debug(`New gateway message from ${rinfo.address}:${rinfo.port}, (${message})`);

  try {
    message = JSON.parse(message);
  } catch (e) {
    this.log.error(`Invalid JSON ${message}`);

    return;
  }

  const messageType = message['cmd'];
  const messageActionTable = {
    'iam': this.onGatewayDiscovered,
    'heartbeat': this.onGatewayHeartbeat,
    'get_id_list_ack': this.onGatewaySubDeviceList,
    'read_ack': this.onGatewaySubDeviceStateReport,
    'report': this.onGatewaySubDeviceStateReport,
  };

  if (!messageActionTable.hasOwnProperty(messageType)) {
    this.log.error(`Unimplemented message type: ${messageType}`);
    return;
  }

  messageActionTable[messageType].bind(this)(message, rinfo);
};

MiAqaraPlatform.prototype.onGatewayDiscovered = function (message, rinfo) {
  // Received packets from (a) gateway_address:4321,
  // The `iam` response provides gateway_address (ip) and 9898 (port) in the message body.
  // We don't use it however xD
  this.setGatewayIp(message['sid'], rinfo.address);

  this.commandGateway(message['sid'], "get_id_list");
};

MiAqaraPlatform.prototype.onGatewayHeartbeat = function (message, rinfo) {
  if (message['model'] === 'gateway') {
    const gatewayId = message['sid'];
    this.setGatewayIp(gatewayId, rinfo.address);
    this.setGatewayToken(gatewayId, message["token"]);
  }
};

MiAqaraPlatform.prototype.onGatewaySubDeviceList = function (message, rinfo) {
  const gatewayId = message['sid'];

  this.setGatewayIp(gatewayId, rinfo.address);
  this.setGatewayToken(gatewayId, message["token"]);

  const eventData = JSON.parse(message['data']);
  for (let key in eventData) {
    if (eventData.hasOwnProperty(key)) {
      const subDeviceId = eventData[key];
      this.setSubDeviceBelongingGateway(subDeviceId, gatewayId);
      this.commandGateway(gatewayId, "read", {sid: subDeviceId});
    }
  }
};

MiAqaraPlatform.prototype.onGatewaySubDeviceStateReport = function (message, rinfo) {
  const subDeviceModel = message['model'];
  const eventData = JSON.parse(message['data']);

  if (this.subDeviceModelClassTable[subDeviceModel]) {
    const subDeviceId = message["sid"];
    let instance;

    try {
      instance = this.getSubDeviceInstance(subDeviceId);
    } catch (error) {
      instance = this.setSubDeviceInstance(
        subDeviceId,
        (new this.subDeviceModelClassTable[subDeviceModel](this, message["sid"], message["model"]))
      );
    }

    instance.processDeviceReportEvent(eventData);
  }
};

MiAqaraPlatform.prototype.getSubDeviceInstance = function (id) {
  const instance = this.getSubDeviceOrFail(id).instance;
  if (!instance) {
    throw new Error(`Sub device ${id} instance has not initialized.`);
  }

  return instance;
};

MiAqaraPlatform.prototype.setSubDeviceBelongingGateway = function (id, gatewayId) {
  let subDevice = this.getSubDevice(id);

  if (!subDevice) {
    subDevice = this.initializeSubDevice(id);
  }

  return subDevice.belonging_gateway_id = gatewayId;
};

MiAqaraPlatform.prototype.setSubDeviceInstance = function (id, instance) {
  let subDevice = this.getSubDevice(id);

  if (!subDevice) {
    subDevice = this.initializeSubDevice(id)
  }

  return subDevice.instance = instance;
};

MiAqaraPlatform.prototype.startGatewayCommunicator = function () {
  // Subscribe messages from gateways
  this.server.on('message', this.onGatewayMessage.bind(this));

  this.server.on('error', function (error) {
    this.log.error('An error occurred while listening for gateway packets.');
  }.bind(this));

  this.server.on('listening', function () {
    this.log.debug(`Mi Aqara plugin is listening on 0.0.0.0:${this.serverListenPort}.`);

    this.server.addMembership(this.commonMulticastAddress);
    this.log.debug(`Mi Aqara plugin is subscribed to ${this.commonMulticastAddress}:${this.serverListenPort}.`);
  }.bind(this));

  this.server.bind(this.serverListenPort);
};

MiAqaraPlatform.prototype.scheduleSubDeviceAutoRemoval = function () {
  // Check every 30 minutes
  setInterval(function () {
    this.removeOfflineAccessory();
  }.bind(this), 30 * 60 * 1000);
};

// How long in milliseconds we can remove an accessory when there's no update.
// This is a little complicated:
// First, we need to make sure gateway is online, if the gateway is offline, we do nothing.
// Then, we measure the delta since last update time, if it's too long, remove it.
MiAqaraPlatform.prototype.removeOfflineAccessory = function () {
  return;
  const deviceAutoRemoveDelta = 3600 * 1000;
  const gatewayAutoRemoveDelta = 24 * 3600 * 1000;
  var accessoriesToRemove = [];

  for (var i = this.accessories.length - 1; i--;) {
    var accessory = this.accessories[i];
    var gatewayId = this.deviceToGatewayId[accessory.UUID];
    var lastTime = this.lastDeviceUpdateTime[accessory.UUID];
    var removeFromGateway = gatewayId && ((this.lastGatewayUpdateTime[gatewayId] - lastTime) > deviceAutoRemoveDelta);

    if (removeFromGateway || (Date.now() - lastTime) > gatewayAutoRemoveDelta) {
      this.log.debug("remove accessory %s", accessory.UUID);
      accessoriesToRemove.push(accessory);
      this.accessories.splice(i, 1);
    }
  }

  if (accessoriesToRemove.length > 0) {
    this.api.unregisterPlatformAccessories("homebridge-mi-aqara", "MiAqara", accessoriesToRemove);
  }
};

MiAqaraPlatform.prototype.refreshAccessoryActive = function (uuid) {
  this.accessoryLastActives[uuid] = Date.now();
};

// Function invoked when homebridge tries to restore cached accessory
// Developer can configure accessory at here (like setup event handler)
// Update current value
MiAqaraPlatform.prototype.configureAccessory = function (accessory) {
  this.log(`Try to restore cached accessory: ${accessory.displayName}`);

  // set the accessory to reachable if plugin can currently process the accessory
  // otherwise set to false and update the reachability later by invoking
  // accessory.updateReachability()
  accessory.reachable = true;
  accessory.on('identify', function (paired, callback) {
    this.log(`Accessory identified: ${accessory.displayName}`);
    callback();
  }.bind(this));

  this.refreshAccessoryActive(accessory.UUID);
  this.accessories[accessory.UUID] = accessory;
};

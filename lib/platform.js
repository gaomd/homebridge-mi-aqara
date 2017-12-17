"use strict";

const dgram = require('dgram');
const server = dgram.createSocket('udp4');
const serverPort = 9898;
const multicastAddress = '224.0.0.50';
const multicastPort = 4321;
const crypto = require('crypto');
const iv = Buffer.from([0x17, 0x99, 0x6d, 0x09, 0x3d, 0x28, 0xdd, 0xb3, 0xba, 0x69, 0x5a, 0x2e, 0x6f, 0x58, 0x56, 0x2e]);

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

  this.cachedGateways = {};
  this.parseGatewayConfig();
  this.cachedSubDevices = {};
  this.subDeviceOverrides = this.config['device_overrides'] || {};
  this.accessories = {};
  this.accessoryLastActives = {};

  this.subDeviceModelClassTable = {
    'plug': MiAqaraOutlet,                // 智能插座
    'ctrl_neutral1': MiAqaraSwitch,       // 墙壁开关（单键）
    'ctrl_neutral2': MiAqaraDualSwitch,   // 墙壁开关（双键）
    'sensor_ht': MiAqaraTempHumSensor,    // 温湿度传感器
  };

  // Keep discovering gateways every 300 seconds
  this.api.on('didFinishLaunching', function () {
    // Send whois to discover Aqara gateways
    this.pingGateways();

    // Resend whois every 300 seconds
    setInterval(function () {
      this.pingGateways();
    }.bind(this), 300 * 1000);
  }.bind(this));

  // this.scheduleSubDeviceAutoRemoval();
  this.startGatewayCommunicationServer();
}

/**
 * Load MAC Address and Password pairs from config
 */
MiAqaraPlatform.prototype.parseGatewayConfig = function () {
  const macs = this.config['gateway_mac_addresses'];
  const passwords = this.config['gateway_passwords'];

  if (!macs || !passwords) {
    throw new Error('Mi Gateway MAC Address or Password required.');
  }

  if (macs.length !== passwords.length) {
    throw new Error('Mi Gateway MAC Address and Password mismatch.')
  }

  for (let i = 0; i < macs.length; i++) {
    const gatewayId = macs[i].replace(/:/g, '').toLowerCase();
    this.cachedGateways[gatewayId] = {
      id: gatewayId,
      mac_address: macs[i],
      password: passwords[i],
      ip_address: '',
      ip_port: '',
      token: '',
    };
  }
};

MiAqaraPlatform.prototype.ensureGatewayExists = function (gatewayId) {
  if (!this.cachedGateways[gatewayId]) {
    throw new Error(`Gateway ${gatewayId} not found.`);
  }
};

MiAqaraPlatform.prototype.updateGatewayToken = function (gatewayId, token) {
  this.ensureGatewayExists(gatewayId);

  this.cachedGateways[gatewayId].token = token;
  this.log.debug(`Gateway ${gatewayId} token ${token} saved.`);
};

MiAqaraPlatform.prototype.updateGatewayIp = function (gatewayId, gatewayInfo) {
  this.ensureGatewayExists(gatewayId);

  this.cachedGateways[gatewayId].ip_address = gatewayInfo.address;
  this.cachedGateways[gatewayId].ip_port = gatewayInfo.port;
  this.log.debug(`Gateway ${gatewayId} IP address ${gatewayInfo.address}:${gatewayInfo.port} saved.`);
};

MiAqaraPlatform.prototype.getGatewayById = function (gatewayId) {
  this.ensureGatewayExists(gatewayId);

  return this.cachedGateways[gatewayId];
};

MiAqaraPlatform.prototype.getGatewayBySubDeviceId = function (subDeviceId) {
  if (!this.cachedSubDevices[subDeviceId]) {
    throw new Error(`Sub device ${subDeviceId} not found.`);
  }

  const gatewayId = this.cachedSubDevices[subDeviceId].belonging_gateway_id;

  return this.getGatewayById(gatewayId);
};

MiAqaraPlatform.prototype.generateGatewayPassKey = function (gatewayId) {
  const gateway = this.getGatewayById(gatewayId);

  if (!gateway.token.length) {
    throw new Error(`Gateway ${gatewayId} has no cached token.`);
  }

  const cipher = crypto.createCipheriv('aes-128-cbc', gateway.password, iv);
  let key = cipher.update(gateway.token, "ascii", "hex");
  key += cipher.final('hex');

  return key;
};

// Candidate signature: executeGatewayCommand
MiAqaraPlatform.prototype.sendCommandToGateway = function (commandType, params, port, ip) {
  if (Object.prototype.toString.call(params) !== "[object Object]") {
    params = {};
  }

  const query = Object.assign(params, {cmd: commandType});

  this.log.debug("Sent gateway ${ip || multicastAddress}:${port || multicastPort} with `${JSON.stringify(query)}`");
  server.send(JSON.stringify(query), port, ip);
};

MiAqaraPlatform.prototype.pingGateways = function () {
  server.send(JSON.stringify({cmd: 'whois'}), multicastPort, multicastAddress);
};

/**
 * Parse messages from gateways
 * @param message
 * @param gatewayInfo
 */
MiAqaraPlatform.prototype.onGatewayMessage = function (message, gatewayInfo) {
  this.log.debug(`New message from gateway ${gatewayInfo.address}:${gatewayInfo.port}, (${message})`);

  try {
    message = JSON.parse(message);
  } catch (e) {
    this.log.error("Invalid JSON %s", message);

    return;
  }

  const eventType = message['cmd'];
  const onMessageNextActionTable = {
    'iam': this.onGatewayPingBack,
    'heartbeat': this.onGatewayHeartbeat,
    'get_id_list_ack': this.onGatewaySubDeviceList,
    'read_ack': this.onGatewaySubDeviceStateReport,
    'report': this.onGatewaySubDeviceStateReport,
  };

  if (onMessageNextActionTable.hasOwnProperty(eventType)) {
    onMessageNextActionTable[eventType].bind(this)(message, gatewayInfo);
  }

  this.log.debug(`Unimplemented message type: ${eventType}`);
};

MiAqaraPlatform.prototype.onGatewayPingBack = function (message, gatewayInfo) {
  this.sendCommandToGateway("get_id_list", null, message["port"], message["ip"]);
};

MiAqaraPlatform.prototype.onGatewayHeartbeat = function (message, gatewayInfo) {
  if (message['model'] === 'gateway') {
    this.updateGatewayToken(message["sid"], message["token"]);
    this.updateGatewayIp(message['sid'], gatewayInfo);
  }
};

MiAqaraPlatform.prototype.onGatewaySubDeviceList = function (message, gatewayInfo) {
  const gatewayId = message['sid'];

  this.updateGatewayToken(gatewayId, message["token"]);
  this.updateGatewayIp(gatewayId, gatewayInfo);

  const eventData = JSON.parse(message['data']);
  for (let key in eventData) {
    if (eventData.hasOwnProperty(key)) {
      const subDeviceId = eventData[key];

      if (!this.cachedSubDevices[subDeviceId]) {
        this.cachedSubDevices[subDeviceId] = {
          instance: null,
          belonging_gateway_id: 0,
        }
      }

      this.cachedSubDevices[subDeviceId].belonging_gateway_id = gatewayId;

      this.sendCommandToGateway("read", {sid: subDeviceId}, gatewayInfo.port, gatewayInfo.address);
    }
  }
};

MiAqaraPlatform.prototype.onGatewaySubDeviceStateReport = function (message, gatewayInfo) {
  const subDeviceModel = message['model'];
  const eventData = JSON.parse(message['data']);

  if (this.subDeviceModelClassTable[subDeviceModel]) {
    const subDeviceId = message["sid"];

    if (!this.cachedSubDevices[subDeviceId]) {
      this.cachedSubDevices[subDeviceId] = {
        instance: null,
        belonging_gateway_id: 0,
      };
    }

    if (!this.cachedSubDevices[subDeviceId].instance) {
      this.cachedSubDevices[subDeviceId].instance = new this.subDeviceModelClassTable[subDeviceModel](this, message["sid"], message["model"]);
    }

    this.cachedSubDevices[subDeviceId].instance.processDeviceReportEvent(eventData);
  }
};

MiAqaraPlatform.prototype.startGatewayCommunicationServer = function () {
  // Subscribe events from gateways
  server.on('message', this.onGatewayMessage.bind(this));

  server.on('error', function (error) {
    this.log.error('An error occurred while listening for gateway packets.');
  }.bind(this));

  server.on('listening', function () {
    server.addMembership(multicastAddress);
    this.log.debug("Mi Aqara plugin listening on ${multicastAddress}:${serverPort}.");
  }.bind(this));

  server.bind(serverPort);
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
  this.log("Try to restore cached accessory: ${accessory.displayName}");

  // set the accessory to reachable if plugin can currently process the accessory
  // otherwise set to false and update the reachability later by invoking
  // accessory.updateReachability()
  accessory.reachable = true;
  accessory.on('identify', function (paired, callback) {
    this.log("Accessory identified: ${accessory.displayName}");
    callback();
  }.bind(this));

  this.refreshAccessoryActive(accessory.UUID);
  this.accessories.push(accessory);
};

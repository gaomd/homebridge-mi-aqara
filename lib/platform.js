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

  this.gateways = {};
  this.parseGatewayConfig();
  this.subDeviceToGatewayId = {};
  this.subDevices = {};
  this.subDeviceOverrides = this.config['device_overrides'] || {};
  this.accessories = {};
  this.accessoryLastActives = {};

  this.subDeviceClasses = {
    'plug': MiAqaraOutlet,                // 智能插座
    'ctrl_neutral1': MiAqaraSwitch,       // 墙壁开关（单键）
    'ctrl_neutral2': MiAqaraDualSwitch,   // 墙壁开关（双键）
    'sensor_ht': MiAqaraTempHumSensor,    // 温湿度传感器
  };

  // Keep discovering gateways every 300 seconds
  this.api.on('didFinishLaunching', function () {
    // Send whois to discover Aqara gateways
    this.invokeGateway("whois");

    // Resend whois every 300 seconds
    setInterval(function () {
      this.invokeGateway("whois");
    }.bind(this), 300 * 1000);
  }.bind(this));

  // this.scheduleSubDeviceAutoRemoval();
  this.listen();
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
    this.gateways[gatewayId] = {
      id: gatewayId,
      mac_address: macs[i],
      password: passwords[i],
      ip_address: '',
      ip_port: '',
      token: '',
    };
  }
};

/**
 * Store incoming token
 * @param gatewayId
 * @param token
 */
MiAqaraPlatform.prototype.refreshGatewayToken = function (gatewayId, token) {
  if (!this.gateways[gatewayId]) {
    throw new Error('Gateway with ID of ${gatewayId} not found.');
  }

  this.gateways[gatewayId].token = token;
  this.log.debug("Gateway ${gatewayId} token ${token} saved.");
};

MiAqaraPlatform.prototype.refreshGatewayIp = function (gatewayId, gatewayIp) {
  this.gateways[gatewayId].ip_address = gatewayIp.address;
  this.gateways[gatewayId].ip_port = gatewayIp.port;
};

MiAqaraPlatform.prototype.getGateway = function (gatewayId) {
  if (!this.gateways[gatewayId]) {
    throw new Error('Gateway ${gatewayId} not found.');
  }

  return this.gateways[gatewayId];
};

MiAqaraPlatform.prototype.getGatewayBySubDeviceId = function (subDeviceId) {
  if (!this.subDeviceToGatewayId[subDeviceId]) {
    throw new Error('Sub device ${subDeviceId} not found.');
  }

  const gatewayId = this.subDeviceToGatewayId[subDeviceId].gateway_id;

  return this.getGateway(gatewayId);
};

MiAqaraPlatform.prototype.createGatewayPassKey = function (gatewayId) {
  const gateway = this.getGateway(gatewayId);

  if (!gateway.token.length) {
    throw new Error('Gateway ${gatewayId} has no cached token.');
  }

  const cipher = crypto.createCipheriv('aes-128-cbc', gateway.password, iv);
  let key = cipher.update(gateway.token, "ascii", "hex");
  key += cipher.final('hex');

  return key;
};

MiAqaraPlatform.prototype.invokeGateway = function (commandType, params, port, ip) {
  if (Object.prototype.toString.call(params) !== "[object Object]") {
    params = {};
  }

  const query = Object.assign(params, {cmd: commandType});

  this.log.debug("Sent gateway ${ip || multicastAddress}:${port || multicastPort} with `${JSON.stringify(query)}`");
  server.send(JSON.stringify(query), port || multicastPort, ip || multicastAddress);
};

/**
 * Parse messages from gateways
 * @param event
 * @param gatewayIp
 */
MiAqaraPlatform.prototype.subscribeGatewayEvent = function (event, gatewayIp) {
  this.log.debug("Received from gateway ${gatewayIp.address}:${gatewayIp.port} with `${event}`");

  try {
    event = JSON.parse(event);
  } catch (e) {
    this.log.error("Invalid JSON %s", event);

    return;
  }

  const eventType = event['cmd'];

  if (eventType === 'iam') {
    this.invokeGateway("get_id_list", null, event["port"], event["ip"]);
  } else if (eventType === 'heartbeat') {
    if (event['model'] === 'gateway') {
      this.refreshGatewayToken(event["sid"], event["token"]);
      this.refreshGatewayIp(event['sid'], gatewayIp);
    }
  } else if (eventType === 'get_id_list_ack') {
    const gatewayId = event['sid'];

    this.refreshGatewayToken(gatewayId, event["token"]);
    this.refreshGatewayIp(gatewayId, gatewayIp);

    const eventData = JSON.parse(event['data']);
    for (let key in eventData) {
      if (eventData.hasOwnProperty(key)) {
        const deviceId = eventData[key];

        this.subDeviceToGatewayId[deviceId] = {
          gateway_id: gatewayId
        };

        this.invokeGateway("read", {sid: deviceId}, gatewayIp.port, gatewayIp.address);
      }
    }
  } else if (eventType === "read_ack" || eventType === "report") {
    const deviceModel = event['model'];
    const eventData = JSON.parse(event['data']);

    if (this.subDeviceClasses[deviceModel]) {
      const subDeviceId = deviceModel + ":" + event["sid"];
      if (!this.subDevices[subDeviceId]) {
        this.subDevices[subDeviceId] = new this.subDeviceClasses[deviceModel](this, event["sid"], event["model"]);
      }
      this.subDevices[subDeviceId].processDeviceReportEvent(eventData);
    }
  } else if (eventType === 'write_ack') {
    ;
  } else {
    ;
  }
};

MiAqaraPlatform.prototype.listen = function () {
  // Subscribe events from gateways
  server.on('message', this.subscribeGatewayEvent.bind(this));

  // TODO: err - Error object, https://nodejs.org/api/errors.html
  server.on('error', function (err) {
    this.log.error('error, msg - %s, stack - %s\n', err.message, err.stack);
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

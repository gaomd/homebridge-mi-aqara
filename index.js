const dgram = require('dgram');
const server = dgram.createSocket('udp4');
const serverPort = 9898;
const multicastAddress = '224.0.0.50';
const multicastPort = 4321;
const crypto = require('crypto');
const iv = Buffer.from([0x17, 0x99, 0x6d, 0x09, 0x3d, 0x28, 0xdd, 0xb3, 0xba, 0x69, 0x5a, 0x2e, 0x6f, 0x58, 0x56, 0x2e]);
const inherits = require('util').inherits;

module.exports = function (homebridge) {
  homebridge.registerPlatform("homebridge-mi-aqara", "MiAqara", MiAqara);
};

/*
 * The PLATFORM ITSELF
 */
function MiAqara(log, config, api) {
  var platform = this;

  this.log = log;

  // Save the API object as plugin needs to register new accessory via this object.
  this.api = api;

  // Record ID/Password of gateways
  this.gatewayCredentials = {};

  // Record gateway token
  this.gateways = {};

  // Record gateway ID/Address/Port the devices are under
  this.devices = {};

  this.deviceOverrides = {};

  this.deviceTypes = {
    "SENSOR_TEMP_HUM": "sensor_ht",
    "SENSOR_MOTION": "motion",
    "SENSOR_CONTACT": "magnet",
    "SWITCH": "ctrl_neutral1",
    "SWITCH_DUO": "ctrl_neutral2",
    "OUTLET": "plug"
  };

  this.deviceModelManagers = {
    'sensor_ht': new TemperatureAndHumidityParser(this),  // 温湿度传感器
    'motion': new MotionParser(this),                     // 人体传感器
    'magnet': new ContactParser(this),                    // 门窗传感器
    'ctrl_neutral1': new LightSwitchParser(this),         // 墙壁开关（单键）
    'ctrl_neutral2': new DuplexLightSwitchParser(this),   // 墙壁开关（双键）
    'plug': new PlugSwitchParser(this)                    // 智能插座
  };

  // Load gatewayCredentials from config.json
  this.parseConfig(config);

  // Start UDP server to communicate with gateways
  this.startServer();

  if (!api) {
    this.log.error("Your Homebridge is too old, please consider upgrade!");
  }

  // Keep discovering gateways every 300 seconds
  this.api.on('didFinishLaunching', function () {
    platform.queryGateway("whois");

    setInterval(function () {
      platform.queryGateway("whois");
    }, 300 * 1000);
  });

  this.scheduleDeviceAutoRemoval();
}

MiAqara.prototype.parseConfig = function (config) {
  // Load MAC/Password pair of gateways
  var gatewayMacAddresses = config['gateway_mac_addresses'];
  var gatewayPasswords = config['gateway_passwords'];
  if (gatewayMacAddresses && gatewayPasswords) {
    for (var index in gatewayPasswords) {
      if (gatewayPasswords.hasOwnProperty(index)) {
        this.gatewayCredentials[gatewayMacAddresses[index].replace(":", "").toLowerCase()] = gatewayPasswords[index];
      }
    }
  }

  this.deviceOverrides = config['device_overrides'] || {};
};

MiAqara.prototype.scheduleDeviceAutoRemoval = function () {
  var deviceSync = this.deviceSync;
  // Check removed accessory every half an hour.
  setInterval(function () {
    deviceSync.removeDisconnectedAccessory();
  }, 1800 * 1000);
};

MiAqara.prototype.startServer = function () {
  var platform = this;

  // Process incoming gateway events
  server.on('message', this.processGatewayEvent.bind(this));

  // err - Error object, https://nodejs.org/api/errors.html
  server.on('error', function (err) {
    platform.log.error('error, msg - %s, stack - %s\n', err.message, err.stack);
  });

  // Show some message
  server.on('listening', function () {
    platform.log.debug("Mi Aqara server is listening on port 9898.");
    server.addMembership(multicastAddress);
  });

  // Start server
  server.bind(serverPort);
};

MiAqara.prototype.queryGateway = function (command, parameters, port, ip) {
  if (Object.prototype.toString.call(parameters) !== "[object Object]") {
    parameters = {};
  }
  var query = Object.assign(parameters, {cmd: command});
  server.send(JSON.stringify(query), port || multicastPort, ip || multicastAddress);
};

MiAqara.prototype.rememberGatewayToken = function (gatewayId, token) {
  this.gateways[gatewayId] = {
    token: token
  };
};

// Parse messages sent from gateways
MiAqara.prototype.processGatewayEvent = function (event, gatewayIp) {
  var platform = this;
  // platform.log.debug('recv %s(%d bytes) from client %s:%d\n', event, event.length, gatewayIp.address, gatewayIp.port);
  try {
    event = JSON.parse(event);
  } catch (e) {
    platform.log.error("Invalid JSON %s", event);

    return;
  }

  var command = event['cmd'];

  if (command === 'iam') {
    platform.queryGateway("get_id_list", null, event["ip"], event["port"]);
  } else if (command === 'get_id_list_ack') {
    var gatewayId = event['sid'];

    this.rememberGatewayToken(gatewayId, event["token"]);

    var data = JSON.parse(event['data']);
    for (var key in data) {
      if (data.hasOwnProperty(key)) {
        var deviceId = data[key];

        this.devices[deviceId] = {
          underGateway: {
            id: gatewayId,
            address: gatewayIp.address,
            port: gatewayIp.port
          }
        };

        this.queryGateway("read", {sid: deviceId}, gatewayIp.port, gatewayIp.address);
      }
    }
  } else if (command === 'heartbeat') {
    if (event['model'] === 'gateway') {
      this.rememberGatewayToken(event["sid"], event["token"]);
    }
  } else if (command === 'write_ack') {
    ;
  } else {
    var deviceModel = event['model'];

    if (deviceModel in this.deviceModelManagers) {
      var manager = this.deviceModelManagers[deviceModel];
      manager.initFromDeviceReportEvent(event, gatewayIp);
    }
  }
};

// Function invoked when Homebridge tries to restore cached accessory
// Developer can configure accessory at here (like setup event handler)
// Update current value
MiAqara.prototype.configureAccessory = function (accessory) {
  this.deviceSync.configureAccessory(accessory);
};

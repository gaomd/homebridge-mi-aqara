const dgram = require('dgram');
const inherits = require('util').inherits;
const crypto = require('crypto');
const iv = Buffer.from([0x17, 0x99, 0x6d, 0x09, 0x3d, 0x28, 0xdd, 0xb3, 0xba, 0x69, 0x5a, 0x2e, 0x6f, 0x58, 0x56, 0x2e]);
const serverSocket = dgram.createSocket('udp4');
const multicastAddress = '224.0.0.50';
const multicastPort = 4321;
const serverPort = 9898;
var MiAqaraAccessories;

module.exports = function (homebridge) {
  MiAqaraAccessories = require('./MiAqaraAccessories')(homebridge);
  homebridge.registerPlatform("homebridge-mi-aqara", "MiAqara", MiAqara, true);
};

function MiAqara(log, config, api) {
  this.log = log;

  this.devices = new MiAqaraAccessories(log, api);

  // Save the API object as plugin needs to register new accessory via this object.
  this.api = api;

  this.deviceTypes = {
    "SENSOR_TEMP_HUM": "sensor_ht",
    "SENSOR_MOTION": "motion",
    "SENSOR_CONTACT": "magnet",
    "SWITCH": "ctrl_neutral1",
    "SWITCH_DUO": "ctrl_neutral2",
    "OUTLET": "plug"
  };

  this.deviceParsers = {
    'sensor_ht': new TemperatureAndHumidityParser(this),  // 温湿度传感器
    // 'motion': new MotionParser(this),                     // 人体传感器
    // 'magnet': new ContactParser(this),                    // 门窗传感器
    'ctrl_neutral1': new LightSwitchParser(this),         // 墙壁开关（单键）
    'ctrl_neutral2': new DuplexLightSwitchParser(this),   // 墙壁开关（双键）
    'plug': new PlugSwitchParser(this)                    // 智能插座
  };

  // A lookup table to get cipher password from Gateway/Device ID.
  this.credentials = {};

  // A lookup table to find Gateway ID from a Device ID.
  // This is used when we sending a command to the Gateway.
  this.deviceGatewayMap = {};

  // A lookup table to get token from a Gateway ID.
  this.gatewayTokens = {};

  // To get Gateway's IP address from a Device ID.
  this.gatewayIpAddress = {};

  // To get Gateway's port from a Device ID.
  this.gatewayIpPort = {};

  this.deviceOverrides = {};

  // Load credentials from config.json
  this.parseConfig(config);

  this.devices.deviceAliases = this.deviceOverrides;

  // Start UDP server to communicate with Gateways
  this.startServer();

  if (!api) {
    this.log.error("Homebridge's version is too old, please upgrade!");
  }

  this.scheduleMulticast();
  this.scheduleDeviceAutoRemoval();
}

MiAqara.prototype.parseConfig = function (config) {
  // Load mac address & password pair of Gateways
  var gatewayMacAddresses = config['gateway_mac_addresses'];
  var gatewayPasswords = config['gateway_passwords'];
  if (gatewayMacAddresses && gatewayPasswords) {
    for (var index in gatewayPasswords) {
      if (gatewayPasswords.hasOwnProperty(index)) {
        this.credentials[gatewayMacAddresses[index].replace(":", "").toLowerCase()] = gatewayPasswords[index];
      }
    }
  }

  this.deviceOverrides = config['device_overrides'] || {};
};

MiAqara.prototype.scheduleMulticast = function () {
  this.api.on('didFinishLaunching', function () {
    // Send whois to discovery Gateways and resend every 300 seconds
    var whoisCommand = '{"cmd": "whois"}';
    // log.debug("send %s to %s:%d", whoisCommand, multicastAddress, multicastPort);
    serverSocket.send(whoisCommand, 0, whoisCommand.length, multicastPort, multicastAddress);

    setInterval(function () {
      // log.debug("send %s to %s:%d", whoisCommand, multicastAddress, multicastPort);
      serverSocket.send(whoisCommand, 0, whoisCommand.length, multicastPort, multicastAddress);
    }, 300000);
  });
};

MiAqara.prototype.scheduleDeviceAutoRemoval = function () {
  var factory = this.devices;
  // Check removed accessory every half hour.
  setInterval(function () {
    factory.removeDisconnectedAccessory();
  }, 1800000);
};

MiAqara.prototype.startServer = function () {
  var platform = this;

  // Initialize a server socket for Gateways.
  serverSocket.on('message', this.parseMessage.bind(this));

  // err - Error object, https://nodejs.org/api/errors.html
  serverSocket.on('error', function (err) {
    platform.log.error('error, msg - %s, stack - %s\n', err.message, err.stack);
  });

  // Show some message
  serverSocket.on('listening', function () {
    platform.log.debug("Mi Aqara server is listening on port 9898.");
    serverSocket.addMembership(multicastAddress);
  });

  // Start server
  serverSocket.bind(serverPort);
};

// Parse messages sent from Gateways
MiAqara.prototype.parseMessage = function (message, remote) {
  var platform = this;
  // platform.log.debug('recv %s(%d bytes) from client %s:%d\n', message, message.length, remote.address, remote.port);
  var response;
  try {
    response = JSON.parse(message);
  } catch (ex) {
    platform.log.error("Bad json %s", message);
    return;
  }

  var cmd = response['cmd'];
  if (cmd === 'iam') {
    var address = response['ip'];
    var port = response['port'];
    response = '{"cmd":"get_id_list"}';
    // platform.log.debug("send %s to %s:%d", response, address, port);
    serverSocket.send(response, 0, response.length, port, address);
  } else if (cmd === 'get_id_list_ack') {
    var gatewayId = response['sid'];

    // Remember Gateway's token
    this.gatewayTokens[gatewayId] = response['token'];

    var data = JSON.parse(response['data']);
    for (var index in data) {
      if (data.hasOwnProperty(index)) {
        var deviceId = data[index];

        // Remember the Gateway/Device relation
        this.deviceGatewayMap[deviceId] = gatewayId;
        this.gatewayIpAddress[deviceId] = remote.address;
        this.gatewayIpPort[deviceId] = remote.port;

        response = '{"cmd":"read", "sid":"' + deviceId + '"}';
        // platform.log.debug("send %s to %s:%d", response, remote.address, remote.port);
        serverSocket.send(response, 0, response.length, remote.port, remote.address);
      }
    }
  } else if (cmd === 'heartbeat') {
    if (response['model'] === 'gateway') {
      gatewayId = response['sid'];
      // Remember Gateway's token
      this.gatewayTokens[gatewayId] = response['token'];
    }
  } else if (cmd === 'write_ack') {
  } else {
    var deviceModel = response['model'];

    if (deviceModel in this.deviceParsers) {
      this.deviceParsers[deviceModel].parse(response, remote);
    }
  }
};

// Function invoked when Homebridge tries to restore cached accessory
// Developer can configure accessory at here (like setup event handler)
// Update current value
MiAqara.prototype.configureAccessory = function (accessory) {
  this.devices.configureAccessory(accessory);
};

// Base parser
BaseParser = function () {
  this.platform = null;
};

BaseParser.prototype.init = function (platform) {
  this.platform = platform;
  this.devices = platform.devices;
};

// Temperature and humidity sensor data parser
TemperatureAndHumidityParser = function (platform) {
  this.init(platform);
};

inherits(TemperatureAndHumidityParser, BaseParser);

TemperatureAndHumidityParser.prototype.parse = function (fieldReport) {
  var deviceId = fieldReport['sid'];
  var gatewayId = this.platform.deviceGatewayMap[deviceId];
  var data = JSON.parse(fieldReport['data']);

  var temperature = data['temperature'] / 100.0;
  var humidity = data['humidity'] / 100.0;
  this.devices.updateTemperatureAndHumidity(gatewayId, deviceId, temperature, humidity);
};

// Motion sensor data parser
MotionParser = function (platform) {
  this.init(platform);
};

inherits(MotionParser, BaseParser);

MotionParser.prototype.parse = function (fieldReport, remote) {
  var deviceId = fieldReport['sid'];
  var gatewayId = this.platform.deviceGatewayMap[deviceId];
  var data = JSON.parse(fieldReport['data']);
  var motionDetected = (data['status'] === 'motion');

  this.devices.updateMotion(gatewayId, deviceId, motionDetected);
};


// Contact/Magnet sensor data parser
ContactParser = function (platform) {
  this.init(platform);
};

inherits(ContactParser, BaseParser);

ContactParser.prototype.parse = function (fieldReport, remote) {
  var deviceId = fieldReport['sid'];
  var gatewayId = this.platform.deviceGatewayMap[deviceId];
  var data = JSON.parse(fieldReport['data']);
  var sealed = (data['status'] === 'close');

  this.devices.updateContact(gatewayId, deviceId, sealed);
};

// Light switch data parser
LightSwitchParser = function (platform) {
  this.init(platform);
  this.commanders = {};
};

inherits(LightSwitchParser, BaseParser);

LightSwitchParser.prototype.parse = function (fieldReport, remote) {
  var deviceId = fieldReport['sid'];
  var gatewayId = this.platform.deviceGatewayMap[deviceId];
  var data = JSON.parse(fieldReport['data']);

  // channel_0 can be three states: on, off, unknown.
  // we can't do anything when state is unknown, so just ignore it.
  if (data['channel_0'] === 'unknown') {
    this.platform.log.warn("warn %s(sid:%s):channel_0's state is unknown, ignore it.", fieldReport['model'], deviceId);
  } else {
    var on = (data['channel_0'] === 'on');
    var commander;

    if (deviceId in this.commanders) {
      commander = this.commanders[deviceId];
    } else {
      commander = new LightSwitchCommander(this.platform, deviceId, fieldReport['model'], 'channel_0');
      this.commanders[deviceId] = commander;
    }

    commander.update(on);
    this.devices.updateLightSwitch(gatewayId, deviceId, 'L', on, commander);
  }
};

// Duplex light switch data parser
DuplexLightSwitchParser = function (platform) {
  this.init(platform);
  this.commanders0 = {};
  this.commanders1 = {};
};

inherits(DuplexLightSwitchParser, BaseParser);

DuplexLightSwitchParser.prototype.parse = function (fieldReport, remote) {
  var deviceId = fieldReport['sid'];
  var gatewayId = this.platform.deviceGatewayMap[deviceId];
  var switchKeyStates = JSON.parse(fieldReport['data']);
  var switchKeys = ['channel_0', 'channel_1'];
  var sideIdentifiers = ['L', 'R'];
  var commanders = [this.commanders0, this.commanders1];

  for (var index in switchKeys) {
    if (switchKeys.hasOwnProperty(index)) {
      var switchKey = switchKeys[index];
      if (switchKey in switchKeyStates) {
        // There are three states: on, off, unknown.
        // We can't do anything when state is unknown, so just ignore it.
        if (switchKeyStates[switchKey] === 'unknown') {
          this.platform.log.warn("warn %s(sid:%s):%s's state is unknown, ignore it.", fieldReport['model'], deviceId, switchKey);
        } else {
          var turnedOn = (switchKeyStates[switchKey] === 'on');
          var commander = this.parseInternal(deviceId, commanders[index], fieldReport['model'], switchKey, remote, turnedOn);
          this.devices.updateLightSwitch(gatewayId, deviceId, sideIdentifiers[index], turnedOn, commander);
        }
      }
    }
  }
};

DuplexLightSwitchParser.prototype.parseInternal = function (deviceId, commanders, deviceModel, switchKey, remote, turnedOn) {
  var commander;

  if (deviceId in commanders) {
    commander = commanders[deviceId];
  } else {
    commander = new LightSwitchCommander(this.platform, deviceId, deviceModel, switchKey);
    commanders[deviceId] = commander;
  }

  commander.update(turnedOn);

  return commander;
};

// Plug data parser
PlugSwitchParser = function (platform) {
  this.init(platform);
  this.commanders = {};
};

inherits(PlugSwitchParser, BaseParser);

PlugSwitchParser.prototype.parse = function (report, remote) {
  var deviceId = report['sid'];
  var gatewayId = this.platform.deviceGatewayMap[deviceId];
  var data = JSON.parse(report['data']);

  // channel_0 can be three states: on, off, unknown.
  // we can't do anything when state is unknown, so just ignore it.
  if (data['status'] === 'unknown') {
    this.platform.log.warn("warn %s(sid:%s):status's state is unknown, ignore it.", report['model'], deviceId);
  } else {
    var turnedOn = (data['status'] === 'on');
    var commander;

    if (deviceId in this.commanders) {
      commander = this.commanders[deviceId];
    } else {
      commander = new LightSwitchCommander(this.platform, deviceId, report['model'], 'status');
      this.commanders[deviceId] = commander;
    }

    commander.update(turnedOn);
    this.devices.updatePlugSwitch(gatewayId, deviceId, turnedOn, commander);
  }
};

// Base commander
BaseCommander = function () {
  this.lastValue = null;
};

BaseCommander.prototype.init = function (platform, deviceId, deviceModel) {
  this.platform = platform;
  this.deviceModel = deviceModel;
  this.deviceId = deviceId;
};

BaseCommander.prototype.update = function (value) {
  this.lastValue = value;
};

BaseCommander.prototype.sendCommand = function (command) {
  var remoteAddress = this.platform.gatewayIpAddress[this.deviceId];
  var remotePort = this.platform.gatewayIpPort[this.deviceId];
  serverSocket.send(command, 0, command.length, remotePort, remoteAddress);
  // this.platform.log.debug("send %s to %s:%d", command, remoteAddress, remotePort);
  // Send twice to reduce UDP packet loss
  // serverSocket.send(command, 0, command.length, remotePort, remoteAddress);
};

// Commander for light switch
LightSwitchCommander = function (platform, deviceId, deviceModel, switchKey) {
  this.init(platform, deviceId, deviceModel);
  this.switchKey = switchKey;
};

inherits(LightSwitchCommander, BaseCommander);

LightSwitchCommander.prototype.send = function (on) {
  var platform = this.platform;

  // Don't send duplicate command out.
  // TODO Possible bug
  if (this.lastValue == on) {
    platform.log.debug("Value not changed, do nothing");
    return;
  }

  var gatewayId = platform.deviceGatewayMap[this.deviceId];
  var gatewayPassword = platform.credentials[gatewayId];

  // No password for this Gateway, please edit ~/.homebridge/config.json
  if (!gatewayPassword) {
    platform.log.error("No password for Gateway %s, please edit ~/.homebridge/config.json", gatewayId);
    return;
  }

  var cipher = crypto.createCipheriv('aes-128-cbc', gatewayPassword, iv);
  var gatewayToken = platform.gatewayTokens[gatewayId];
  // platform.log.debug("cipher Gateway %s, Device %s, password %s", gatewayId, this.deviceId, gatewayPassword);

  var key = "hello";
  if (cipher && gatewayToken) {
    key = cipher.update(gatewayToken, "ascii", "hex");
    cipher.final('hex'); // Useless data, don't know why yet.
  }

  var command = '{"cmd":"write","model":"' + this.deviceModel + '","sid":"' + this.deviceId + '","data":"{\\"' + this.switchKey + '\\":\\"' + (on ? 'on' : 'off') + '\\", \\"key\\": \\"' + key + '\\"}"}';
  this.sendCommand(command);
};

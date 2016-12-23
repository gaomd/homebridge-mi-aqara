const dgram = require('dgram');
const inherits = require('util').inherits;
const crypto = require('crypto');
const iv = Buffer.from([0x17, 0x99, 0x6d, 0x09, 0x3d, 0x28, 0xdd, 0xb3, 0xba, 0x69, 0x5a, 0x2e, 0x6f, 0x58, 0x56, 0x2e]);
const serverSocket = dgram.createSocket('udp4');
const multicastAddress = '224.0.0.50';
const multicastPort = 4321;
const serverPort = 9898;
var AqaraAccessoryFactory;

module.exports = function (homebridge) {
  AqaraAccessoryFactory = require('./AqaraAccessoryFactory')(homebridge);

  // Register
  homebridge.registerPlatform("homebridge-aqara", "AqaraPlatform", AqaraPlatform, true);
};

// Platform constructor
// config may be null
// api may be null if launched from old homebridge version
function AqaraPlatform(log, config, api) {
  // Initialize
  this.log = log;
  this.factory = new AqaraAccessoryFactory(log, api);
  this.setTypes = {
    "SENSOR_HT": "sensor_ht",
    "SENSOR_MOTION": "motion",
    "SENSOR_CONTACT": "magnet",
    "SWITCH": "ctrl_neutral1",
    "SWITCH_DUO": "ctrl_neutral2",
    "OUTLET": "plug"
  };
  this.parsers = {
    'sensor_ht': new TemperatureAndHumidityParser(this),  // 温湿度传感器
    'motion': new MotionParser(this),                     // 人体传感器
    'magnet': new ContactParser(this),                    // 门窗传感器
    'ctrl_neutral1': new LightSwitchParser(this),         // 墙壁开关（单键）
    'ctrl_neutral2': new DuplexLightSwitchParser(this),   // 墙壁开关（双键）
    'plug': new PlugSwitchParser(this)                    // 智能插座
  };

  // A lookup table to get cipher password from gateway/device sid.
  this.passwords = {};

  // A lookup table to find gateway sid from a device sid.
  // This is used when we sending a command to the gateway.
  this.setIdToHubIdMap = {};

  // A lookup table to get token from a gateway sid.
  this.hubToken = {};

  // To get gateway's address from a device sid.
  this.hubAddress = {};

  // To get gateways' port from a device sid.
  this.hubPort = {};

  // Load passwords from config.json
  this.loadConfig(config);

  // Start UDP server to communicate with Aqara gateways
  this.startServer();

  // Something else to do
  this.doRestThings(api);
}

AqaraPlatform.prototype.loadConfig = function (config) {
  // Load cipher password for each gateway from HomeBridge's config.json
  var hubId = config['hub_mac_address'];
  var hubPassword = config['hub_password'];
  if (hubId && hubPassword) {
    for (var index in hubPassword) {
      if (hubPassword.hasOwnProperty(index)) {
        this.passwords[hubId[index]] = hubPassword[index];
        // log.debug("Load password %s:%s from config.json file", sid[index], password[index]);
      }
    }
  }
};

AqaraPlatform.prototype.doRestThings = function (api) {
  if (api) {
    // Save the API object as plugin needs to register new accessory via this object.
    this.api = api;

    this.api.on('didFinishLaunching', function () {
      // Send whois to discovery Aqara gateways and resend every 300 seconds
      var whoisCommand = '{"cmd": "whois"}';
      // log.debug("send %s to %s:%d", whoisCommand, multicastAddress, multicastPort);
      serverSocket.send(whoisCommand, 0, whoisCommand.length, multicastPort, multicastAddress);

      setInterval(function () {
        // log.debug("send %s to %s:%d", whoisCommand, multicastAddress, multicastPort);
        serverSocket.send(whoisCommand, 0, whoisCommand.length, multicastPort, multicastAddress);
      }, 300000);
    });

    var factory = this.factory;
    // Check removed accessory every half hour.
    setInterval(function () {
      factory.autoRemoveAccessory();
    }, 1800000);
  } else {
    this.log.error("Homebridge's version is too old, please upgrade!");
  }
};

AqaraPlatform.prototype.startServer = function () {
  var that = this;

  // Initialize a server socket for Aqara gateways.
  serverSocket.on('message', this.parseMessage.bind(this));

  // err - Error object, https://nodejs.org/api/errors.html
  serverSocket.on('error', function (err) {
    that.log.error('error, msg - %s, stack - %s\n', err.message, err.stack);
  });

  // Show some message
  serverSocket.on('listening', function () {
    that.log.debug("Aqara server is listening on port 9898.");
    serverSocket.addMembership(multicastAddress);
  });

  // Start server
  serverSocket.bind(serverPort);
};

// Parse message which is sent from Aqara gateways
AqaraPlatform.prototype.parseMessage = function (message, rinfo) {
  var platform = this;
  // platform.log.debug('recv %s(%d bytes) from client %s:%d\n', message, message.length, rinfo.address, rinfo.port);
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
    var hubId = response['sid'];

    // Remember gateway's token
    this.hubToken[hubId] = response['token'];

    var data = JSON.parse(response['data']);
    for (var index in data) {
      if (data.hasOwnProperty(index)) {
        var setId = data[index];

        // Remember the device/gateway relation
        this.setIdToHubIdMap[setId] = hubId;
        this.hubAddress[setId] = rinfo.address;
        this.hubPort[setId] = rinfo.port;

        response = '{"cmd":"read", "sid":"' + setId + '"}';
        // platform.log.debug("send %s to %s:%d", response, rinfo.address, rinfo.port);
        serverSocket.send(response, 0, response.length, rinfo.port, rinfo.address);
      }
    }
  } else if (cmd === 'heartbeat') {
    if (response['model'] === 'gateway') {
      hubId = response['sid'];
      // Remember gateway's token
      this.hubToken[hubId] = response['token'];
    }
  } else if (cmd === 'write_ack') {
  } else {
    var model = response['model'];

    if (model in this.parsers) {
      this.parsers[model].parse(response, rinfo);
    }
  }
};

// Function invoked when homebridge tries to restore cached accessory
// Developer can configure accessory at here (like setup event handler)
// Update current value
AqaraPlatform.prototype.configureAccessory = function (accessory) {
  this.factory.configureAccessory(accessory);
};

// Base parser
BaseParser = function () {
  this.platform = null;
};

BaseParser.prototype.init = function (platform) {
  this.platform = platform;
  this.factory = platform.factory;
};

// Tmeperature and humidity sensor data parser
TemperatureAndHumidityParser = function (platform) {
  this.init(platform);
};

inherits(TemperatureAndHumidityParser, BaseParser);

TemperatureAndHumidityParser.prototype.parse = function (fieldReport) {
  var setId = fieldReport['sid'];
  var hubId = this.platform.setIdToHubIdMap[setId];
  var data = JSON.parse(fieldReport['data']);

  var temperature = data['temperature'] / 100.0;
  var humidity = data['humidity'] / 100.0;
  this.factory.setTemperatureAndHumidity(hubId, setId, temperature, humidity);
};

// Motion sensor data parser
MotionParser = function (platform) {
  this.init(platform);
};

inherits(MotionParser, BaseParser);

MotionParser.prototype.parse = function (fieldReport, rinfo) {
  var setId = fieldReport['sid'];
  var hubId = this.platform.setIdToHubIdMap[setId];
  var data = JSON.parse(fieldReport['data']);
  var motionDetected = (data['status'] === 'motion');

  this.factory.setMotion(hubId, setId, motionDetected);
};


// Contact/Magnet sensor data parser
ContactParser = function (platform) {
  this.init(platform);
};

inherits(ContactParser, BaseParser);

ContactParser.prototype.parse = function (fieldReport, rinfo) {
  var setId = fieldReport['sid'];
  var hubId = this.platform.setIdToHubIdMap[setId];
  var data = JSON.parse(fieldReport['data']);
  var sealed = (data['status'] === 'close');

  this.factory.setContact(hubId, setId, sealed);
};

// Light switch data parser
LightSwitchParser = function (platform) {
  this.init(platform);
  this.commanders = {};
};

inherits(LightSwitchParser, BaseParser);

LightSwitchParser.prototype.parse = function (fieldReport, rinfo) {
  var setId = fieldReport['sid'];
  var hubId = this.platform.setIdToHubIdMap[setId];
  var data = JSON.parse(fieldReport['data']);

  // channel_0 can be three states: on, off, unknown.
  // we can't do anything when state is unknown, so just ignore it.
  if (data['channel_0'] === 'unknown') {
    this.platform.log.warn("warn %s(sid:%s):channel_0's state is unknown, ignore it.", fieldReport['model'], setId);
  } else {
    var on = (data['channel_0'] === 'on');
    var commander;

    if (setId in this.commanders) {
      commander = this.commanders[setId];
    } else {
      commander = new LightSwitchCommander(this.platform, setId, fieldReport['model'], 'channel_0');
      this.commanders[setId] = commander;
    }

    commander.update(on);
    this.factory.setLightSwitch(hubId, setId, 'LW' + setId, on, commander);
  }
};

// Duplex light switch data parser
DuplexLightSwitchParser = function (platform) {
  this.init(platform);
  this.commanders0 = {};
  this.commanders1 = {};
};

inherits(DuplexLightSwitchParser, BaseParser);

DuplexLightSwitchParser.prototype.parse = function (fieldReport, rinfo) {
  var setId = fieldReport['sid'];
  var hubId = this.platform.setIdToHubIdMap[setId];
  var switchKeyStates = JSON.parse(fieldReport['data']);
  var switchKeys = ['channel_0', 'channel_1'];
  var uuidPrefix = ['LW0', 'LW1'];
  var commanders = [this.commanders0, this.commanders1];

  for (var index in switchKeys) {
    if (switchKeys.hasOwnProperty(index)) {
      var switchKey = switchKeys[index];
      if (switchKey in switchKeyStates) {
        // There are three states: on, off, unknown.
        // We can't do anything when state is unknown, so just ignore it.
        if (switchKeyStates[switchKey] === 'unknown') {
          this.platform.log.warn("warn %s(sid:%s):%s's state is unknown, ignore it.", fieldReport['model'], setId, switchKey);
        } else {
          var turnedOn = (switchKeyStates[switchKey] === 'on');
          var commander = this.parseInternal(setId, commanders[index], fieldReport['model'], switchKey, rinfo, turnedOn);
          this.factory.setLightSwitch(hubId, setId, uuidPrefix[index] + setId, turnedOn, commander);
        }
      }
    }
  }
};

DuplexLightSwitchParser.prototype.parseInternal = function (setId, commanders, setModel, switchKey, rinfo, turnedOn) {
  var commander;

  if (setId in commanders) {
    commander = commanders[setId];
  } else {
    commander = new LightSwitchCommander(this.platform, setId, setModel, switchKey);
    commanders[setId] = commander;
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

PlugSwitchParser.prototype.parse = function (report, rinfo) {
  var setId = report['sid'];
  var hubId = this.platform.setIdToHubIdMap[setId];
  var data = JSON.parse(report['data']);

  // channel_0 can be three states: on, off, unknown.
  // we can't do anything when state is unknown, so just ignore it.
  if (data['status'] === 'unknown') {
    this.platform.log.warn("warn %s(sid:%s):status's state is unknown, ignore it.", report['model'], setId);
  } else {
    var turnedOn = (data['status'] === 'on');
    var commander;

    if (setId in this.commanders) {
      commander = this.commanders[setId];
    } else {
      commander = new LightSwitchCommander(this.platform, setId, report['model'], 'status');
      this.commanders[setId] = commander;
    }

    commander.update(turnedOn);
    this.factory.setPlugSwitch(hubId, setId, 'PLUG' + setId, turnedOn, commander);
  }
};

// Base commander
BaseCommander = function () {
  this.lastValue = null;
};

BaseCommander.prototype.init = function (platform, setId, setModel) {
  this.platform = platform;
  this.setModel = setModel;
  this.setId = setId;
};

BaseCommander.prototype.update = function (value) {
  this.lastValue = value;
};

BaseCommander.prototype.sendCommand = function (command) {
  var remoteAddress = this.platform.hubAddress[this.setId];
  var remotePort = this.platform.hubPort[this.setId];
  serverSocket.send(command, 0, command.length, remotePort, remoteAddress);
  // this.platform.log.debug("send %s to %s:%d", command, remoteAddress, remotePort);
  // Send twice to reduce UDP packet loss
  // serverSocket.send(command, 0, command.length, remotePort, remoteAddress);
};

// Commander for light switch
LightSwitchCommander = function (platform, setId, setModel, switchKey) {
  this.init(platform, setId, setModel);
  this.switchKey = switchKey;
};

inherits(LightSwitchCommander, BaseCommander);

LightSwitchCommander.prototype.send = function (on) {
  var platform = this.platform;

  // Don't send duplicate command out.
  if (this.lastValue == on) {
    platform.log.debug("Value not changed, do nothing");
    return;
  }

  var hubId = platform.setIdToHubIdMap[this.setId];
  var hubPassword = platform.passwords[hubId];

  // No password for this device, please edit ~/.homebridge/config.json
  if (!hubPassword) {
    platform.log.error("No password for gateway %s, please edit ~/.homebridge/config.json", hubId);
    return;
  }

  var cipher = crypto.createCipheriv('aes-128-cbc', hubPassword, iv);
  var hubToken = platform.hubToken[hubId];
  // platform.log.debug("cipher gateway %s, device %s, password %s", gatewaySid, this.setId, password);

  var key = "hello";
  if (cipher && hubToken) {
    key = cipher.update(hubToken, "ascii", "hex");
    cipher.final('hex'); // Useless data, don't know why yet.
  }

  var command = '{"cmd":"write","model":"' + this.setModel + '","sid":"' + this.setId + '","data":"{\\"' + this.switchKey + '\\":\\"' + (on ? 'on' : 'off') + '\\", \\"key\\": \\"' + key + '\\"}"}';
  this.sendCommand(command);
};

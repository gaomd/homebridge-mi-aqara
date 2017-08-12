const inherits = require('util').inherits;
var BaseParser = require("../deviceSync/base-parser");

// Plug data parser
PlugSwitchParser = function (platform) {
  this.init(platform);
  this.commanders = {};
};

inherits(PlugSwitchParser, BaseParser);

PlugSwitchParser.prototype.initFromDeviceReportEvent = function (report, remote) {
  var deviceId = report['sid'];
  var gatewayId = this.platform.devices[deviceId].underGateway.id;
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
    this.deviceSync.updatePlugSwitch(gatewayId, deviceId, turnedOn, commander);
  }
};


// Temperature and humidity sensor data parser
TemperatureAndHumidityParser = function (platform) {
  this.init(platform);
};

inherits(TemperatureAndHumidityParser, BaseParser);

TemperatureAndHumidityParser.prototype.initFromDeviceReportEvent = function (event) {
  var deviceId = event['sid'];
  var gatewayId = this.platform.devices[deviceId].underGateway.id;
  var data = JSON.parse(event['data']);

  var temperature = data['temperature'] / 100.0;
  var humidity = data['humidity'] / 100.0;
  this.deviceSync.updateTemperatureAndHumidity(gatewayId, deviceId, temperature, humidity);
};

// Motion sensor data parser
MotionParser = function (platform) {
  this.init(platform);
};

inherits(MotionParser, BaseParser);

MotionParser.prototype.initFromDeviceReportEvent = function (event, remote) {
  var deviceId = event['sid'];
  var gatewayId = this.platform.devices[deviceId].underGateway.id;
  var data = JSON.parse(event['data']);
  var motionDetected = (data['status'] === 'motion');

  this.deviceSync.updateMotion(gatewayId, deviceId, motionDetected);
};


// Contact/Magnet sensor data parser
ContactParser = function (platform) {
  this.init(platform);
};

inherits(ContactParser, BaseParser);

ContactParser.prototype.initFromDeviceReportEvent = function (event, remote) {
  var deviceId = event['sid'];
  var gatewayId = this.platform.devices[deviceId].underGateway.id;
  var data = JSON.parse(event['data']);
  var sealed = (data['status'] === 'close');

  this.deviceSync.updateContact(gatewayId, deviceId, sealed);
};

// Light switch data parser
LightSwitchParser = function (platform) {
  this.init(platform);
  this.commanders = {};
};

inherits(LightSwitchParser, BaseParser);

LightSwitchParser.prototype.initFromDeviceReportEvent = function (event, remote) {
  var deviceId = event['sid'];
  var gatewayId = this.platform.devices[deviceId].underGateway.id;
  var data = JSON.parse(event['data']);

  // channel_0 can be three states: on, off, unknown.
  // we can't do anything when state is unknown, so just ignore it.
  if (data['channel_0'] === 'unknown') {
    this.platform.log.warn("warn %s(sid:%s):channel_0's state is unknown, ignore it.", event['model'], deviceId);
  } else {
    var on = (data['channel_0'] === 'on');
    var commander;

    if (deviceId in this.commanders) {
      commander = this.commanders[deviceId];
    } else {
      commander = new LightSwitchCommander(this.platform, deviceId, event['model'], 'channel_0');
      this.commanders[deviceId] = commander;
    }

    commander.update(on);
    this.deviceSync.updateLightSwitch(gatewayId, deviceId, 'L', on, commander);
  }
};

// Duplex light switch data parser
DuplexLightSwitchParser = function (platform) {
  this.init(platform);
  this.commanders0 = {};
  this.commanders1 = {};
};

inherits(DuplexLightSwitchParser, BaseParser);

DuplexLightSwitchParser.prototype.initFromDeviceReportEvent = function (event, remote) {
  var deviceId = event['sid'];
  var gatewayId = this.platform.devices[deviceId].underGateway.id;
  var switchKeyStates = JSON.parse(event['data']);
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
          this.platform.log.warn("warn %s(sid:%s):%s's state is unknown, ignore it.", event['model'], deviceId, switchKey);
        } else {
          var turnedOn = (switchKeyStates[switchKey] === 'on');
          var commander = this.parseInternal(deviceId, commanders[index], event['model'], switchKey, remote, turnedOn);
          this.deviceSync.updateLightSwitch(gatewayId, deviceId, sideIdentifiers[index], turnedOn, commander);
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

  var gatewayId = platform.devices[this.deviceId].underGateway.id;
  var gatewayPassword = platform.gatewayCredentials[gatewayId];

  // No password for this gateway, please edit ~/.homebridge/config.json
  if (!gatewayPassword) {
    platform.log.error("No password for Gateway %s, please edit ~/.homebridge/config.json", gatewayId);
    return;
  }

  var cipher = crypto.createCipheriv('aes-128-cbc', gatewayPassword, iv);
  var gatewayToken = platform.gateways[gatewayId].token;
  // platform.log.debug("cipher gateway %s, device %s, password %s", gatewayId, this.deviceId, gatewayPassword);

  var key = "hello";
  if (cipher && gatewayToken) {
    key = cipher.update(gatewayToken, "ascii", "hex");
    cipher.final('hex'); // Useless data, don't know why yet.
  }

  var command = '{"cmd":"write","model":"' + this.deviceModel + '","sid":"' + this.deviceId + '","data":"{\\"' + this.switchKey + '\\":\\"' + (on ? 'on' : 'off') + '\\", \\"key\\": \\"' + key + '\\"}"}';
  this.sendCommand(command);
};

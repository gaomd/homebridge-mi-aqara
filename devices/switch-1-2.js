
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
      commander = new SwitchCommander(this.platform, deviceId, event['model'], 'channel_0');
      this.commanders[deviceId] = commander;
    }

    commander.setCurrentValue(on);
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
    commander = new SwitchCommander(this.platform, deviceId, deviceModel, switchKey);
    commanders[deviceId] = commander;
  }

  commander.setCurrentValue(turnedOn);

  return commander;
};

// Light switch
MiAqaraAccessories.prototype.updateLightSwitch = function (gatewayId, deviceId, sideIdentifier, on, commander) {
  if (this.deviceOverrides["SWITCH-" + deviceId + "-" + sideIdentifier]
    && this.deviceOverrides["SWITCH-" + deviceId + "-" + sideIdentifier].category_override
    && this.deviceOverrides["SWITCH-" + deviceId + "-" + sideIdentifier].service_override) {
    this.syncHome(
      gatewayId,
      deviceId,
      this.getAccessoryDisplayName("SWITCH-" + deviceId + "-" + sideIdentifier),
      UUID.generate("SWITCH-" + deviceId + "-" + sideIdentifier),
      Accessory.Categories["FAN"],
      Service["Fan"],
      Characteristic.On,
      on,
      commander);

    // this.log(this.deviceOverrides["SWITCH-" + deviceId + "-" + sideIdentifier].category_override);
    // this.log(Accessory.Categories);
    // this.log(Accessory.Categories["FAN"]);
    // this.log(Accessory.Categories[this.deviceOverrides["SWITCH-" + deviceId + "-" + sideIdentifier].category_override]);
    // this.log(Service.Fan);
    // this.log(Service[this.deviceOverrides["SWITCH-" + deviceId + "-" + sideIdentifier].service_override]);
    return;
  }

  this.syncHome(
    gatewayId,
    deviceId,
    this.getAccessoryDisplayName("SWITCH-" + deviceId + "-" + sideIdentifier),
    UUID.generate("SWITCH-" + deviceId + "-" + sideIdentifier),
    Accessory.Categories.LIGHTBULB,
    Service.Lightbulb,
    Characteristic.On,
    on,
    commander);
};

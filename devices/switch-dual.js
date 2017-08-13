
// Light switch data parser
LightSwitchParser = function (platform) {
  this.init(platform);
  this.commanders = {};
};

inherits(LightSwitchParser, BaseParser);

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

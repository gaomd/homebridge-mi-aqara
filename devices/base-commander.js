"use strict";

// Base commander
var BaseCommander = function () {
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
  var remoteAddress = this.platform.devices[this.deviceId].underGateway.address;
  var remotePort = this.platform.devices[this.deviceId].underGateway.port;
  // TODO
  this.platform.queryGateway({}, JSON.parse(command), remotePort, remoteAddress);
};

module.exports = BaseCommander;

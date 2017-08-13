"use strict";

const crypto = require('crypto');
const iv = Buffer.from([0x17, 0x99, 0x6d, 0x09, 0x3d, 0x28, 0xdd, 0xb3, 0xba, 0x69, 0x5a, 0x2e, 0x6f, 0x58, 0x56, 0x2e]);

const inherits = require('util').inherits;

var BaseCommander = function () {
  this.currentValue = null;
};

BaseCommander.prototype.init = function (platform, deviceId, deviceModel) {
  this.platform = platform;
  this.deviceId = deviceId;
  this.deviceModel = deviceModel;
};

BaseCommander.prototype.setCurrentValue = function (value) {
  this.currentValue = value;
};

var SwitchCommander = function (platform, deviceId, deviceModel, switchKeyId) {
  this.init(platform, deviceId, deviceModel);
  this.buttonId = switchKeyId;
};

inherits(SwitchCommander, BaseCommander);

SwitchCommander.prototype.updateState = function (on) {
  var platform = this.platform;

  // Ignore duplicated command
  // TODO Possible bug
  if (this.currentValue === on) {
    platform.log.debug("Value not changed, do nothing");
    return;
  }

  var gatewayId = platform.devices[this.deviceId].underGateway.id;
  var gatewayPassword = platform.gatewayCredentials[gatewayId];
  var cipher = crypto.createCipheriv('aes-128-cbc', gatewayPassword, iv);
  var gatewayToken = platform.gateways[gatewayId].token;
  var key = "hello";
  if (cipher && gatewayToken) {
    key = cipher.update(gatewayToken, "ascii", "hex");
    cipher.final('hex'); // TODO: Useless data, don't know why yet.
  }

  var payload = {};
  payload[this.buttonId] = (on ? 'on' : 'off');
  payload["key"] = key;

  var query = {
    cmd: "write",
    model: this.deviceModel,
    sid: this.deviceId,
    data: JSON.stringify(payload)
  };

  var remoteAddress = this.platform.devices[this.deviceId].underGateway.address;
  var remotePort = this.platform.devices[this.deviceId].underGateway.port;
  this.platform.queryGateway(query.cmd, query, remotePort, remoteAddress);
};

module.exports = SwitchCommander;

"use strict";

const inherits = require('util').inherits;

let BaseCommander = function () {
};

BaseCommander.prototype.init = function (platform, subDeviceId, subDeviceModel) {
  this.platform = platform;
  this.subDeviceId = subDeviceId;
  this.subDeviceModel = subDeviceModel;
};

let SwitchCommander = function (platform, subDeviceId, subDeviceModel, buttonId) {
  this.init(platform, subDeviceId, subDeviceModel);
  this.buttonId = buttonId;
};

inherits(SwitchCommander, BaseCommander);

SwitchCommander.prototype.sendTargetState = function (on) {
  const gateway = this.platform.getSubDeviceBelongingGateway(this.subDeviceId);
  let payload = {};
  payload[this.buttonId] = (on ? 'on' : 'off');
  payload["key"] = this.platform.generateAuthKeyForGateway(gateway.id);

  let params = {
    cmd: "write",
    model: this.subDeviceModel,
    sid: this.subDeviceId,
    data: JSON.stringify(payload)
  };

  this.platform.commandGateway(gateway.id, params.cmd, params);
};

module.exports = SwitchCommander;

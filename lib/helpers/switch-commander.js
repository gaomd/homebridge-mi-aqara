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
  const gateway = this.platform.getGatewayBySubDeviceId(this.subDeviceId);
  let payload = {};
  payload[this.buttonId] = (on ? 'on' : 'off');
  payload["key"] = this.platform.generateGatewayPassKey(gateway.id);

  let params = {
    cmd: "write",
    model: this.subDeviceModel,
    sid: this.subDeviceId,
    data: JSON.stringify(payload)
  };

  this.platform.sendCommandToGateway(params.cmd, params, gateway.ip_port, gateway.ip_address);
};

module.exports = SwitchCommander;

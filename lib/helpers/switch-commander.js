"use strict";

module.exports = SwitchCommander;

function SwitchCommander(platform, subDeviceId, subDeviceModel, buttonId) {
  this.platform = platform;
  this.subDeviceId = subDeviceId;
  this.subDeviceModel = subDeviceModel;
  this.buttonId = buttonId;
}

SwitchCommander.prototype.setSubDeviceState = function (on) {
  let gateway;

  try {
    // Crashes happens when sub device information wasn't fully recorded yet.
    // This was caused by `get_id_list_ack` gateway message haven't received yet,
    // which is a gateway bug by not responding to the `iam` discovery message
    // TODO: report to upstream
    gateway = this.platform.getSubDeviceBelongingGateway(this.subDeviceId);
  } catch (e) {
    return false;
  }

  let statePayload = {};
  statePayload[this.buttonId] = (on ? 'on' : 'off');
  statePayload["key"] = this.platform.generateAuthKeyForGateway(gateway.id);

  let params = {
    cmd: "write",
    sid: this.subDeviceId,
    model: this.subDeviceModel,
    data: JSON.stringify(statePayload)
  };

  this.platform.commandGateway(gateway.id, params.cmd, params);

  return true;
};

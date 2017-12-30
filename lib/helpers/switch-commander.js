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
    // Crashes when sub device information wasn't fully retrieved.
    // This bug happens a lot, caused by gateway not responding to `iam`
    // discovery message after power up for some time, in turns we could not
    // receive the `get_id_list_ack` message, which was required to initialize
    // the sub device information.
    // TODO: report to upstream
    gateway = this.platform.getSubDeviceBelongingGateway(this.subDeviceId);
  } catch (e) {
    return new Error('Gateway sub device not ready yet.');
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

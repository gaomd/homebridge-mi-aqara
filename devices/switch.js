"use strict";

var SwitchCommander = require("../commanders/switch-commander");
var Accessory, PlatformAccessory, Service, Characteristic, UUID;
var AccessoryManager;

var MiAqaraSwitch = function (platform, deviceId, deviceModel) {
  this.platform = platform;
  this.deviceId = deviceId;
  this.gateway = platform.findGatewayByDevice(this.deviceId);
  this.accessories = [];
  this.accessories[0] = new AccessoryManager(
    platform,
    deviceId + "-L",
    Accessory.Categories.LIGHTBULB,
    Service.Lightbulb,
    new SwitchCommander(this.platform, this.deviceId, deviceModel, 'channel_0')
  );
};

MiAqaraSwitch.prototype.processDeviceReportEvent = function (event, gatewayIp) {
  var report = JSON.parse(event['data']);

  // channel_0 has 3 states: on, off, unknown.
  if (report['channel_0'] === 'unknown') {
    this.platform.log.warn("ignore unknown state: %s:%s.", event['model'], this.deviceId);
    return;
  }

  this.accessories[0].updateState(report["channel_0"]);
};

module.exports = function (accessory, platformAccessory, service, characteristic, uuid) {
  Accessory = accessory;
  PlatformAccessory = platformAccessory;
  Service = service;
  Characteristic = characteristic;
  UUID = uuid;

  AccessoryManager = require("../accessory/manager")(Accessory, PlatformAccessory, Service, Characteristic, UUID);

  return MiAqaraSwitch;
};

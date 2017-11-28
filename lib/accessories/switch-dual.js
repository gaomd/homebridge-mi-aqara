"use strict";

var SwitchCommander = require("../helpers/switch-commander");
var Accessory, PlatformAccessory, Service, Characteristic, UUID;
var AccessoryManager;

var MiAqaraDualSwitch = function (platform, deviceId, deviceModel) {
  this.platform = platform;
  this.deviceId = deviceId;
  this.gateway = platform.findGatewayByDevice(this.deviceId);
  this.accessories = [];
  this.accessories[0] = new AccessoryManager(
    platform,
    deviceId + "-L",
    Accessory.Categories.LIGHTBULB,
    Service.Lightbulb,
    Characteristic.On,
    new SwitchCommander(this.platform, this.deviceId, deviceModel, 'channel_0')
  );
  this.accessories[1] = new AccessoryManager(
    platform,
    deviceId + "-R",
    Accessory.Categories.LIGHTBULB,
    Service.Lightbulb,
    Characteristic.On,
    new SwitchCommander(this.platform, this.deviceId, deviceModel, 'channel_1')
  );
};

MiAqaraDualSwitch.prototype.processDeviceReportEvent = function (event, gatewayIp) {
  var report = JSON.parse(event['data']);

  // channel_0/1 has 3 states: on, off, unknown.
  if (report['channel_0'] === 'unknown' || report["channel_1"] === "unknown") {
    this.platform.log.warn("ignore unknown state: %s:%s.", event['model'], this.deviceId);
    return;
  }

  if (report["channel_0"]) {
    this.accessories[0].setValueAndPushStateToHomeKitAccessory(report["channel_0"] === "on");
  }

  if (report["channel_1"]) {
    this.accessories[1].setValueAndPushStateToHomeKitAccessory(report["channel_1"] === "on");
  }
};

module.exports = function (accessory, platformAccessory, service, characteristic, uuid) {
  Accessory = accessory;
  PlatformAccessory = platformAccessory;
  Service = service;
  Characteristic = characteristic;
  UUID = uuid;

  AccessoryManager = require("../helpers/accessory-manager")(Accessory, PlatformAccessory, Service, Characteristic, UUID);

  return MiAqaraDualSwitch;
};

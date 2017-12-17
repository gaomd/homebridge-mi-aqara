"use strict";

var SwitchCommander = require("../helpers/switch-commander");
var Accessory, PlatformAccessory, Service, Characteristic, UUID;
var AccessoryManager;

var MiAqaraDualSwitch = function (platform, deviceId, deviceModel) {
  this.platform = platform;
  this.subDeviceId = deviceId;
  this.accessories = [];
  this.accessories[0] = new AccessoryManager(
    platform,
    deviceId + "-L",
    Accessory.Categories.LIGHTBULB,
    Service.Lightbulb,
    Characteristic.On,
    new SwitchCommander(this.platform, this.subDeviceId, deviceModel, 'channel_0')
  );
  this.accessories[1] = new AccessoryManager(
    platform,
    deviceId + "-R",
    Accessory.Categories.LIGHTBULB,
    Service.Lightbulb,
    Characteristic.On,
    new SwitchCommander(this.platform, this.subDeviceId, deviceModel, 'channel_1')
  );
};

MiAqaraDualSwitch.prototype.processDeviceReportEvent = function (report) {
  // channel_0/1 has 3 states: on, off, unknown.
  if (report['channel_0'] === 'unknown' || report["channel_1"] === "unknown") {
    // TODO broken? this.platform.log.warn("ignore unknown state: %s:%s.", report['model'], this.subDeviceId);
    return;
  }

  if (report["channel_0"]) {
    this.accessories[0].updateCharacteristic(report["channel_0"] === "on");
  }

  if (report["channel_1"]) {
    this.accessories[1].updateCharacteristic(report["channel_1"] === "on");
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

"use strict";

var SwitchCommander = require("../helpers/switch-commander");
var Accessory, PlatformAccessory, Service, Characteristic, UUID;
var AccessoryManager;

var MiAqaraSwitch = function (platform, deviceId, deviceModel) {
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
};

MiAqaraSwitch.prototype.processDeviceReportEvent = function (report) {
  // channel_0 has 3 states: on, off, unknown.
  if (report['channel_0'] === 'unknown') {
    // TODO broken? this.platform.log.warn("ignore unknown state: %s:%s.", report['model'], this.subDeviceId);
    return;
  }

  this.accessories[0].updateCharacteristic(report["channel_0"] === "on");
};

module.exports = function (accessory, platformAccessory, service, characteristic, uuid) {
  Accessory = accessory;
  PlatformAccessory = platformAccessory;
  Service = service;
  Characteristic = characteristic;
  UUID = uuid;

  AccessoryManager = require("../helpers/accessory-manager")(Accessory, PlatformAccessory, Service, Characteristic, UUID);

  return MiAqaraSwitch;
};

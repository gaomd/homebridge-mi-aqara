"use strict";

var SwitchCommander = require("../helpers/switch-commander");
var Accessory, PlatformAccessory, Service, Characteristic, UUID;
var AccessoryManager;

var MiAqaraOutlet = function (platform, deviceId, deviceModel) {
  this.platform = platform;
  this.subDeviceId = deviceId;
  this.accessories = [];
  this.accessories[0] = new AccessoryManager(
    platform,
    deviceId,
    Accessory.Categories.OUTLET,
    Service.Outlet,
    Characteristic.On,
    new SwitchCommander(this.platform, this.subDeviceId, deviceModel, 'status')
  );
};

MiAqaraOutlet.prototype.processDeviceReportEvent = function (report) {
  // channel_0 has 3 states: on, off, unknown.
  if (report['status'] === 'unknown') {
    // TODO broken? this.platform.log.warn("ignore unknown state: %s:%s.", report['model'], this.subDeviceId);
    return;
  }

  this.accessories[0].updateCharacteristic(report["status"] === "on");
};

module.exports = function (accessory, platformAccessory, service, characteristic, uuid) {
  Accessory = accessory;
  PlatformAccessory = platformAccessory;
  Service = service;
  Characteristic = characteristic;
  UUID = uuid;

  AccessoryManager = require("../helpers/accessory-manager")(Accessory, PlatformAccessory, Service, Characteristic, UUID);

  return MiAqaraOutlet;
};

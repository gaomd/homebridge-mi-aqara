"use strict";

let SwitchCommander = require("../helpers/switch-commander");
let Accessory, PlatformAccessory, Service, Characteristic, UUID;
let AccessoryManager;

module.exports = function (accessory, platformAccessory, service, characteristic, uuid) {
  Accessory = accessory;
  PlatformAccessory = platformAccessory;
  Service = service;
  Characteristic = characteristic;
  UUID = uuid;
  AccessoryManager = require("../helpers/accessory-manager")(Accessory, PlatformAccessory, Service, Characteristic, UUID);

  return MiAqaraOutlet;
};

function MiAqaraOutlet(platform, subDeviceId, subDeviceModel) {
  this.platform = platform;
  this.subDeviceId = subDeviceId;
  this.accessory = new AccessoryManager(
    platform,
    subDeviceId,
    Accessory.Categories.OUTLET,
    Service.Outlet,
    Characteristic.On,
    new SwitchCommander(this.platform, this.subDeviceId, subDeviceModel, 'status')
  );
}

MiAqaraOutlet.prototype.processSubDeviceStateReport = function (report) {
  // channel_0 has 3 states: on, off, unknown.
  if (report['status'] === 'unknown') {
    // TODO broken? this.platform.log.warn("ignore unknown state: %s:%s.", report['model'], this.subDeviceId);
    return;
  }

  this.accessory.updateState(report["status"] === "on");
};

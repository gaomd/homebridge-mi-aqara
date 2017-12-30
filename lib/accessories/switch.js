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

  return MiAqaraSwitch;
};

function MiAqaraSwitch(platform, subDeviceId, subDeviceModel) {
  this.platform = platform;
  this.subDeviceId = subDeviceId;
  this.accessory = new AccessoryManager(
    platform,
    subDeviceId + "-L",
    Accessory.Categories.LIGHTBULB,
    Service.Lightbulb,
    Characteristic.On,
    new SwitchCommander(this.platform, this.subDeviceId, subDeviceModel, 'channel_0')
  );
}

MiAqaraSwitch.prototype.processSubDeviceStateReport = function (report) {
  // channel_0 has 3 states: on, off, unknown.
  if (report['channel_0'] === 'unknown') {
    this.platform.log.error(`Received unknown sub device state ${report['model']} ${this.subDeviceId}`);
    return;
  }

  this.accessory.updateState(report["channel_0"] === "on");
};

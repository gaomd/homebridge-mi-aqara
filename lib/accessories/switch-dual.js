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

  return MiAqaraDualSwitch;
};

function MiAqaraDualSwitch(platform, subDeviceId, subDeviceModel) {
  this.platform = platform;
  this.subDeviceId = subDeviceId;
  this.leftSideAccessory = new AccessoryManager(
    platform,
    subDeviceId + "-L",
    Accessory.Categories.LIGHTBULB,
    Service.Lightbulb,
    Characteristic.On,
    new SwitchCommander(this.platform, this.subDeviceId, subDeviceModel, 'channel_0')
  );
  this.rightSideAccessory = new AccessoryManager(
    platform,
    subDeviceId + "-R",
    Accessory.Categories.LIGHTBULB,
    Service.Lightbulb,
    Characteristic.On,
    new SwitchCommander(this.platform, this.subDeviceId, subDeviceModel, 'channel_1')
  );
}

MiAqaraDualSwitch.prototype.processSubDeviceStateReport = function (report) {
  this.platform.log.debug('Processing Sub Device State Report:');
  this.platform.log.debug(report);
  // channel_0/1 has 3 states: on, off, unknown.
  if (report['channel_0'] === 'unknown' || report["channel_1"] === "unknown") {
    this.platform.log.error(`Received unknown sub device state ${this.subDeviceModel} ${this.subDeviceId}`);
    return;
  }

  if (report["channel_0"]) {
    this.leftSideAccessory.updateState(report["channel_0"] === "on");
  }

  if (report["channel_1"]) {
    this.rightSideAccessory.updateState(report["channel_1"] === "on");
  }
};

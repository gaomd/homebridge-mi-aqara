"use strict";

let Accessory, PlatformAccessory, Service, Characteristic, UUID;
let AccessoryManager;

module.exports = function (accessory, platformAccessory, service, characteristic, uuid) {
  Accessory = accessory;
  PlatformAccessory = platformAccessory;
  Service = service;
  Characteristic = characteristic;
  UUID = uuid;
  AccessoryManager = require("../helpers/accessory-manager")(Accessory, PlatformAccessory, Service, Characteristic, UUID);

  return TempHumSensor;
};

function TempHumSensor(platform, subDeviceId, subDeviceModel) {
  this.platform = platform;
  this.subDeviceId = subDeviceId;
  this.accessories = [];
  this.accessories[0] = new AccessoryManager(
    platform,
    subDeviceId + "-TEMP",
    Accessory.Categories.SENSOR,
    Service.TemperatureSensor,
    Characteristic.CurrentTemperature,
    null
  );
  this.accessories[1] = new AccessoryManager(
    platform,
    subDeviceId + "-HUM",
    Accessory.Categories.SENSOR,
    Service.HumiditySensor,
    Characteristic.CurrentRelativeHumidity,
    null
  );
}

TempHumSensor.prototype.processSubDeviceStateReport = function (report) {
  const temperature = report['temperature'] / 100.0;
  const humidity = report['humidity'] / 100.0;

  this.accessories[0].updateState(temperature);
  this.accessories[1].updateState(humidity);
};

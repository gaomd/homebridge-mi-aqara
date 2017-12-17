"use strict";

var SwitchCommander = require("../helpers/switch-commander");
var Accessory, PlatformAccessory, Service, Characteristic, UUID;
var AccessoryManager;

var TempHumSensor = function (platform, deviceId, deviceModel) {
  this.platform = platform;
  this.subDeviceId = deviceId;
  this.accessories = [];
  this.accessories[0] = new AccessoryManager(
    platform,
    deviceId + "-TEMP",
    Accessory.Categories.SENSOR,
    Service.TemperatureSensor,
    Characteristic.CurrentTemperature,
    null
  );
  this.accessories[1] = new AccessoryManager(
    platform,
    deviceId + "-HUM",
    Accessory.Categories.SENSOR,
    Service.HumiditySensor,
    Characteristic.CurrentRelativeHumidity,
    null
  );
};

TempHumSensor.prototype.processDeviceReportEvent = function (report) {
  const temperature = report['temperature'] / 100.0;
  const humidity = report['humidity'] / 100.0;

  this.accessories[0].updateCharacteristic(temperature);
  this.accessories[1].updateCharacteristic(humidity);
};

module.exports = function (accessory, platformAccessory, service, characteristic, uuid) {
  Accessory = accessory;
  PlatformAccessory = platformAccessory;
  Service = service;
  Characteristic = characteristic;
  UUID = uuid;

  AccessoryManager = require("../helpers/accessory-manager")(Accessory, PlatformAccessory, Service, Characteristic, UUID);

  return TempHumSensor;
};

"use strict";

var SwitchCommander = require("../commanders/switch-commander");
var Accessory, PlatformAccessory, Service, Characteristic, UUID;
var AccessoryManager;

var TempHumSensor = function (platform, deviceId, deviceModel) {
  this.platform = platform;
  this.deviceId = deviceId;
  this.gateway = platform.findGatewayByDevice(this.deviceId);
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

TempHumSensor.prototype.processDeviceReportEvent = function (event, gatewayIp) {
  var report = JSON.parse(event['data']);
  var temperature = report['temperature'] / 100.0;
  var humidity = report['humidity'] / 100.0;

  this.accessories[0].setValueAndPushStateToHomeKitAccessory(temperature);
  this.accessories[1].setValueAndPushStateToHomeKitAccessory(humidity);
};

module.exports = function (accessory, platformAccessory, service, characteristic, uuid) {
  Accessory = accessory;
  PlatformAccessory = platformAccessory;
  Service = service;
  Characteristic = characteristic;
  UUID = uuid;

  AccessoryManager = require("../accessory/manager")(Accessory, PlatformAccessory, Service, Characteristic, UUID);

  return TempHumSensor;
};

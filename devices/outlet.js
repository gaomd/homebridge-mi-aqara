"use strict";

var SwitchCommander = require("../commanders/switch-commander");
var Accessory, PlatformAccessory, Service, Characteristic, UUID;
var AccessoryManager;

var MiAqaraOutlet = function (platform, deviceId, deviceModel) {
  this.platform = platform;
  this.deviceId = deviceId;
  this.gateway = platform.findGatewayByDevice(this.deviceId);
  this.accessories = [];
  this.accessories[0] = new AccessoryManager(
    platform,
    deviceId,
    Accessory.Categories.OUTLET,
    Service.Outlet,
    Characteristic.On,
    new SwitchCommander(this.platform, this.deviceId, deviceModel, 'status')
  );
};

MiAqaraOutlet.prototype.processDeviceReportEvent = function (event, gatewayIp) {
  var report = JSON.parse(event['data']);

  // channel_0 has 3 states: on, off, unknown.
  if (report['status'] === 'unknown') {
    this.platform.log.warn("ignore unknown state: %s:%s.", event['model'], this.deviceId);
    return;
  }

  this.accessories[0].setValueAndPushStateToHomeKitAccessory(report["status"] === "on");
};

module.exports = function (accessory, platformAccessory, service, characteristic, uuid) {
  Accessory = accessory;
  PlatformAccessory = platformAccessory;
  Service = service;
  Characteristic = characteristic;
  UUID = uuid;

  AccessoryManager = require("../accessory/manager")(Accessory, PlatformAccessory, Service, Characteristic, UUID);

  return MiAqaraOutlet;
};

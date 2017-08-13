"use strict";

var SwitchCommander = require("../commanders/switch-commander");
var Accessory, PlatformAccessory, Service, Characteristic, UUID;

var MiAqaraOutlet = function (platform, deviceId, deviceModel) {
  this.platform = platform;
  this.deviceId = deviceId;
  this.gateway = platform.findGatewayByDevice(this.deviceId);
  this.commander = new SwitchCommander(this.platform, this.deviceId, deviceModel, 'status');
  this.accessoryCategory = Accessory.Categories.OUTLET;
  this.accessoryServiceType = Service.Outlet;
  this.accessoryCharacteristicType = Characteristic.On;
  this.accessory = this.platform.registerHomeKitAccessory(
    this.deviceId,
    this.getAccessoryDisplayName(this.deviceId),
    this.getAccessoryUUID(this.deviceId),
    this.accessoryCategory,
    this.accessoryServiceType,
    this.accessoryCharacteristicType
  );

  var characteristic = this.accessory.getService(this.accessoryServiceType).getCharacteristic(this.accessoryCharacteristicType);
  characteristic.on("set", this.homeKitSetEventListener.bind(this));

  this.platform.log("Initialized:", this.getAccessoryDisplayName(this.deviceId));
};

MiAqaraOutlet.prototype.processDeviceReportEvent = function (event, gatewayIp) {
  var report = JSON.parse(event['data']);

  // channel_0 has 3 states: on, off, unknown.
  if (report['status'] === 'unknown') {
    this.platform.log.warn("ignore unknown state: %s:%s.", event['model'], this.deviceId);
    return;
  }

  this.updateState(report["status"]);
};

MiAqaraOutlet.prototype.updateState = function (value) {
  this.commander.setCurrentValue((value === 'on'));
  var state = this.accessory.getService(this.accessoryServiceType).getCharacteristic(this.accessoryCharacteristicType);
  state.updateValue(this.commander.currentValue === 'on');
};

MiAqaraOutlet.prototype.homeKitSetEventListener = function (value, homeKitCallback) {
  this.commander.updateState(value);
  homeKitCallback();
};

MiAqaraOutlet.prototype.getAccessoryDisplayName = function (accessoryId) {
  if (this.platform.deviceOverrides[accessoryId] && this.platform.deviceOverrides[accessoryId].name) {
    return this.platform.deviceOverrides[accessoryId].name;
  }

  return accessoryId;
};

MiAqaraOutlet.prototype.getAccessoryUUID = function (accessoryId) {
  return UUID.generate(accessoryId);
};

module.exports = function (accessory, platformAccessory, service, characteristic, uuid) {
  Accessory = accessory;
  PlatformAccessory = platformAccessory;
  Service = service;
  Characteristic = characteristic;
  UUID = uuid;

  return MiAqaraOutlet;
};

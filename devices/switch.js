"use strict";

var SwitchCommander = require("../commanders/switch-commander");
var Accessory, PlatformAccessory, Service, Characteristic, UUID;

var MiAqaraSwitch = function (platform, deviceId, deviceModel) {
  this.platform = platform;
  this.deviceId = deviceId;
  this.gateway = platform.findGatewayByDevice(this.deviceId);
  this.commander = new SwitchCommander(this.platform, this.deviceId, deviceModel, 'channel_0');
  // this.accessoryCategory = Accessory.Categories.FAN;
  // this.accessoryServiceType = Service.Fan;
  this.accessoryCategory = Accessory.Categories.LIGHTBULB;
  this.accessoryServiceType = Service.Lightbulb;
  this.accessoryCharacteristicType = Characteristic.On;
  this.accessory = this.platform.registerHomeKitAccessory(
    this.deviceId,
    this.getAccessoryDisplayName(this.deviceId) + "-L",
    this.getAccessoryUUID(this.deviceId + "-L"),
    this.accessoryCategory,
    this.accessoryServiceType,
    this.accessoryCharacteristicType
  );

  var characteristic = this.accessory.getService(this.accessoryServiceType).getCharacteristic(this.accessoryCharacteristicType);
  characteristic.on("set", this.homeKitSetEventListener.bind(this));

  this.platform.log("Initialized:", this.getAccessoryDisplayName(this.deviceId + "-L"));
};

MiAqaraSwitch.prototype.processDeviceReportEvent = function (event, gatewayIp) {
  var report = JSON.parse(event['data']);

  // channel_0 has 3 states: on, off, unknown.
  if (report['channel_0'] === 'unknown') {
    this.platform.log.warn("ignore unknown state: %s:%s.", event['model'], this.deviceId);
    return;
  }

  this.updateState(report["channel_0"]);
};

MiAqaraSwitch.prototype.updateState = function (value) {
  this.commander.setCurrentValue((value === 'on'));
  var state = this.accessory.getService(this.accessoryServiceType).getCharacteristic(this.accessoryCharacteristicType);
  state.updateValue(this.commander.currentValue === 'on');
};

MiAqaraSwitch.prototype.homeKitSetEventListener = function (value, homeKitCallback) {
  this.commander.updateState(value);
  homeKitCallback();
};

MiAqaraSwitch.prototype.getAccessoryDisplayName = function (accessoryId) {
  if (this.platform.deviceOverrides[accessoryId] && this.platform.deviceOverrides[accessoryId].name) {
    return this.platform.deviceOverrides[accessoryId].name;
  }

  return accessoryId;
};

MiAqaraSwitch.prototype.getAccessoryUUID = function (accessoryId) {
  return UUID.generate(accessoryId);
};

module.exports = function (accessory, platformAccessory, service, characteristic, uuid) {
  Accessory = accessory;
  PlatformAccessory = platformAccessory;
  Service = service;
  Characteristic = characteristic;
  UUID = uuid;

  return MiAqaraSwitch;
};

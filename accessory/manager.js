"use strict";

var Accessory, PlatformAccessory, Service, Characteristic, UUID;

var AccessoryManager = function (platform, accessoryId, accessoryCategory, accessoryServiceType, accessoryCharacteristicType, switchCommander) {
  this.platform = platform;
  this.accessoryId = accessoryId;
  this.commander = switchCommander;
  this.accessoryCategory = accessoryCategory;
  this.accessoryServiceType = accessoryServiceType;
  this.accessoryCharacteristicType = accessoryCharacteristicType;
  this.accessory = this.platform.registerHomeKitAccessory(
    this.accessoryId,
    this.getAccessoryDisplayName(),
    this.getAccessoryUUID(),
    this.accessoryCategory,
    this.accessoryServiceType,
    this.accessoryCharacteristicType
  );

  var characteristic = this.accessory.getService(this.accessoryServiceType).getCharacteristic(this.accessoryCharacteristicType);
  characteristic.on("set", this.homeKitSetEventListener.bind(this));

  this.platform.log("Initialized accessory:", this.getAccessoryDisplayName());
};

AccessoryManager.prototype.setValueAndPushStateToHomeKitAccessory = function (value) {
  var state = this.accessory.getService(this.accessoryServiceType).getCharacteristic(this.accessoryCharacteristicType);
  state.updateValue(value);
};

AccessoryManager.prototype.pushHomeKitAccessoryStateChangeToGatewayDevice = function(value) {
  if (this.commander) {
    // 1. blindly send target state to the device under gateway
    this.commander.sendTargetState(value);

    // 2. and ignore write_ack state
  }
};

AccessoryManager.prototype.homeKitSetEventListener = function (value, homeKitCallback) {
  this.pushHomeKitAccessoryStateChangeToGatewayDevice(value);
  homeKitCallback();
};

AccessoryManager.prototype.getAccessoryDisplayName = function () {
  if (this.platform.deviceOverrides[this.accessoryId] && this.platform.deviceOverrides[this.accessoryId].name) {
    return this.platform.deviceOverrides[this.accessoryId].name;
  }

  return this.accessoryId;
};

AccessoryManager.prototype.getAccessoryUUID = function () {
  return UUID.generate(this.accessoryId);
};

module.exports = function (accessory, platformAccessory, service, characteristic, uuid) {
  Accessory = accessory;
  PlatformAccessory = platformAccessory;
  Service = service;
  Characteristic = characteristic;
  UUID = uuid;

  return AccessoryManager;
};

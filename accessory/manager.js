"use strict";

var Accessory, PlatformAccessory, Service, Characteristic, UUID;

var AccessoryManager = function (platform, accessoryId, category, serviceType, switchCommander) {
  this.platform = platform;
  this.accessoryId = accessoryId;
  this.commander = switchCommander;
  this.accessoryCategory = category;
  this.accessoryServiceType = serviceType;
  this.accessoryCharacteristicType = Characteristic.On;
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

AccessoryManager.prototype.updateState = function (value) {
  this.commander.setCurrentValue((value === 'on'));
  var state = this.accessory.getService(this.accessoryServiceType).getCharacteristic(this.accessoryCharacteristicType);
  state.updateValue(this.commander.currentValue === 'on');
};

AccessoryManager.prototype.homeKitSetEventListener = function (value, homeKitCallback) {
  this.commander.updateState(value);
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

"use strict";

let Accessory, PlatformAccessory, Service, Characteristic, UUIDGen;

function AccessoryManager(platform, accessoryId, accessoryCategory, serviceType, characteristicType, switchCommander) {
  this.platform = platform;
  this.accessoryId = accessoryId;
  this.commander = switchCommander;
  this.accessoryCategory = accessoryCategory;
  this.serviceType = serviceType;
  this.characteristicType = characteristicType;
  this.accessory = null;
  this.currentCharacteristicValue = null;

  this.initializeAccessory();
  this.platform.log("Accessory initialized: ${this.getAccessoryAndServiceName()}");

  this.registerAccessory();
  this.platform.log("Accessory registered: ${this.getAccessoryAndServiceName()}");
}

AccessoryManager.prototype.getHumanReadableAccessoryType = function (accessoryType) {
  switch (accessoryType) {
    case Service.Lightbulb:
      return "(Light) Switch";
    case Service.Outlet:
      return "Outlet";
    case Service.TemperatureSensor:
      return "Temperature Sensor";
    case Service.HumiditySensor:
      return "Humidity Sensor";
    default:
      return "Unknown";
  }
};

AccessoryManager.prototype.initializeAccessory = function () {
  if (this.accessory) {
    throw new Error('Accessory already created.');
  }

  if (this.platform.accessories[this.getAccessoryUuid()]) {
    this.accessory = this.platform.accessories[this.getAccessoryUuid()];
  } else {
    this.accessory = new PlatformAccessory(this.getAccessoryAndServiceName(), this.getAccessoryUuid(), this.accessoryCategory);
    this.accessory.reachable = true;
    this.accessory.getService(Service.AccessoryInformation)
      .setCharacteristic(Characteristic.Manufacturer, "Mi Aqara")
      .setCharacteristic(Characteristic.Model, this.getHumanReadableAccessoryType(this.serviceType))
      .setCharacteristic(Characteristic.SerialNumber, this.accessoryId);
    this.accessory.addService(this.serviceType, this.getAccessoryAndServiceName());

    this.accessory.on('identify', function (paired, callback) {
      this.platform.log('Accessory identified: ${accessory.displayName}');
      callback();
    }.bind(this));

    const characteristic = this.accessory.getService(this.serviceType).getCharacteristic(this.characteristicType);
    if (![Characteristic.CurrentRelativeHumidity, Characteristic.CurrentTemperature].includes[this.characteristicType]) {
      characteristic.on("set", this.onCharacteristicSet.bind(this));
    }
    characteristic.on("get", this.onCharacteristicGet.bind(this));
  }
};

AccessoryManager.prototype.registerAccessory = function () {
  if (!this.platform.accessories[this.getAccessoryUuid()]) {
    this.platform.api.registerPlatformAccessories("homebridge-mi-aqara", "MiAqara", [this.accessory]);
    this.platform.accessories[this.getAccessoryUuid()] = this.accessory;
  }
};

AccessoryManager.prototype.updateCharacteristic = function (value) {
  this.currentCharacteristicValue = value;
  const characteristic = this.accessory.getService(this.serviceType).getCharacteristic(this.characteristicType);
  characteristic.updateValue(value);
};

AccessoryManager.prototype.onCharacteristicSet = function (value, callback) {
  if (this.commander) {
    // 1. blindly send target state to the sub device under gateway
    this.commander.sendTargetState(value);

    // 2. and ignore write_ack state
  }

  callback();
};

AccessoryManager.prototype.onCharacteristicGet = function (callback) {
  callback(null, this.currentCharacteristicValue || 0);
};

AccessoryManager.prototype.getAccessoryAndServiceName = function () {
  if (this.platform.subDeviceOverrides[this.accessoryId] && this.platform.subDeviceOverrides[this.accessoryId].name) {
    return this.platform.subDeviceOverrides[this.accessoryId].name;
  }

  return this.accessoryId;
};

AccessoryManager.prototype.getAccessoryUuid = function () {
  return UUIDGen.generate(this.accessoryId);
};

module.exports = function (accessory, platformAccessory, service, characteristic, uuid) {
  Accessory = accessory;
  PlatformAccessory = platformAccessory;
  Service = service;
  Characteristic = characteristic;
  UUIDGen = uuid;

  return AccessoryManager;
};

"use strict";

let Accessory, PlatformAccessory, Service, Characteristic, UUIDGen;

module.exports = function (accessory, platformAccessory, service, characteristic, uuid) {
  Accessory = accessory;
  PlatformAccessory = platformAccessory;
  Service = service;
  Characteristic = characteristic;
  UUIDGen = uuid;

  return AccessoryManager;
};

function AccessoryManager(platform, accessoryId, accessoryCategory, serviceType, characteristicType, switchCommander) {
  this.platform = platform;
  // Accessory ID == Sub Device ID + Button ID
  this.accessoryId = accessoryId;
  this.accessoryCategory = accessoryCategory;
  this.serviceType = serviceType;
  this.characteristicType = characteristicType;
  this.commander = switchCommander;
  this.accessory = null;
  this.currentState = null;

  this.initializeAccessory();
  this.registerAccessory();
}

AccessoryManager.prototype.getReadableModelByServiceType = function (serviceType) {
  switch (serviceType) {
    case Service.Switch:
      return 'Switch';
    case Service.Lightbulb:
      return "Light";
    case Service.Outlet:
      return "Outlet";
    case Service.TemperatureSensor:
      return "Temperature Sensor";
    case Service.HumiditySensor:
      return "Humidity Sensor";
    default:
      this.platform.error(`Unknown Service Type: ${serviceType}`);
      return "Unknown";
  }
};

AccessoryManager.prototype.initializeAccessory = function () {
  if (this.accessory) {
    this.platform.error(`Accessory already initialized and listeners were attached: ${this.accessory.displayName}`);
  }

  if (this.platform.hasAccessory(this.getAccessoryUuid())) {
    this.accessory = this.platform.registeredAccessories[this.getAccessoryUuid()];
    this.platform.log(`Accessory already initialized (from cache): ${this.accessory.displayName}`);
  } else {
    this.accessory = new PlatformAccessory(this.getAccessoryServiceName(), this.getAccessoryUuid(), this.accessoryCategory);
    this.accessory.reachable = true;
    this.accessory.getService(Service.AccessoryInformation)
      .setCharacteristic(Characteristic.Manufacturer, "Mi Aqara")
      .setCharacteristic(Characteristic.Model, this.getReadableModelByServiceType(this.serviceType))
      .setCharacteristic(Characteristic.SerialNumber, this.accessoryId);
    this.accessory.on('identify', function (paired, callback) {
      this.platform.log(`Accessory identification: ${this.accessory.displayName}`);
      callback();
    }.bind(this));
  }

  let service = this.accessory.getService(this.serviceType);
  if (!service) {
    service = this.accessory.addService(this.serviceType, this.getAccessoryServiceName());
  }

  let state = service.getCharacteristic(this.characteristicType);
  if (!state) {
    this.platform.error('Could not get service characteristic');
  }

  if (!state.listeners('get').length) {
    state.on("get", this.onGetState.bind(this));
  }

  // Sensors don't have commander
  if (!state.listeners('set').length && this.commander) {
    state.on("set", this.onSetState.bind(this));
  }

  this.platform.log(`Accessory properly (re-)initialized: ${this.accessory.displayName}`);
};

AccessoryManager.prototype.registerAccessory = function () {
  if (!this.platform.hasAccessory(this.getAccessoryUuid())) {
    this.platform.api.registerPlatformAccessories("homebridge-mi-aqara", "MiAqara", [this.accessory]);
    this.platform.registeredAccessories[this.getAccessoryUuid()] = this.accessory;
    this.platform.log(`Accessory registered: ${this.getAccessoryServiceName()}`);
  }
};

AccessoryManager.prototype.updateState = function (value) {
  this.currentState = value;
  const characteristic = this.accessory.getService(this.serviceType).getCharacteristic(this.characteristicType);
  characteristic.updateValue(value);
};

AccessoryManager.prototype.onSetState = function (value, callback) {
  this.platform.log.debug(`HomeKit wants to change state of ${this.accessory.displayName}`);

  if (!this.commander) {
    return callback();
  }

  // Tell gateway sub device we want the desired state
  let result = this.commander.setSubDeviceState(value);

  if (result instanceof Error) {
    this.platform.log.error(result);
    return callback(result);
  }

  // TODO: should wait for the write_ack message
  callback();
};

AccessoryManager.prototype.onGetState = function (callback) {
  this.platform.log.debug(`HomeKit wants to know state of ${this.accessory.displayName}`);
  callback(null, this.currentState || false);
};

AccessoryManager.prototype.getAccessoryServiceName = function () {
  if (this.platform.subDeviceOverrides[this.accessoryId] && this.platform.subDeviceOverrides[this.accessoryId].name) {
    return this.platform.subDeviceOverrides[this.accessoryId].name;
  }

  return this.accessoryId;
};

AccessoryManager.prototype.getAccessoryUuid = function () {
  return UUIDGen.generate(this.accessoryId);
};

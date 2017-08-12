var Accessory, PlatformAccessory, Service, Characteristic, UUIDGen, Factory;

module.exports = function (homebridge) {
  Accessory = homebridge.hap.Accessory;
  PlatformAccessory = homebridge.platformAccessory;

  // Service and Characteristic are from hap-nodejs
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;
  UUIDGen = homebridge.hap.uuid;

  return MiAqaraAccessories;
};

function MiAqaraAccessories(log, api) {
  this.log = log;
  this.api = api;
  this.accessories = [];
  this.deviceToGatewayId = {};
  this.lastGatewayUpdateTime = {};
  this.lastDeviceUpdateTime = {};
  this.deviceAliases = {};
}

// Function invoked when homebridge tries to restore cached accessory
// Developer can configure accessory at here (like setup event handler)
// Update current value
MiAqaraAccessories.prototype.configureAccessory = function (accessory) {
  // this.log(accessory.displayName, "Configure Accessory");
  var that = this;

  // set the accessory to reachable if plugin can currently process the accessory
  // otherwise set to false and update the reachability later by invoking
  // accessory.updateReachability()
  accessory.reachable = true;
  accessory.on('identify', function (paired, callback) {
    that.log(accessory.displayName, "Identify!!!");
    callback();
  });

  this.accessories.push(accessory);
  this.lastDeviceUpdateTime[accessory.UUID] = Date.now();
};

// How long in milliseconds we can remove an accessory when there's no update.
// This is a little complicated:
// First, we need to make sure gateway is online, if the gateway is offline, we do nothing.
// Then, we measure the delta since last update time, if it's too long, remove it.
MiAqaraAccessories.prototype.removeDisconnectedAccessory = function () {
  const deviceAutoRemoveDelta = 3600 * 1000;
  const gatewayAutoRemoveDelta = 24 * 3600 * 1000;
  var accessoriesToRemove = [];

  for (var i = this.accessories.length - 1; i--;) {
    var accessory = this.accessories[i];
    var gatewayId = this.deviceToGatewayId[accessory.UUID];
    var lastTime = this.lastDeviceUpdateTime[accessory.UUID];
    var removeFromGateway = gatewayId && ((this.lastGatewayUpdateTime[gatewayId] - lastTime) > deviceAutoRemoveDelta);

    if (removeFromGateway || (Date.now() - lastTime) > gatewayAutoRemoveDelta) {
      this.log.debug("remove accessory %s", accessory.UUID);
      accessoriesToRemove.push(accessory);
      this.accessories.splice(i, 1);
    }
  }

  if (accessoriesToRemove.length > 0) {
    this.api.unregisterPlatformAccessories("homebridge-mi-aqara", "MiAqara", accessoriesToRemove);
  }
};

MiAqaraAccessories.prototype.updateTemperatureAndHumidity = function (gatewayId, deviceId, temperature, humidity) {
  // Temperature
  this.findServiceAndDeviceValue(
    gatewayId,
    deviceId,
    this.getAccessoryName('SENSOR_TEM-' + deviceId),
    UUIDGen.generate('SENSOR_TEM-' + deviceId),
    Accessory.Categories.SENSOR,
    Service.TemperatureSensor,
    Characteristic.CurrentTemperature,
    temperature,
    null); // No commander

  // Humidity
  this.findServiceAndDeviceValue(
    gatewayId,
    deviceId,
    this.getAccessoryName('SENSOR_HUM-' + deviceId),
    UUIDGen.generate('SENSOR_HUM-' + deviceId),
    Accessory.Categories.SENSOR,
    Service.HumiditySensor,
    Characteristic.CurrentRelativeHumidity,
    humidity,
    null); // No commander
};

// Motion sensor
MiAqaraAccessories.prototype.updateMotion = function (gatewayId, deviceId, motionDetected) {
  this.findServiceAndDeviceValue(
    gatewayId,
    deviceId,
    this.getAccessoryName('SENSOR_MOTION-' + deviceId),
    UUIDGen.generate('SENSOR_MOTION-' + deviceId),
    Accessory.Categories.SENSOR,
    Service.MotionSensor,
    Characteristic.MotionDetected,
    motionDetected,
    null); // No commander
};

// Contact sensor
MiAqaraAccessories.prototype.updateContact = function (gatewayId, deviceId, contacted) {
  this.findServiceAndDeviceValue(
    gatewayId,
    deviceId,
    this.getAccessoryName('SENSOR_CONTACT-' + deviceId),
    UUIDGen.generate('SENSOR_CONTACT-' + deviceId),
    Accessory.Categories.SENSOR,
    Service.ContactSensor,
    Characteristic.ContactSensorState,
    contacted ? Characteristic.ContactSensorState.CONTACT_DETECTED : Characteristic.ContactSensorState.CONTACT_NOT_DETECTED,
    null); // No commander
};

// Light switch
MiAqaraAccessories.prototype.updateLightSwitch = function (gatewayId, deviceId, sideIdentifier, on, commander) {
  if (this.deviceAliases["SWITCH-" + deviceId + "-" + sideIdentifier]
    && this.deviceAliases["SWITCH-" + deviceId + "-" + sideIdentifier].category_override
    && this.deviceAliases["SWITCH-" + deviceId + "-" + sideIdentifier].service_override) {
    this.findServiceAndDeviceValue(
      gatewayId,
      deviceId,
      this.getAccessoryName("SWITCH-" + deviceId + "-" + sideIdentifier),
      UUIDGen.generate("SWITCH-" + deviceId + "-" + sideIdentifier),
      Accessory.Categories["FAN"],
      Service["Fan"],
      Characteristic.On,
      on,
      commander);

    // this.log(this.deviceAliases["SWITCH-" + deviceId + "-" + sideIdentifier].category_override);
    // this.log(Accessory.Categories);
    // this.log(Accessory.Categories["FAN"]);
    // this.log(Accessory.Categories[this.deviceAliases["SWITCH-" + deviceId + "-" + sideIdentifier].category_override]);
    // this.log(Service.Fan);
    // this.log(Service[this.deviceAliases["SWITCH-" + deviceId + "-" + sideIdentifier].service_override]);
    return;
  }

  this.findServiceAndDeviceValue(
    gatewayId,
    deviceId,
    this.getAccessoryName("SWITCH-" + deviceId + "-" + sideIdentifier),
    UUIDGen.generate("SWITCH-" + deviceId + "-" + sideIdentifier),
    Accessory.Categories.LIGHTBULB,
    Service.Lightbulb,
    Characteristic.On,
    on,
    commander);
};

// Plug
MiAqaraAccessories.prototype.updatePlugSwitch = function (gatewayId, deviceId, on, commander) {
  this.findServiceAndDeviceValue(
    gatewayId,
    deviceId,
    this.getAccessoryName("OUTLET-" + deviceId),
    UUIDGen.generate("OUTLET-" + deviceId),
    Accessory.Categories.OUTLET,
    Service.Outlet,
    Characteristic.On,
    on,
    commander);
};

MiAqaraAccessories.prototype.getAccessoryWellKnownName = function (type) {
  switch (type) {
    case Service.Lightbulb:
      return "(Light) Switch";
    case Service.Outlet:
      return "Outlet";
    case Service.TemperatureSensor:
      return "Temperature Sensor";
    case Service.HumiditySensor:
      return "Humidity Sensor";
    case Service.ContactSensor:
      return "Contact Sensor";
    case Service.MotionSensor:
      return "Motion Sensor";
    default:
      return "Unknown";
  }
};

MiAqaraAccessories.prototype.findServiceAndDeviceValue = function (gatewayId, deviceId, accessoryName,
                                                                accessoryUUID, accessoryCategory,
                                                                serviceType,
                                                                characteristicType, characteristicValue,
                                                                commander) {
  this.log("TESTTEST " + accessoryName);
  if (!accessoryName) {
    // Use last four characters of deviceId as service name
    // accessoryName = deviceId.substring(deviceId.length - 4);
  }
  // this.log("TESTTEST " + accessoryName);
  var serviceName = accessoryName;

  // Remember gateway/device update time
  this.lastGatewayUpdateTime[gatewayId] = Date.now();
  this.lastDeviceUpdateTime[accessoryUUID] = Date.now();
  this.deviceToGatewayId[accessoryUUID] = gatewayId;

  var that = this;
  var newAccessory = null;
  var service = null;

  for (var index in this.accessories) {
    var accessory = this.accessories[index];
    if (accessory.UUID === accessoryUUID) {
      newAccessory = accessory;
    }
  }

  if (!newAccessory) {
    newAccessory = new PlatformAccessory(accessoryName, accessoryUUID, accessoryCategory);
    newAccessory.reachable = true;

    // device serial number so we can track it later
    newAccessory.getService(Service.AccessoryInformation)
      .setCharacteristic(Characteristic.Manufacturer, "Aqara")
      .setCharacteristic(Characteristic.Model, this.getAccessoryWellKnownName(serviceType))
      .setCharacteristic(Characteristic.SerialNumber, deviceId);

    service = newAccessory.addService(serviceType, serviceName);
    this.api.registerPlatformAccessories("homebridge-mi-aqara", "MiAqara", [newAccessory]);
    newAccessory.on('identify', function (paired, callback) {
      that.log(newAccessory.displayName, "...Identified");
      callback();
    });

    this.accessories.push(newAccessory);
  } else {
    service = newAccessory.getService(serviceType);
  }

  if (!service) {
    service = newAccessory.addService(serviceType, serviceName);
  }

  var characteristic = service.getCharacteristic(characteristicType);

  if (characteristic) {
    // that.log("device %s %s", serviceName, characteristicValue);
    characteristic.updateValue(characteristicValue);

    // Send command back once value is changed
    if (commander && (characteristic.listeners('set').length == 0)) {
      characteristic.on("set", function (value, callback) {
        commander.send(value);
        callback();
      });
    }
  } else {
    that.log("Service not found");
  }
};

MiAqaraAccessories.prototype.getAccessoryName = function (accessoryId) {
  return this.deviceAliases[accessoryId].name || accessoryId;
};

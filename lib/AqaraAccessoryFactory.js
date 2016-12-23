var Accessory, PlatformAccessory, Service, Characteristic, UUIDGen, Factory;

module.exports = function (homebridge) {
  Accessory = homebridge.hap.Accessory;
  PlatformAccessory = homebridge.platformAccessory;

  // Service and Characteristic are from hap-nodejs
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;
  UUIDGen = homebridge.hap.uuid;

  return AqaraAccessoryFactory;
};

function AqaraAccessoryFactory(log, api) {
  this.log = log;
  this.api = api;
  this.accessories = [];
  this.setIdToHubIdMap = {};
  this.lastHubUpdateTime = {};
  this.lastSetUpdateTime = {};
}

// Function invoked when homebridge tries to restore cached accessory
// Developer can configure accessory at here (like setup event handler)
// Update current value
AqaraAccessoryFactory.prototype.configureAccessory = function (accessory) {
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
  this.lastSetUpdateTime[accessory.UUID] = Date.now();
};

// How long in milliseconds we can remove an accessory when there's no update.
// This is a little complicated:
// First, we need to make sure gateway is online, if the gateway is offline, we do nothing.
// Then, we measure the delta since last update time, if it's too long, remove it.
const SetAutoRemoveDelta = 3600 * 1000;
const HubAutoRemoveDelta = 24 * 3600 * 1000;
AqaraAccessoryFactory.prototype.autoRemoveAccessory = function () {
  var accessoriesToRemove = [];

  for (var i = this.accessories.length - 1; i--;) {
    var accessory = this.accessories[i];
    var hubId = this.setIdToHubIdMap[accessory.UUID];
    var lastTime = this.lastSetUpdateTime[accessory.UUID];
    var removeFromHub = hubId && ((this.lastHubUpdateTime[hubId] - lastTime) > SetAutoRemoveDelta);

    if (removeFromHub || (Date.now() - lastTime) > HubAutoRemoveDelta) {
      this.log.debug("remove accessory %s", accessory.UUID);
      accessoriesToRemove.push(accessory);
      this.accessories.splice(i, 1);
    }
  }

  if (accessoriesToRemove.length > 0) {
    this.api.unregisterPlatformAccessories("homebridge-aqara", "AqaraPlatform", accessoriesToRemove);
  }
};

AqaraAccessoryFactory.prototype.setTemperatureAndHumidity = function (hubId, setId, temperature, humidity) {
  // Temperature
  this.findServiceAndSetValue(
    hubId,
    setId,
    UUIDGen.generate('Tem' + setId),
    Accessory.Categories.SENSOR,
    Service.TemperatureSensor,
    Characteristic.CurrentTemperature,
    temperature,
    null); // No commander

  // Humidity
  this.findServiceAndSetValue(
    hubId,
    setId,
    UUIDGen.generate('Hum' + setId),
    Accessory.Categories.SENSOR,
    Service.HumiditySensor,
    Characteristic.CurrentRelativeHumidity,
    humidity,
    null); // No commander
};

// Motion sensor
AqaraAccessoryFactory.prototype.setMotion = function (hubId, setId, motionDetected) {
  this.findServiceAndSetValue(
    hubId,
    setId,
    UUIDGen.generate('Mot' + setId),
    Accessory.Categories.SENSOR,
    Service.MotionSensor,
    Characteristic.MotionDetected,
    motionDetected,
    null); // No commander
};

// Contact sensor
AqaraAccessoryFactory.prototype.setContact = function (hubId, setId, contacted) {
  this.findServiceAndSetValue(
    hubId,
    setId,
    UUIDGen.generate('Mag' + setId),
    Accessory.Categories.SENSOR,
    Service.ContactSensor,
    Characteristic.ContactSensorState,
    contacted ? Characteristic.ContactSensorState.CONTACT_DETECTED : Characteristic.ContactSensorState.CONTACT_NOT_DETECTED,
    null); // No commander
};

// Light switch
AqaraAccessoryFactory.prototype.setLightSwitch = function (hubId, setId, uuidSeed, on, commander) {
  this.findServiceAndSetValue(
    hubId,
    setId,
    UUIDGen.generate(uuidSeed),
    Accessory.Categories.LIGHTBULB,
    Service.Lightbulb,
    Characteristic.On,
    on,
    commander);
};

// Plug
AqaraAccessoryFactory.prototype.setPlugSwitch = function (hubId, setId, uuidSeed, on, commander) {
  this.findServiceAndSetValue(
    hubId,
    setId,
    UUIDGen.generate(uuidSeed),
    Accessory.Categories.OUTLET,
    Service.Outlet,
    Characteristic.On,
    on,
    commander);
};

AqaraAccessoryFactory.prototype.getAccessoryModel = function (type) {
  switch (type) {
    case Service.Lightbulb:
      return "Light Switch";
    case Service.Outlet:
      return "Plug Switch";
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

AqaraAccessoryFactory.prototype.findServiceAndSetValue = function (hubId, setId,
                                                                   accessoryUUID, accessoryCategory,
                                                                   serviceType,
                                                                   characteristicType, characteristicValue,
                                                                   commander) {

  // Use last four characters of setId as service name
  var accessoryName = setId.substring(setId.length - 4);
  var serviceName = accessoryName;

  // Remember gateway/device update time
  this.lastHubUpdateTime[hubId] = Date.now();
  this.lastSetUpdateTime[accessoryUUID] = Date.now();
  this.setIdToHubIdMap[accessoryUUID] = hubId;

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

    // Set serial number so we can track it later
    newAccessory.getService(Service.AccessoryInformation)
      .setCharacteristic(Characteristic.Manufacturer, "Aqara")
      .setCharacteristic(Characteristic.Model, this.getAccessoryModel(serviceType))
      .setCharacteristic(Characteristic.SerialNumber, setId);

    service = newAccessory.addService(serviceType, serviceName);
    this.api.registerPlatformAccessories("homebridge-aqara", "AqaraPlatform", [newAccessory]);
    newAccessory.on('identify', function (paired, callback) {
      that.log(newAccessory.displayName, "Identify!!!");
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
    // that.log("Set %s %s", serviceName, characteristicValue);
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

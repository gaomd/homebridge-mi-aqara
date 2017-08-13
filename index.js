const dgram = require('dgram');
const server = dgram.createSocket('udp4');
const serverPort = 9898;
const multicastAddress = '224.0.0.50';
const multicastPort = 4321;

var Accessory, PlatformAccessory, Service, Characteristic, UUID;
var MiAqaraOutlet, MiAqaraSwitch, MiAqaraDualSwitch;

module.exports = function (homebridge) {
  Accessory = homebridge.hap.Accessory;
  PlatformAccessory = homebridge.platformAccessory;
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;
  UUID = homebridge.hap.uuid;

  MiAqaraOutlet = require("./devices/outlet")(Accessory, PlatformAccessory, Service, Characteristic, UUID);
  MiAqaraSwitch = require("./devices/switch")(Accessory, PlatformAccessory, Service, Characteristic, UUID);
  // MiAqaraDualSwitch = require("./devices/switch-dual")(Accessory, PlatformAccessory, Service, Characteristic, UUID);

  homebridge.registerPlatform("homebridge-mi-aqara", "MiAqara", MiAqara);
};

/*
 * The PLATFORM ITSELF
 */
function MiAqara(log, config, api) {
  var platform = this;

  this.log = log;

  // Save the API object as plugin needs to register new accessory via this object.
  this.api = api;

  // TODO: pending organize
  this.accessories = [];
  this.deviceToGatewayId = {};
  this.lastGatewayUpdateTime = {};
  this.lastDeviceUpdateTime = {};

  // Record ID/Password of gateways
  this.gatewayCredentials = {};

  // Record gateway token
  this.gateways = {};

  // Record gateway ID/Address/Port the devices are under
  this.devices = {};

  this.accessories = {};

  this.onlineDevices = {};

  this.deviceOverrides = {};

  this.deviceTypes = {
    "SENSOR_TEMP_HUM": "sensor_ht",
    "SENSOR_MOTION": "motion",
    "SENSOR_CONTACT": "magnet",
    "SWITCH": "ctrl_neutral1",
    "SWITCH_DUO": "ctrl_neutral2",
    "OUTLET": "plug"
  };

  this.deviceClasses = {
    'plug': MiAqaraOutlet,                // 智能插座
    'ctrl_neutral1': MiAqaraSwitch,       // 墙壁开关（单键）
    'ctrl_neutral2': MiAqaraSwitch        // 墙壁开关（双键）
    // 'sensor_ht': new TemperatureAndHumidityParser(this),  // 温湿度传感器
    // 'motion': new MotionParser(this),                     // 人体传感器
    // 'magnet': new ContactParser(this),                    // 门窗传感器
  };

  // Load gatewayCredentials from config.json
  this.parseConfig(config);

  // Start UDP server to communicate with gateways
  this.startServer();

  if (!this.api) {
    this.log.error("Your Homebridge is too old, please consider upgrade!");
  }

  // Keep discovering gateways every 300 seconds
  this.api.on('didFinishLaunching', function () {
    // Send whois to discovery Aqara gateways and resend every 300 seconds
    platform.queryGateway("whois");

    setInterval(function () {
      platform.queryGateway("whois");
    }, 300 * 1000);
  });

  this.scheduleDeviceAutoRemoval();
}

MiAqara.prototype.parseConfig = function (config) {
  // Load MAC/Password pair of gateways
  var gatewayMacAddresses = config['gateway_mac_addresses'];
  var gatewayPasswords = config['gateway_passwords'];
  if (gatewayMacAddresses && gatewayPasswords) {
    for (var index in gatewayPasswords) {
      if (gatewayPasswords.hasOwnProperty(index)) {
        this.gatewayCredentials[gatewayMacAddresses[index].replace(/:/g, "").toLowerCase()] = gatewayPasswords[index];
      }
    }
  }

  this.deviceOverrides = config['device_overrides'] || {};
};

MiAqara.prototype.scheduleDeviceAutoRemoval = function () {
  var deviceSync = this.deviceSync;
  // Check removed accessory every half an hour.
  setInterval(function () {
    deviceSync.removeOfflineAccessory();
  }, 1800 * 1000);
};

MiAqara.prototype.startServer = function () {
  var platform = this;

  // Process incoming gateway events
  server.on('message', this.processGatewayEvent.bind(this));

  // err - Error object, https://nodejs.org/api/errors.html
  server.on('error', function (err) {
    platform.log.error('error, msg - %s, stack - %s\n', err.message, err.stack);
  });

  // Show some message
  server.on('listening', function () {
    platform.log.debug("Mi Aqara server is listening on port 9898.");
    server.addMembership(multicastAddress);
  });

  // Start server
  server.bind(serverPort);
};

MiAqara.prototype.queryGateway = function (command, parameters, port, ip) {
  if (Object.prototype.toString.call(parameters) !== "[object Object]") {
    parameters = {};
  }
  var query = Object.assign(parameters, {cmd: command});
  // this.log("queryGateway, data:", "`" + JSON.stringify(query) + "`", ", address:", ip || multicastAddress, ", port:", port || multicastPort);
  server.send(JSON.stringify(query), port || multicastPort, ip || multicastAddress);
};

// Parse messages sent from gateways
MiAqara.prototype.processGatewayEvent = function (event, gatewayIp) {
  // this.log.debug("Received %s (%d bytes) from client %s:%d\n", event, event.length, gatewayIp.address, gatewayIp.port);

  try {
    event = JSON.parse(event);
  } catch (e) {
    this.log.error("Invalid JSON %s", event);

    return;
  }

  var command = event['cmd'];

  if (command === 'iam') {
    this.queryGateway("get_id_list", null, event["port"], event["ip"]);
  } else if (command === 'heartbeat') {
    if (event['model'] === 'gateway') {
      this.rememberGatewayToken(event["sid"], event["token"]);
    }
  } else if (command === 'get_id_list_ack') {
    var gatewayId = event['sid'];

    this.rememberGatewayToken(gatewayId, event["token"]);

    var data = JSON.parse(event['data']);
    for (var key in data) {
      if (data.hasOwnProperty(key)) {
        var deviceId = data[key];

        this.devices[deviceId] = {
          underGateway: {
            id: gatewayId,
            address: gatewayIp.address,
            port: gatewayIp.port
          }
        };

        this.queryGateway("read", {sid: deviceId}, gatewayIp.port, gatewayIp.address);
      }
    }
  } else if (command === "read_ack") {
    var deviceModel = event['model'];

    if (deviceModel in this.deviceClasses) {
      var instanceKey = deviceModel + ":" + event["sid"];
      if (!(instanceKey in this.onlineDevices)) {
        this.onlineDevices[instanceKey] = new this.deviceClasses[deviceModel](this, event["sid"], event["model"]);
      }
      this.onlineDevices[instanceKey].processDeviceReportEvent(event, gatewayIp);
    }
  } else if (command === 'write_ack') {
    ;
  } else {
    ;
  }
};

MiAqara.prototype.rememberGatewayToken = function (gatewayId, token) {
  this.gateways[gatewayId] = {
    token: token
  };
};

MiAqara.prototype.findGatewayByDevice = function (deviceId) {
  return this.devices[deviceId].underGateway;
};

MiAqara.prototype.getAccessoryCommonName = function (accessoryType) {
  switch (accessoryType) {
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

// How long in milliseconds we can remove an accessory when there's no update.
// This is a little complicated:
// First, we need to make sure gateway is online, if the gateway is offline, we do nothing.
// Then, we measure the delta since last update time, if it's too long, remove it.
MiAqara.prototype.removeOfflineAccessory = function () {
  return;
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

MiAqara.prototype.registerHomeKitAccessory = function (deviceIdAsSerialNumber,
                                                       accessoryDisplayName,
                                                       accessoryUUID,
                                                       accessoryCategory,
                                                       accessoryServiceType,
                                                       characteristicType) {
  // Remember gateway/device update time
  // this.lastGatewayUpdateTime[gatewayId] = Date.now();
  // this.lastDeviceUpdateTime[accessoryUUID] = Date.now();
  // this.deviceToGatewayId[accessoryUUID] = gatewayId;

  var platform = this;
  var serviceName = accessoryDisplayName;
  var service, accessory, characteristic;

  if (this.accessories[accessoryUUID]) {
    accessory = this.accessories[accessoryUUID];
  } else {
    // Build a new accessory
    accessory = new PlatformAccessory(accessoryDisplayName, accessoryUUID, accessoryCategory);
    accessory.reachable = true;
    accessory.getService(Service.AccessoryInformation)
      .setCharacteristic(Characteristic.Manufacturer, "Mi Aqara")
      .setCharacteristic(Characteristic.Model, this.getAccessoryCommonName(accessoryServiceType))
      .setCharacteristic(Characteristic.SerialNumber, deviceIdAsSerialNumber);
    accessory.addService(accessoryServiceType, serviceName);

    this.api.registerPlatformAccessories("homebridge-mi-aqara", "MiAqara", [accessory]);
    accessory.on('identify', function (paired, callback) {
      platform.log(accessory.displayName, "...Identified");
      callback();
    });

    this.accessories[accessory.UUID] = accessory;
  }

  // Add Characteristic Set Event Listener
  service = accessory.getService(accessoryServiceType);
  characteristic = service.getCharacteristic(characteristicType);
  if (!characteristic) {
    platform.log("Service has no specified characteristic");
  }

  return accessory;
};

// Function invoked when homebridge tries to restore cached accessory
// Developer can configure accessory at here (like setup event handler)
// Update current value
MiAqara.prototype.configureAccessory = function (accessory) {
  var platform = this;

  platform.log("Try to restore cached accessory: ", accessory.displayName);

  // set the accessory to reachable if plugin can currently process the accessory
  // otherwise set to false and update the reachability later by invoking
  // accessory.updateReachability()
  accessory.reachable = true;
  accessory.on('identify', function (paired, callback) {
    platform.log("Accessory identified:", accessory.displayName);
    callback();
  });

  this.accessories[accessory.UUID] = accessory;
  this.lastDeviceUpdateTime[accessory.UUID] = Date.now();
};

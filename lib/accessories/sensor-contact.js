"use strict";

// Contact/Magnet sensor data parser
ContactParser = function (platform) {
  this.init(platform);
};

inherits(ContactParser, BaseParser);

ContactParser.prototype.initFromDeviceReportEvent = function (event, remote) {
  var deviceId = event['sid'];
  var gatewayId = this.platform.devices[deviceId].underGateway.id;
  var data = JSON.parse(event['data']);
  var sealed = (data['status'] === 'close');

  this.deviceSync.updateContact(gatewayId, deviceId, sealed);
};

// Contact sensor
MiAqaraAccessories.prototype.updateContact = function (gatewayId, deviceId, contacted) {
  this.syncHome(
    gatewayId,
    deviceId,
    this.getAccessoryDisplayName('SENSOR_CONTACT-' + deviceId),
    UUID.generate('SENSOR_CONTACT-' + deviceId),
    Accessory.Categories.SENSOR,
    Service.ContactSensor,
    Characteristic.ContactSensorState,
    contacted ? Characteristic.ContactSensorState.CONTACT_DETECTED : Characteristic.ContactSensorState.CONTACT_NOT_DETECTED,
    null); // No commander
};

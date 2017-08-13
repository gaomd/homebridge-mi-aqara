
// Motion sensor data parser
MotionParser = function (platform) {
  this.init(platform);
};

inherits(MotionParser, BaseParser);

MotionParser.prototype.initFromDeviceReportEvent = function (event, remote) {
  var deviceId = event['sid'];
  var gatewayId = this.platform.devices[deviceId].underGateway.id;
  var data = JSON.parse(event['data']);
  var motionDetected = (data['status'] === 'motion');

  this.deviceSync.updateMotion(gatewayId, deviceId, motionDetected);
};


// Motion sensor
MiAqaraAccessories.prototype.updateMotion = function (gatewayId, deviceId, motionDetected) {
  this.syncHome(
    gatewayId,
    deviceId,
    this.getAccessoryDisplayName('SENSOR_MOTION-' + deviceId),
    UUID.generate('SENSOR_MOTION-' + deviceId),
    Accessory.Categories.SENSOR,
    Service.MotionSensor,
    Characteristic.MotionDetected,
    motionDetected,
    null); // No commander
};

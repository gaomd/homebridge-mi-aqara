TemperatureAndHumidityParser.prototype.initFromDeviceReportEvent = function (event) {
  var deviceId = event['sid'];
  var gatewayId = this.platform.devices[deviceId].underGateway.id;
  var data = JSON.parse(event['data']);

  var temperature = data['temperature'] / 100.0;
  var humidity = data['humidity'] / 100.0;
  this.deviceSync.updateTemperatureAndHumidity(gatewayId, deviceId, temperature, humidity);
};

MiAqaraAccessories.prototype.updateTemperatureAndHumidity = function (gatewayId, deviceId, temperature, humidity) {
  // Temperature
  this.syncHome(
    gatewayId,
    deviceId,
    this.getAccessoryDisplayName('SENSOR_TEM-' + deviceId),
    UUID.generate('SENSOR_TEM-' + deviceId),
    Accessory.Categories.SENSOR,
    Service.TemperatureSensor,
    Characteristic.CurrentTemperature,
    temperature,
    null); // No commander

  // Humidity
  this.syncHome(
    gatewayId,
    deviceId,
    this.getAccessoryDisplayName('SENSOR_HUM-' + deviceId),
    UUID.generate('SENSOR_HUM-' + deviceId),
    Accessory.Categories.SENSOR,
    Service.HumiditySensor,
    Characteristic.CurrentRelativeHumidity,
    humidity,
    null); // No commander
};

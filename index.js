'use strict';

module.exports = function (homebridge) {
  const MiAqaraPlatform = require('./lib/platform')(homebridge);
  homebridge.registerPlatform("homebridge-mi-aqara", "MiAqara", MiAqaraPlatform);
};

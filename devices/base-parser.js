'use strict';

// Base parser
var BaseParser = function () {
  this.platform = null;
};

BaseParser.prototype.init = function (platform) {
  this.platform = platform;
  this.deviceSync = platform.deviceSync;
};

module.exports = BaseParser;

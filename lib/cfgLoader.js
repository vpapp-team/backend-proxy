const FS = require('fs');
const PATH = require('path');
const HTTPS_CERT = require('backend-util').httpsCert;

module.exports = (() => {
  const CFG = require(PATH.resolve(__dirname, '../config.json'));

  // Add default values
  // allow http as long as no https is set up
  if (!CFG.general.hasOwnProperty('redirectHttp')) CFG.general.redirectHttp = !!CFG.general.httpsPorts.length;
  if (!CFG.general.hasOwnProperty('broadcast')) CFG.general.broadcast = null;
  if (!CFG.general.hasOwnProperty('maxServerAge')) CFG.general.maxServerAge = 300000;
  if (!CFG.general.hasOwnProperty('httpPorts')) CFG.general.httpPorts = [80];
  if (!CFG.general.hasOwnProperty('httpsPorts')) CFG.general.httpsPorts = [];
  if (!CFG.general.hasOwnProperty('SECURE_CONTEXT')) CFG.general.SECURE_CONTEXT = null;
  if (!CFG.hasOwnProperty('endpoints')) CFG.endpoints = [];

  if (CFG.general.httpsPorts.length) {
    CFG.general.SECURE_CONTEXT = new HTTPS_CERT(CFG.general.SECURE_CONTEXT);
  }
  CFG.general.publicKey = FS.readFileSync(PATH.resolve(__dirname, '../', CFG.general.publicKey));

  const ep = new Map();
  for (const item of CFG.endpoints) {
    item.servers = [];
    ep.set(item.hostname, item);
  }
  CFG.endpoints = ep;

  return CFG;
})();

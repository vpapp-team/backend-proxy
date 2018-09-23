const HTTPS_CERT = require('backend-util').httpsCert;
const PATH = require('path');
const FS = require('fs');

module.exports = cfgFile => {
  // TODO: listen for changes of cfg
  const CFG = require(PATH.resolve(__dirname, '../', cfgFile));

  // Add default values
  if (!CFG.general.hasOwnProperty('acceptHttp')) CFG.general.acceptHttp = false;
  if (!CFG.general.hasOwnProperty('broadcast')) CFG.general.broadcast = null;
  if (!CFG.general.hasOwnProperty('maxServerAge')) CFG.general.maxServerAge = 300000;
  if (!CFG.general.hasOwnProperty('httpPorts')) CFG.general.httpPorts = [80];
  if (!CFG.general.hasOwnProperty('httpsPorts')) CFG.general.httpsPorts = [];
  if (!CFG.general.hasOwnProperty('SECURE_CONTEXT')) CFG.general.SECURE_CONTEXT = null;
  if (!CFG.hasOwnProperty('endpoints')) CFG.endpoints = [];

  CFG.general.SECURE_CONTEXT = new HTTPS_CERT(CFG.general.SECURE_CONTEXT);
  CFG.general.publicKey = FS.readFileSync(PATH.resolve(__dirname, '../', CFG.general.publicKey));

  const ep = new Map();
  for (const item of CFG.endpoints) {
    item.servers = [];
    ep.set(item.host, item);
  }
  CFG.endpoints = ep;

  return CFG;
};

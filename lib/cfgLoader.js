const HTTP_CERT = require('backend-util').httpCert;
const PATH = require('path');
const FS = require('fs');

module.exports = cfgFile => {
  // TODO: listen for changes of cfg
  const CFG = require(PATH.resolve(__dirname, '../', cfgFile));

  CFG.general.SECURE_CONTEXT = new HTTP_CERT(CFG.general.SECURE_CONTEXT);
  CFG.general.publicKey = FS.readFileSync(PATH.resolve(__dirname, '../', CFG.general.publicKey));

  const ep = new Map();
  for (const item of CFG.endpoints) ep.set(item.host, item);
  CFG.endpoints = ep;

  return CFG;
};

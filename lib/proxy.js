const HTTPS = require('https');
const HTTP = require('http');
const CRYPTO = require('crypto');
const PROXY = require('http-proxy').createServer();
const UTIL = require('backend-util');

const CFG = require('./cfgLoader.js')('./config.json');
const LOGGER = new (require('backend-logger'))().is.PROXY();

let KNOWN_SERVERS = [];

/*
 * Sub server fails for some reason
 */
PROXY.on('error', (err, req, resp) => {
  // TODO: revalidate/remove server depending on error
  LOGGER.error('proxy failed', err, req, resp);
  LOGGER.error(req.handlingServer);
  resp.writeHead(500, {
    'Content-Type': 'text/plain',
  });
  resp.end('Something went wrong. And we are reporting a custom error message.');
});

/*
 * New uuid not already in KNOWN_SERVERS
 */
const newServerUUID = () => {
  let uuid = CRYPTO.randomBytes(128).toString('hex');
  while (KNOWN_SERVERS.some(a => a.uuid === uuid)) uuid = CRYPTO.randomBytes(128).toString('hex');
  return uuid;
};

/*
 * Remove a server from cache by uuid
 */
const fullyRemoveServer = uuid => {
  for (const [, ep] of CFG.endpoints) {
    ep.servers = ep.servers.filter(a => a.uuid !== uuid);
  }
  KNOWN_SERVERS = KNOWN_SERVERS.filter(a => a.uuid !== uuid);
};

/*
 * Start http(s) server(s)
 */
setImmediate(() => {
  const HTTPS_SERVERS = [];
  for (const port of CFG.general.httpsPorts) {
    HTTPS_SERVERS.push(HTTPS.createServer(CFG.general.SECURE_CONTEXT.getCredentials(), handleRequest).listen(port));
  }
  CFG.general.SECURE_CONTEXT.on('CHANGE', () => {
    LOGGER.log('SECURE_CONTEXT CHANGED');
    for (let a = 0; a < HTTPS_SERVERS.length; a++) {
      HTTPS_SERVERS[a].close(() => {
        HTTPS_SERVERS[a] = HTTPS.createServer(CFG.general.SECURE_CONTEXT.getCredentials(), handleRequest)
          .listen(CFG.general.httpsPorts[a]);
      });
    }
  });
  for (const port of CFG.general.httpPorts) {
    HTTP.createServer((req, resp) => {
      if (CFG.general.acceptHttp) {
        handleRequest(req, resp);
      } else {
        UTIL.denie(resp, 'https only', { Location: `https://${req.headers.host}${req.url}` }, 301);
      }
    }).listen(port);
  }
});

/*
 * Handle incoming http(s) requests
 */
const handleRequest = (req, resp) => {
  LOGGER.debug('handleRequest', { method: req.method, headers: req.headers, url: req.url });
  if (req.method === CFG.general.registration.method &&
    req.headers.host === CFG.general.registration.host &&
    req.url === CFG.general.registration.url
  ) {
    handleRegister(req, resp);
  } else if (req.method === CFG.general.broadcast.method &&
    req.headers.host === CFG.general.broadcast.host &&
    req.url === CFG.general.broadcast.url
  ) {
    handleBroadcast(req, resp);
  } else if (CFG.endpoints.has(req.headers.host)) {
    const mappingRule = CFG.endpoints.get(req.headers.host);
    req.handlingServer = mappingRule.servers.shift();
    while (req.handlingServer && req.handlingServer.lastRegister + CFG.general.maxServerAge < Date.now()) {
      fullyRemoveServer(req.handlingServer.uuid);
      req.handlingServer = mappingRule.servers.shift();
    }
    if (!req.handlingServer) return UTIL.denie(resp, 'no valid server for that url registered to the proxy', null, 502);
    PROXY.web(req, resp, req.handlingServer);
    mappingRule.servers.push(req.handlingServer);
  } else if (CFG.endpoints.has('@')) {
    const mappingRule = CFG.endpoints.get('@');
    req.handlingServer = mappingRule.servers.shift();
    while (req.handlingServer && req.handlingServer.lastRegister + CFG.general.maxServerAge < Date.now()) {
      fullyRemoveServer(req.handlingServer.uuid);
      req.handlingServer = mappingRule.servers.shift();
    }
    if (!req.handlingServer) return UTIL.denie(resp, 'no valid server for that url registered to the proxy', null, 502);
    PROXY.web(req, resp, req.handlingServer);
    mappingRule.servers.push(req.handlingServer);
  } else {
    UTIL.denie(resp, 'unknown domain', null, 404);
  }
  return null;
};
const handleRegister = (req, resp) => {
  if (req.headers.uuid) {
    let server = KNOWN_SERVERS.find(a => a.uuid === req.headers.uuid);
    if (server) {
      server.lastRegister = Date.now();
      return UTIL.accept(resp, 'successfully updated');
    }
  }
  return UTIL.getBody(req).then(reqBody => {
    if (!UTIL.verifySignature(reqBody, req.headers.sign, CFG.general.publicKey)) {
      return UTIL.denie(resp, 'invalid signature');
    }
    const newServer = JSON.parse(reqBody);
    newServer.sign = req.headers.sign;
    newServer.uuid = newServerUUID();
    return (newServer.https ? HTTPS : HTTP).get({
      host: newServer.host,
      port: newServer.port,
      path: newServer.path,
      validateCert: newServer.validateCert,
      headers: { uuid: newServerUUID },
    }, req2 => {
      if (req2.statusCode !== 200) return UTIL.denie(resp, 'server denied beacon');
      KNOWN_SERVERS.push(newServer);
      for (const [, ep] of KNOWN_SERVERS.ep) {
        if (CFG.endpoints.has(ep)) CFG.endpoints.get(ep).servers.push(newServer);
      }
      return UTIL.accept(resp, 'server added');
    });
  });
};
const handleBroadcast = (req, resp) => {}; // TODO: this

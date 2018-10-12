const HTTP = require('http');
const HTTPS = require('https');
const CRYPTO = require('crypto');
const UTIL = require('backend-util');
const PROXY = require('http-proxy').createServer();

let KNOWN_SERVERS = [];

const LOGGER = new (require('backend-logger'))().is.PROXY();
const CONFIG = require('./cfgLoader.js')();


/*
 * Sub server fails for some reason
 */
PROXY.on('error', (err, req, resp) => {
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
  let uuid = UTIL.genSalt(128);
  while (KNOWN_SERVERS.some(a => a.uuid === uuid)) uuid = CRYPTO.randomBytes(128).toString('hex');
  return uuid;
};

/*
 * Remove a server from cache by uuid
 */
const fullyRemoveServer = uuid => {
  for (const [, ep] of CONFIG.endpoints) {
    ep.servers = ep.servers.filter(a => a.uuid !== uuid);
  }
  KNOWN_SERVERS = KNOWN_SERVERS.filter(a => a.uuid !== uuid);
};

/*
 * Start http(s) server(s)
 */
setImmediate(() => {
  const HTTPS_SERVERS = [];
  for (const port of CONFIG.general.httpsPorts) {
    HTTPS_SERVERS.push(HTTPS.createServer(CONFIG.general.SECURE_CONTEXT.getCredentials(), handleRequest).listen(port));
  }
  CONFIG.general.SECURE_CONTEXT.on('CHANGE', () => {
    LOGGER.log('SECURE_CONTEXT CHANGED');
    for (let a = 0; a < HTTPS_SERVERS.length; a++) {
      HTTPS_SERVERS[a].close(() => {
        HTTPS_SERVERS[a] = HTTPS.createServer(CONFIG.general.SECURE_CONTEXT.getCredentials(), handleRequest)
          .listen(CONFIG.general.httpsPorts[a]);
      });
    }
  });
  for (const port of CONFIG.general.httpPorts) {
    HTTP.createServer((req, resp) => {
      if (CONFIG.general.acceptHttp) {
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
  if (req.headers.host === `${CONFIG.general.registration.hostname}:${CONFIG.general.broadcast.port}` &&
    req.method === CONFIG.general.registration.method &&
    req.url === CONFIG.general.registration.url
  ) {
    handleRegister(req, resp);
  } else if (CONFIG.general.broadcast &&
    req.headers.host === `${CONFIG.general.broadcast.hostname}:${CONFIG.general.broadcast.port}` &&
    req.method === CONFIG.general.broadcast.method &&
    req.url === CONFIG.general.broadcast.url
  ) {
    handleBroadcast(req, resp);
  } else if (CONFIG.endpoints.has(req.headers.host)) {
    const mappingRule = CONFIG.endpoints.get(req.headers.host);
    req.handlingServer = mappingRule.servers.shift();
    while (req.handlingServer && req.handlingServer.lastRegister + CONFIG.general.maxServerAge < Date.now()) {
      fullyRemoveServer(req.handlingServer.uuid);
      req.handlingServer = mappingRule.servers.shift();
    }
    if (!req.handlingServer) return UTIL.denie(resp, 'no valid server for that url registered to the proxy', null, 502);
    PROXY.web(req, resp, req.handlingServer);
    mappingRule.servers.push(req.handlingServer);
  } else if (CONFIG.endpoints.has('@')) {
    const mappingRule = CONFIG.endpoints.get('@');
    req.handlingServer = mappingRule.servers.shift();
    while (req.handlingServer && req.handlingServer.lastRegister + CONFIG.general.maxServerAge < Date.now()) {
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
  if (req.headers.proxyuuid) {
    let server = KNOWN_SERVERS.find(a => a.uuid === req.headers.proxyuuid);
    if (server) {
      server.lastRegister = Date.now();
      return UTIL.accept(resp, 'successfully updated');
    } else {
      return UTIL.denie(resp, 'proxyUUID unknown', null, 409);
    }
  }
  return UTIL.getBody(req).then(reqBody => {
    if (!UTIL.verifySignature(reqBody, req.headers.sign, CONFIG.general.publicKey)) {
      return UTIL.denie(resp, 'invalid signature');
    }
    const newServer = JSON.parse(reqBody);
    newServer.sign = req.headers.sign;
    newServer.uuid = newServerUUID();
    return (newServer.https ? HTTPS : HTTP).get({
      hostname: newServer.hostname,
      port: newServer.port,
      path: newServer.path,
      validateCert: newServer.validateCert,
      headers: {
        // Uuid to identify client in proxy
        proxyUUID: newServer.uuid,
        // Echo id so the client knows its the proxy responding
        reqID: req.headers.reqid,
      },
    }, req2 => {
      if (req2.statusCode !== 200) return UTIL.denie(resp, 'server denied beacon');
      newServer.lastRegister = Date.now();
      KNOWN_SERVERS.push(newServer);
      for (const ep of newServer.ep) {
        const cfg_ep = CONFIG.endpoints.get(ep);
        // Check wether no encryption is requested and allowed
        if (!cfg_ep) return UTIL.denie(resp, `unknown endpoint "${ep}"`);
        if (!cfg_ep.allowUnsecure && !newServer.isSameServer && (!newServer.https || !newServer.validateCert)) {
          return UTIL.denie(resp, `endpoint ${ep} only allows secure connections over the web`);
        }
        cfg_ep.servers.push(newServer);
      }
      return UTIL.accept(resp, 'server added');
    });
  });
};
const handleBroadcast = (req, resp) => {};

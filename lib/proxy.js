const HTTPS = require('https');
const HTTP = require('http');
const CRYPTO = require('crypto');
const PROXY = require('http-proxy').createServer();
const UTIL = require('backend-util');

const CFG = require('./cfgLoader.js')('./config.js');
const LOGGER = new (require('backend-logger'))().is.PROXY();

PROXY.on('error', (err, req, resp) => {
  // TODO: revalidate/remove server
  LOGGER.error('proxy failed', err, req, resp);
  resp.writeHead(500, {
    'Content-Type': 'text/plain',
  });
  resp.end('Something went wrong. And we are reporting a custom error message.');
});

const handleRequest = (req, resp) => {
  if (req.method === CFG.general.registration.method &&
    req.headers.host === CFG.general.registration.host &&
    req.url === CFG.general.registration.url
  ) {
    handleConnect(req, resp);
  } else if(req.method === CFG.general.broadcast.method &&
    req.headers.host === CFG.general.broadcast.host &&
    req.url === CFG.general.broadcast.url
  ) {
    handleBroadcast(req, resp);
  } else if (CFG.endpoints.has(req.headers.host)) {
    const mappingRule = CFG.endpoints.get(req.headers.host);
    if (!mappingRule.servers.length) return UTIL.denie(resp, 'no proxy for that url available', null, 502);
    const server = mappingRule.servers.shift();
    PROXY.web(req, resp, server);
    mappingRule.servers.push(server);
  } else if (CFG.endpoints.has('@')) {
    const mappingRule = CFG.endpoints.get('@');
    if (!mappingRule.servers.length) return UTIL.denie(resp, 'no proxy for that url available', null, 502);
    const server = mappingRule.servers.shift();
    PROXY.web(req, resp, server);
    mappingRule.servers.push(server);
  } else {
    UTIL.denie(resp, 'unknown url', null, 404);
  }
  return null;
};

const handleBroadcast = (req, resp) => {
  // TODO: handle broadcast messages
}

const handleConnect = (req, resp) => {
  if(req.headers.auth) // TODO: update last request time for the server
  UTIL.getBody(req).then(reqBody => {
    // TODO: verify signature instead of using some random secret
    UTIL.verifySignature(reqBody, req.headers.sign, CFG.general.publicKey)
    let proposedServer;
    try {
      proposedServer = JSON.parse(reqBody);
    } catch (e) {
      return UTIL.denie(resp, 'invalid json provided');
    }
    if (typeof proposedServer.port !== 'number') return UTIL.denie(resp, 'invalid port');
    if ((typeof proposedServer.host !== 'string') && proposedServer.host) return UTIL.denie(resp, 'invalid host');
    if (typeof proposedServer.https !== 'boolean') return UTIL.denie(resp, 'invalid https');
    if (typeof proposedServer.validateCert !== 'boolean') return UTIL.denie(resp, 'invalid validateCert');

    const testString = CRYPTO.randomBytes(128).toString('hex');
    // TODO: clearify method and path
    return UTIL.getWebpage({
      protocol: proposedServer.https ? 'https' : 'http',
      host: proposedServer.host,
      port: proposedServer.port,
      path: '/validate',
      rand: testString,
    }).then(respBody => {
      let data;
      try {
        data = JSON.parse(respBody);
      } catch (err) {
        return UTIL.denie(resp, 'invalid json provided');
      }

      // instead of checking the secret sign the endpoint + target server and check wether that is valid
      for (const endpoint in data) {
        const ep = CFG.endpoints.get(endpoint);
        if (!ep) return UTIL.denie(resp, 'endpoint doesn\'t exist');
        if (data[endpoint] !== UTIL.buildHash('sha256', ep.secret, testString)) {
          return UTIL.denie(resp, 'invalid secret');
        }
        if (!ep.allowUnsecure && (!proposedServer.https || !proposedServer.validateCert)) {
          return UTIL.denie(resp, 'unsecure not allowed');
        }
      }
      for (const endpoint in data) {
        const ep = CFG.endpoints.get(endpoint);
        ep.servers.push({
          target: `${proposedServer.https ? 'https' : 'http'}://${proposedServer.host}:${proposedServer.port}`,
          secure: proposedServer.validateCert,
          xfwd: true,
          ignorePath: !ep.keepPath,
        });
      }
      // TODO: revalidate server after a given time
      return SERVERS.set(`${proposedServer.https ? 'https' : 'http'}://${proposedServer.host}:${proposedServer.port}`, {
        port: proposedServer.port,
        host: proposedServer.host,
        https: proposedServer.https,
        validateCert: proposedServer.validateCert,
        lastAction: Date.now(),
      });
    }).catch(err => {
      UTIL.denie(resp, err.message);
    });
  }).catch(err => {
    UTIL.denie(resp, err.message);
  });
};

const HTTPS_SERVERS = [];
for (const port of CFG.general.httpsPorts) {
  HTTPS_SERVERS.push(HTTPS.createServer(CFG.general.SECURE_CONTEXT.getCredentials(), handleRequest).listen(port));
}
CFG.general.SECURE_CONTEXT.on('CHANGE', () => {
  LOGGER.log('SECURE_CONTEXT CHANGED');
  for(let a = 0 ; a < HTTPS_SERVERS.length ; a++) {
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

# backend-proxy

[![Greenkeeper badge](https://badges.greenkeeper.io/vpapp-team/backend-proxy.svg)](https://greenkeeper.io/)

# responses

| StatusCode | meaning |
| --- | --- |
| 200 | All fine |
| 301 | http to https redirect |
| 400 | invalid signature, beacon failed, body(size) invalid, unknown ep or ep security problem |
| 404 | unknown domain |
| 409 | provided proxyUUID unknown |
| 500 | sth went wrong |
| 502 | no server for domain |
| xxx | error redirected from the endpoint requesting |

# types
> ## endpoint
> type: object
>
> | property | type | description |
> | --- | --- | --- |
> | hostname | string | ether a domain like "web.nigb.app" or "@" as default route |
> | allowUnsecure | boolean | true to allow http hosts and no validateCert |
>
> ## clientLocation
> type: object
>
> | property | type | optional | description |
> | --- | --- | --- | --- |
> | hostname | string | false | the domain/ip of the host (e.g. "location1.nigb.app") |
> | port | number | true | the port to connect to (e.g. 1337) |
> | method | string | false | the http method to use (e.g. "POST") |
> | path | string | true | the location to use (e.g. "/") |
>
> ## workerServer
> type: object
>
> | property | type | description |
> | --- | --- | --- |
> | hostname | string | the workers domain/ip |
> | port | number | the workers port |
> | method | string | method to use with validation request |
> | path | string | to send validation request to |
> | https | boolean | true to use https |
> | validateCert | boolean | false to accept selfsigned/invalid tls certs |
> | isSameServer | boolean | true if connection is to localhost, disables some hasToBeSecure validations |
> | receiveEP | [string] | list of the ep's to register for redirects |
> | broadcastEP | [string] | list of the ep's being allowed to broadcast to |

# register
1. request the endpoint provided in config.general.registration including:
  * the sign in `header.sign`
  * the config (type: [workerServer](#workerServer))
  * some id in `header.reqID`
2. wait for the validation request to the required path, check whether the `header.reqID` is valid and respond with 200
3. save the `header.proxyUUID` string
4. after less then config.general.maxServerAge seconds re-register using the uuid in `header.proxyUUID`

# config
Location: `./config.json`

| property | type | default | optional | description |
| --- | --- | --- | --- | --- |
| general | object | / | no | general settings |
| general.redirectHttp | boolean | true (when https ports set) | yes | whether to redirect http requests to https |
| general.registration | [clientLocation](#clientlocation) | / | no | location that gets reserved for registering to this proxy |
| general.broadcast | [clientLocation](#clientlocation) | null | yes | location that gets reserverd for broadcasting on this proxy |
| general.maxServerAge | number | 300000 | yes |milliseconds after which a server gets invalidated if it doesnt reauth |
| general.httpPorts | [number] | [80] | yes | array of http ports to listen on |
| general.httpsPorts | [number] | [] | yes | array of https ports to listen on |
| general.SECURE_CONTEXT | object | null | only when no httpsPorts provided | [options to pass to the https.createServer func](https://nodejs.org/api/https.html#https_https_createserver_options_requestlistener) |
| general.publicKey | string | / | no | the publicKey read as a string |
| endpoints | [[endpoint](#endpoint)] | [] | yes | array of served endpoints |

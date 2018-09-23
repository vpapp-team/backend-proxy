# backend-proxy

[![Greenkeeper badge](https://badges.greenkeeper.io/vpapp-team/backend-proxy.svg)](https://greenkeeper.io/)

# responses

| StatusCode | meaning |
| --- | --- |
| 200 | All fine |
| 301 | http to https redirect |
| 400 | invalid signature, beacon failed, unknown ep or ep security problem |
| 404 | unknown domain |
| 500 | sth went wrong |
| 502 | no server for domain |

# types
> ## endpoint
> type: object
>
> | property | type | description |
> | --- | --- | --- |
> | host | string | ether a domain like "web.nigb.app" or "@" as default route |
> | keepPath | boolean | true to keep path with proxy redirect |
> | allowUnsecure | boolean | true to allow http hosts and no validateCert |
>
> ## clientLocation
> type: object
>
> | property | type | description |
> | --- | --- | --- |
> | host | string | the domain/ip and port of the host (e.g. "location1.nigb.app:1337") |
> | method | string | the http method to use (e.g. "POST") |
> | url | string | the location to use (e.g. "/") |
>
> ## workerServer
> type: object
>
> | property | type | description |
> | --- | --- | --- |
> | host | string | the workers domain/ip |
> | port | number | the workers port |
> | path | string | to send validation request to |
> | https | boolean | true to use https |
> | validateCert | boolean | false to accept selfsigned/invalid tls certs |
> | isSameServer | boolean | true if connection is to localhost
> | ep | [string] | list of the ep's to register for |

# register
1. request the endpoint provided in config.general.registration including:
  * the sign in `header.sign`
  * the config (type: [workerServer](#workerServer))
2. wait for the validation request to the required path and respond with 200
3. save the header.uuid string
4. after less then config.general.maxServerAge seconds re-register using the uuid in header.uuid

# config
Location: `./config.json`

| property | type | default | optional | description |
| --- | --- | --- | --- | --- |
| general | object | / | no | general settings |
| general.acceptHttp | boolean | false | yes | whether to accept http requests |
| general.registration | clientLocation | / | no | location that gets reserved for registering to this proxy |
| general.broadcast | clientLocation | null | yes | location that gets reserverd for broadcasting on this proxy |
| general.maxServerAge | number | 300000 | yes |milliseconds after which a server gets invalidated if it doesnt reauth |
| general.httpPorts | [number] | [80] | yes | array of http ports to listen on |
| general.httpsPorts | [number] | [] | yes | array of https ports to listen on |
| general.SECURE_CONTEXT | object | null | only when no httpsPorts provided | [options to pass to the https.createServer func](https://nodejs.org/api/https.html#https_https_createserver_options_requestlistener) |
| general.publicKey | string | / | no | location of the publicKey to confirm register requests |
| endpoints | [endpoint] | [] | yes | array of served endpoints |

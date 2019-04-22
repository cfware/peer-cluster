# @cfware/peer-cluster

[![Travis CI][travis-image]][travis-url]
[![Greenkeeper badge][gk-image]](https://greenkeeper.io/)
[![NPM Version][npm-image]][npm-url]
[![NPM Downloads][downloads-image]][downloads-url]
[![MIT][license-image]](LICENSE)

Websocket all-to-all connectivity cluster.

### Install @cfware/peer-cluster

This module requires node.js 12 or above with support for ESM modules.  This
has only been tested/used with `esm`.

```sh
npm i --save esm @cfware/peer-cluster
```

## Usage

```js
import {createServer} from 'http';

import pEvent from 'p-event';
import {PeerCluster} from '@cfware/peer-cluster';

(async () => {
	const httpd = createServer();
	httpd.listen(0);
	await pEvent(httpd, 'listening');

	const peerCluster = new PeerCluster({
		peerId: 'server1',
		origin: `ws://localhost:${httpd.address().port}/`,
		respond404: true
	});

	httpd.on('upgrade', (req, sock, head) => {
		cluster.tryUpgrade(req, sock, head);
	});
})();
```

## Running tests

Tests are provided by xo and ava.

```sh
npm install
npm test
```

[npm-image]: https://img.shields.io/npm/v/@cfware/peer-cluster.svg
[npm-url]: https://npmjs.org/package/@cfware/peer-cluster
[travis-image]: https://travis-ci.org/cfware/peer-cluster.svg?branch=master
[travis-url]: https://travis-ci.org/cfware/peer-cluster
[gk-image]: https://badges.greenkeeper.io/cfware/peer-cluster.svg
[downloads-image]: https://img.shields.io/npm/dm/@cfware/peer-cluster.svg
[downloads-url]: https://npmjs.org/package/@cfware/peer-cluster
[license-image]: https://img.shields.io/npm/l/@cfware/peer-cluster.svg

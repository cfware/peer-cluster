# @cfware/peer-cluster [![NPM Version][npm-image]][npm-url]

Websocket all-to-all connectivity cluster.

## Usage

```js
import {createServer} from 'http';
import {once} from 'events';

import {PeerCluster} from '@cfware/peer-cluster';

(async () => {
	const httpd = createServer();
	httpd.listen(0);
	await once(httpd, 'listening');

	const peerCluster = new PeerCluster({
		peerID: 'server1',
		origin: `ws://localhost:${httpd.address().port}/`,
		respond404: true
	});

	httpd.on('upgrade', cluster.tryUpgrade);
})();
```

[npm-image]: https://img.shields.io/npm/v/@cfware/peer-cluster.svg
[npm-url]: https://npmjs.org/package/@cfware/peer-cluster

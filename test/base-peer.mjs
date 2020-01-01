import t from 'libtap';

import {BasePeer} from '../lib/base-peer.mjs';
import {peerStop} from '../lib/protected-symbols.mjs';

t.test('lifecycle', async t => {
	const cluster = {};
	const peer = new BasePeer(cluster);
	t.equal(peer.cluster, cluster);
	t.equal(peer.stopping, false);

	t.equal(peer[peerStop](), false);
	t.equal(peer.stopping, true);

	t.equal(peer[peerStop](), true);
	t.equal(peer.stopping, true);
});

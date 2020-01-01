import t from 'libtap';

import {SelfPeer} from '../lib/self-peer.mjs';
import {peerStop} from '../lib/protected-symbols.mjs';

t.test('lifecycle', async t => {
	const cluster = {peerId: 'local', origin: 'ws://localhost/'};
	const peer = new SelfPeer(cluster);

	t.equal(peer.peerId, cluster.peerId);
	t.equal(peer.origin, cluster.origin);

	let gotMessage = 0;
	const message = {
		name: 'value'
	};

	peer.on('receive', data => {
		t.equal(data, message);
		gotMessage++;
	});

	t.equal(peer.stopping, false);
	t.equal(peer.isSelf, true);

	peer.send(message);
	t.equal(gotMessage, 1);

	t.equal(peer[peerStop](), false);
	t.equal(peer.stopping, true);

	peer.send(message);
	t.equal(gotMessage, 1);

	t.equal(peer[peerStop](), true);
	t.equal(peer.stopping, true);
});

import t from 'libtap';

import {SelfPeer} from '../lib/self-peer.js';
import {peerStop} from '../lib/protected-symbols.js';

t.test('lifecycle', async t => {
	const cluster = {peerID: 'local', origin: 'ws://localhost/'};
	const peer = new SelfPeer(cluster);

	t.equal(peer.peerID, cluster.peerID);
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

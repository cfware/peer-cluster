import test from 'ava';

import SelfPeer from '../lib/self-peer';
import {peerStop} from '../lib/protected-symbols';

import {filterMeta} from './helpers/filter-coverage';

filterMeta();

test('lifecycle', t => {
	const cluster = {peerId: 'local', origin: 'ws://localhost/'};
	const peer = new SelfPeer(cluster);

	t.is(peer.peerId, cluster.peerId);
	t.is(peer.origin, cluster.origin);

	let gotMsg = 0;
	const msg = {
		name: 'value'
	};

	peer.on('receive', message => {
		t.is(message, msg);
		gotMsg++;
	});

	t.false(peer.stopping);
	t.true(peer.isSelf);

	peer.send(msg);
	t.is(gotMsg, 1);

	t.false(peer[peerStop]());
	t.true(peer.stopping);

	peer.send(msg);
	t.is(gotMsg, 1);

	t.true(peer[peerStop]());
	t.true(peer.stopping);
});

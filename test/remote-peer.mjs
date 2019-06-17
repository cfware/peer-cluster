import t from 'libtap';

import {RemotePeer} from '../lib/remote-peer.mjs';
import {peerStop} from '../lib/protected-symbols.mjs';

import {assertInfo} from './_helpers.mjs';

t.test('errors', async t => {
	t.throws(() => new RemotePeer(null), {
		constructor: TypeError,
		message: /Cannot destructure property/u
	});
	t.throws(() => new RemotePeer(null, {origin: 'ws://localhost/', psk: 'psk'}), assertInfo('peerID'));
	t.throws(() => new RemotePeer(null, {peerID: '', origin: 'ws://localhost/', psk: 'psk'}), assertInfo('peerID'));
	t.throws(() => new RemotePeer(null, {peerID: 'local', psk: 'psk'}), assertInfo('origin'));
	t.throws(() => new RemotePeer(null, {peerID: 'local', origin: '', psk: 'psk'}), assertInfo('origin'));
	t.throws(() => new RemotePeer(null, {peerID: 'local', origin: 'ws://localhost/'}), assertInfo('psk'));
	t.throws(() => new RemotePeer(null, {peerID: 'local', origin: 'ws://localhost/', psk: ''}), assertInfo('psk'));
});

t.test('constructor', async t => {
	const remotePeer = new RemotePeer(null, {peerID: 'remote', origin: 'ws://remotehost/', psk: 'psk'});

	t.type(remotePeer, 'object');
	t.equal(remotePeer.cluster, null);
	t.equal(remotePeer.peerID, 'remote');
	t.equal(remotePeer.origin, 'ws://remotehost/');
	t.equal(remotePeer.connected, false);
	t.equal(remotePeer.stopping, false);
	t.equal(remotePeer.isSelf, false);

	remotePeer[peerStop]();
	t.equal(remotePeer.stopping, true);

	remotePeer[peerStop]();
	t.equal(remotePeer.stopping, true);
});

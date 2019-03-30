import test from 'ava';

import {RemotePeer} from '../lib/remote-peer';
import {peerStop} from '../lib/protected-symbols';

import {assertInfo} from './helpers/assert-info';
import {filterMeta} from './helpers/filter-coverage';

filterMeta();

test('errors', t => {
	t.throws(() => new RemotePeer(null), {
		instanceOf: TypeError,
		message: /Cannot destructure property/
	});
	t.throws(() => new RemotePeer(null, {origin: 'ws://localhost/', psk: 'psk'}), assertInfo('peerId'));
	t.throws(() => new RemotePeer(null, {peerId: '', origin: 'ws://localhost/', psk: 'psk'}), assertInfo('peerId'));
	t.throws(() => new RemotePeer(null, {peerId: 'local', psk: 'psk'}), assertInfo('origin'));
	t.throws(() => new RemotePeer(null, {peerId: 'local', origin: '', psk: 'psk'}), assertInfo('origin'));
	t.throws(() => new RemotePeer(null, {peerId: 'local', origin: 'ws://localhost/'}), assertInfo('psk'));
	t.throws(() => new RemotePeer(null, {peerId: 'local', origin: 'ws://localhost/', psk: ''}), assertInfo('psk'));
});

test('constructor', t => {
	const remotePeer = new RemotePeer(null, {peerId: 'remote', origin: 'ws://remotehost/', psk: 'psk'});

	t.is(typeof remotePeer, 'object');
	t.is(remotePeer.cluster, null);
	t.is(remotePeer.peerId, 'remote');
	t.is(remotePeer.origin, 'ws://remotehost/');
	t.is(remotePeer.psk, 'psk');
	t.false(remotePeer.connected);
	t.false(remotePeer.stopping);
	t.false(remotePeer.isSelf);

	remotePeer[peerStop]();
	t.true(remotePeer.stopping);

	remotePeer[peerStop]();
	t.true(remotePeer.stopping);
});

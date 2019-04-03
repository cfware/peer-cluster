import test from 'ava';
import delay from 'delay';
import pEvent from 'p-event';
import WebSocket from 'ws';

import {PeerCluster} from '../lib/peer-cluster';
import {oninterval} from '../lib/protected-symbols';

import {assertInfo} from './helpers/assert-info';
import {createCluster} from './helpers/test-cluster';
import {filterMeta} from './helpers/filter-coverage';

filterMeta();

test('constructor errors', t => {
	t.throws(() => new PeerCluster(), {
		instanceOf: Error,
		message: /Cannot read property '[^']*' of undefined/
	});
	t.throws(() => new PeerCluster({}), assertInfo('peerId'));

	t.throws(() => new PeerCluster({origin: 'a'}), assertInfo('peerId'));
	t.throws(() => new PeerCluster({peerId: true, origin: 'a'}), assertInfo('peerId'));
	t.throws(() => new PeerCluster({peerId: '', origin: 'a'}), assertInfo('peerId'));

	t.throws(() => new PeerCluster({peerId: 'a'}), assertInfo('origin'));
	t.throws(() => new PeerCluster({peerId: 'a', origin: true}), assertInfo('origin'));
	t.throws(() => new PeerCluster({peerId: 'a', origin: ''}), assertInfo('origin'));
});

test('constructor success', t => {
	const cluster = new PeerCluster({peerId: 'local', origin: 'ws://localhost/'});

	t.is(cluster.findPeer('local'), cluster.selfPeer);
	t.is(cluster.pathname, '/');
	t.is(cluster.peerId, 'local');
	t.is(cluster.origin, 'ws://localhost/');
	t.is(cluster.activityCheckInterval, 1000);
	t.is(cluster.inactivityPingLocal, 4000);
	t.is(cluster.inactivityPingRemote, 6000);
	t.is(cluster.inactivityPingFatal, 10000);
	t.is(cluster.handshakeTimeout, 2000);
	t.false(cluster.respond404);
	t.false(cluster.stopping);

	t.is(cluster.selfPeer.peerId, 'local');
	t.is(cluster.selfPeer.origin, 'ws://localhost/');
	t.is(cluster.peers.length, 0);

	cluster.stop();
	t.false(cluster.stopping);

	const cluster2 = new PeerCluster({
		peerId: 'local',
		origin: 'ws://localhost/',
		activityCheckInterval: 100,
		inactivityPingLocal: 400,
		inactivityPingRemote: 600,
		inactivityPingFatal: 1000,
		handshakeTimeout: 200,
		respond404: true
	});

	t.is(cluster2.activityCheckInterval, 100);
	t.is(cluster2.inactivityPingLocal, 400);
	t.is(cluster2.inactivityPingRemote, 600);
	t.is(cluster2.inactivityPingFatal, 1000);
	t.is(cluster2.handshakeTimeout, 200);
	t.true(cluster2.respond404);
});

test('addPeer', t => {
	const cluster = new PeerCluster({peerId: 'local', origin: 'ws://localhost/'});

	const localServerError = {
		instanceOf: Error,
		message: 'addPeer cannot match local server'
	};
	t.throws(() => cluster.addPeer({peerId: 'local', origin: 'ws://local/', psk: 'psk'}), localServerError);
	t.throws(() => cluster.addPeer({peerId: 'localhost', origin: 'ws://localhost/', psk: 'psk'}), localServerError);

	const remotePeer = cluster.addPeer({peerId: 'remote', origin: 'ws://remotehost/', psk: 'psk'});

	t.is(remotePeer.cluster, cluster);
	t.false(remotePeer.isSelf);
	t.is(cluster.peers.length, 1);
	t.is(cluster.findPeer('remote'), remotePeer);

	const remoteServerError = {
		instanceOf: Error,
		message: 'Duplicate peerId or origin'
	};
	t.throws(() => cluster.addPeer({peerId: 'remote2', origin: 'ws://remotehost/', psk: 'psk'}), remoteServerError);
	t.throws(() => cluster.addPeer({peerId: 'remote', origin: 'ws://remotehost2/', psk: 'psk'}), remoteServerError);
});

test('removePeer', t => {
	const cluster = new PeerCluster({peerId: 'local', origin: 'ws://localhost/'});
	const remotePeer = cluster.addPeer({peerId: 'remote', origin: 'ws://remotehost/', psk: 'psk'});

	t.is(cluster.findPeer('remote'), remotePeer);

	t.notThrows(() => cluster.removePeer('remote'));
	t.is(cluster.peers.length, 0);
	t.is(cluster.findPeer('local'), cluster.selfPeer);
	t.is(cluster.findPeer('remote'), undefined);

	t.throws(() => cluster.removePeer('remote'), {
		instanceOf: Error,
		message: 'Peer \'remote\' does not exist.'
	});

	t.throws(() => cluster.removePeer('local'), {
		instanceOf: Error,
		message: 'Cannot remove selfPeer.'
	});
});

test('stand alone', async t => {
	const cluster = new PeerCluster({peerId: 'local', origin: 'ws://localhost/'});
	const local = cluster.selfPeer;
	const data = {name: 'value'};
	let msgCount = 0;

	local.on('receive', message => {
		t.is(message, data);
		msgCount++;
	});

	t.notThrows(() => cluster.start());
	t.true(cluster.active);

	let {lastInterval} = cluster;
	t.notThrows(() => cluster.start());
	t.true(cluster.active);
	t.is(cluster.lastInterval, lastInterval);

	cluster.send(data);
	t.is(msgCount, 0);

	cluster.send(data, []);
	t.is(msgCount, 0);

	t.throws(() => cluster.send(data, ['unknown']), {
		instanceOf: Error,
		message: 'PeerId \'unknown\' not found'
	});

	t.throws(() => cluster.send(data, [{}]), {
		instanceOf: TypeError,
		message: 'Invalid peer at index 0'
	});

	cluster.send(data, ['local']);
	t.is(msgCount, 1);

	cluster.send(data, 'local');
	t.is(msgCount, 2);

	cluster.send(data, true);
	t.is(msgCount, 3);

	cluster.send(data, [local]);
	t.is(msgCount, 4);

	cluster.send(data, local);
	t.is(msgCount, 5);

	await delay(1500);
	t.true(cluster.lastInterval > 0);

	lastInterval = cluster.lastInterval;
	cluster.stop();

	t.true(cluster.stopping);
	t.false(cluster.active);
	t.true(local.stopping);

	await delay(1500);
	t.is(cluster.lastInterval, lastInterval);

	// Test race where we stop after the setInterval callback has already been scheduled.
	cluster[oninterval]();
	t.is(cluster.lastInterval, lastInterval);
});

test('tryUpgrade wrong pathname', t => {
	t.false((new PeerCluster({peerId: 'local', origin: 'ws://localhost/'})).tryUpgrade(null, null, null, {pathname: '/path'}));
	t.false((new PeerCluster({peerId: 'local', origin: 'ws://localhost/path'})).tryUpgrade(null, null, null, {pathname: '/'}));
});

test('tryUpgrade rejections', async t => {
	let gotError = 0;
	let expectError = 401;
	const wsTest = async (url, origin) => {
		const ws = new WebSocket(url, {
			headers: {
				'x-connection-serial': Date.now()
			},
			origin,
			perMessageDeflate: false
		});
		ws.on('unexpected-response', (req, res) => {
			gotError++;
			t.is(res.statusCode, expectError);
		});

		await pEvent(ws, 'unexpected-response');
	};

	const {cluster, httpd} = await createCluster(t, '/', 'local', {respond404: true});
	cluster.addPeer({
		peerId: 'remote',
		origin: 'ws://remotehost/',
		psk: 'psk'
	});

	await wsTest(`${cluster.origin}?psk=psk1`, 'ws://remotehost/');
	t.is(gotError, 1);

	await wsTest(`${cluster.origin}`, 'ws://remotehost/');
	t.is(gotError, 2);

	await wsTest(`${cluster.origin}?psk=psk`, 'ws://remotehost2/');
	t.is(gotError, 3);

	expectError = 404;
	await wsTest(`${cluster.origin}404?psk=psk`, 'ws://remotehost/');
	t.is(gotError, 4);

	httpd.close();
});

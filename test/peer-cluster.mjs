import {promisify} from 'util';
import {once} from 'events';

import t from 'libtap';
import WebSocket from 'ws';

import {PeerCluster} from '../lib/peer-cluster.mjs';
import {oninterval} from '../lib/protected-symbols.mjs';

import {assertInfo, createCluster} from './_helpers.mjs';

const delay = promisify(setTimeout);

t.test('constructor errors', async t => {
	t.throws(() => new PeerCluster(), {
		constructor: TypeError,
		message: /Cannot read property '[^']*' of undefined/u
	});
	t.throws(() => new PeerCluster({}), assertInfo('peerID'));

	t.throws(() => new PeerCluster({origin: 'a'}), assertInfo('peerID'));
	t.throws(() => new PeerCluster({peerID: true, origin: 'a'}), assertInfo('peerID'));
	t.throws(() => new PeerCluster({peerID: '', origin: 'a'}), assertInfo('peerID'));

	t.throws(() => new PeerCluster({peerID: 'a'}), assertInfo('origin'));
	t.throws(() => new PeerCluster({peerID: 'a', origin: true}), assertInfo('origin'));
	t.throws(() => new PeerCluster({peerID: 'a', origin: ''}), assertInfo('origin'));
});

t.test('constructor success', async t => {
	const cluster = new PeerCluster({peerID: 'local', origin: 'ws://localhost/'});

	t.equal(cluster.findPeer('local'), cluster.selfPeer);
	t.equal(cluster.pathname, '/');
	t.equal(cluster.peerID, 'local');
	t.equal(cluster.origin, 'ws://localhost/');
	t.equal(cluster.activityCheckInterval, 1000);
	t.equal(cluster.inactivityPingLocal, 4000);
	t.equal(cluster.inactivityPingRemote, 6000);
	t.equal(cluster.inactivityPingFatal, 10000);
	t.equal(cluster.handshakeTimeout, 2000);
	t.equal(cluster.respond404, false);
	t.equal(cluster.stopping, false);

	t.equal(cluster.selfPeer.peerID, 'local');
	t.equal(cluster.selfPeer.origin, 'ws://localhost/');
	t.equal(cluster.peers.length, 0);

	cluster.stop();
	t.equal(cluster.stopping, false);

	const cluster2 = new PeerCluster({
		peerID: 'local',
		origin: 'ws://localhost/',
		activityCheckInterval: 100,
		inactivityPingLocal: 400,
		inactivityPingRemote: 600,
		inactivityPingFatal: 1000,
		handshakeTimeout: 200,
		respond404: true
	});

	t.equal(cluster2.activityCheckInterval, 100);
	t.equal(cluster2.inactivityPingLocal, 400);
	t.equal(cluster2.inactivityPingRemote, 600);
	t.equal(cluster2.inactivityPingFatal, 1000);
	t.equal(cluster2.handshakeTimeout, 200);
	t.equal(cluster2.respond404, true);
});

t.test('addPeer', async t => {
	const cluster = new PeerCluster({peerID: 'local', origin: 'ws://localhost/'});

	const localServerError = new Error('addPeer cannot match local server');
	t.throws(() => cluster.addPeer({peerID: 'local', origin: 'ws://local/', psk: 'psk'}), localServerError);
	t.throws(() => cluster.addPeer({peerID: 'localhost', origin: 'ws://localhost/', psk: 'psk'}), localServerError);

	const remotePeer = cluster.addPeer({peerID: 'remote', origin: 'ws://remotehost/', psk: 'psk'});

	t.equal(remotePeer.cluster, cluster);
	t.equal(remotePeer.isSelf, false);
	t.equal(cluster.peers.length, 1);
	t.equal(cluster.findPeer('remote'), remotePeer);

	const remoteServerError = new Error('Duplicate peerID or origin');
	t.throws(() => cluster.addPeer({peerID: 'remote2', origin: 'ws://remotehost/', psk: 'psk'}), remoteServerError);
	t.throws(() => cluster.addPeer({peerID: 'remote', origin: 'ws://remotehost2/', psk: 'psk'}), remoteServerError);
});

t.test('removePeer', async t => {
	const cluster = new PeerCluster({peerID: 'local', origin: 'ws://localhost/'});
	const remotePeer = cluster.addPeer({peerID: 'remote', origin: 'ws://remotehost/', psk: 'psk'});

	t.equal(cluster.findPeer('remote'), remotePeer);

	cluster.removePeer('remote');
	t.equal(cluster.peers.length, 0);
	t.equal(cluster.findPeer('local'), cluster.selfPeer);
	t.equal(cluster.findPeer('remote'), undefined);

	t.throws(() => cluster.removePeer('remote'), new Error('Peer \'remote\' does not exist.'));
	t.throws(() => cluster.removePeer('local'), new Error('Cannot remove selfPeer.'));
});

t.test('stand alone', async t => {
	const cluster = new PeerCluster({peerID: 'local', origin: 'ws://localhost/'});
	const local = cluster.selfPeer;
	const data = {name: 'value'};
	let messageCount = 0;

	local.on('receive', message => {
		t.equal(message, data);
		messageCount++;
	});

	cluster.start();
	t.equal(cluster.active, true);

	let {lastInterval} = cluster;
	cluster.start();
	t.equal(cluster.active, true);
	t.equal(cluster.lastInterval, lastInterval);

	cluster.send(data);
	t.equal(messageCount, 0);

	cluster.send(data, []);
	t.equal(messageCount, 0);

	t.throws(() => cluster.send(data, ['unknown']), new Error('Could not find peerID \'unknown\''));
	t.throws(() => cluster.send(data, [{}]), new TypeError('Invalid peer at index 0'));

	cluster.send(data, ['local']);
	t.equal(messageCount, 1);

	cluster.send(data, 'local');
	t.equal(messageCount, 2);

	cluster.send(data, true);
	t.equal(messageCount, 3);

	cluster.send(data, [local]);
	t.equal(messageCount, 4);

	cluster.send(data, local);
	t.equal(messageCount, 5);

	await delay(1500);
	t.ok(cluster.lastInterval > 0);

	lastInterval = cluster.lastInterval;
	cluster.stop();

	t.equal(cluster.stopping, true);
	t.equal(cluster.active, false);
	t.equal(local.stopping, true);

	await delay(1500);
	t.equal(cluster.lastInterval, lastInterval);

	// Test race where we stop after the setInterval callback has already been scheduled.
	cluster[oninterval]();
	t.equal(cluster.lastInterval, lastInterval);
});

t.test('tryUpgrade wrong pathname', async t => {
	t.equal((new PeerCluster({peerID: 'local', origin: 'ws://localhost/'})).tryUpgrade(null, null, null, {pathname: '/path'}), false);
	t.equal((new PeerCluster({peerID: 'local', origin: 'ws://localhost/path'})).tryUpgrade(null, null, null, {pathname: '/'}), false);
});

t.test('tryUpgrade rejections', async t => {
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
		ws.on('unexpected-response', (request, response) => {
			gotError++;
			t.equal(response.statusCode, expectError);
		});

		await once(ws, 'unexpected-response');
	};

	const {cluster, httpd} = await createCluster(t, '/', 'local', {respond404: true});
	cluster.addPeer({
		peerID: 'remote',
		origin: 'ws://remotehost/',
		psk: 'psk'
	});

	await wsTest(`${cluster.origin}?psk=psk1`, 'ws://remotehost/');
	t.equal(gotError, 1);

	await wsTest(`${cluster.origin}`, 'ws://remotehost/');
	t.equal(gotError, 2);

	await wsTest(`${cluster.origin}?psk=psk`, 'ws://remotehost2/');
	t.equal(gotError, 3);

	expectError = 404;
	await wsTest(`${cluster.origin}404?psk=psk`, 'ws://remotehost/');
	t.equal(gotError, 4);

	httpd.close();
});

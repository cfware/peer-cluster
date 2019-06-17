import {createServer} from 'http';
import {promisify} from 'util';
import {once} from 'events';

import t from 'libtap';
import WebSocket from 'ws';

import {outboundWS} from '../lib/protected-symbols.mjs';

import {createCluster, createClusters, stopClusters} from './_helpers.mjs';

const delay = promisify(setTimeout);

t.test('connection on start', async t => {
	const clusters = await createClusters(t, 2);
	const msgsFrom = from => [{message: {from}, peerID: from}];
	const testPeer = clusters[0].cluster.peers[0];
	const ws = testPeer[outboundWS];

	testPeer.tryOutbound();
	t.equal(testPeer[outboundWS], ws);
	const connected = new Set();
	clusters.forEach(({cluster}) => {
		cluster
			.on('connected', peer => connected.add(peer))
			.on('disconnected', peer => connected.delete(peer));
	});

	await delay(100);
	clusters.forEach(({cluster}) => {
		t.ok(connected.has(cluster.peers[0]));
		t.equal(cluster.peers[0].connected, true);
	});
	t.equal(connected.size, 2);

	let iter = 0;
	do {
		clusters.forEach(({cluster}) => {
			/* The second argument cluster.peers is effectively the
			 * default but this verifies that RemotePeer objects are
			 * accepted in the second argument of cluster.send.  */
			cluster.send({from: cluster.peerID}, cluster.peers);
		});

		await delay(100); // eslint-disable-line no-await-in-loop
		t.same(clusters.map(a => a.msgs), [
			msgsFrom('server2'),
			msgsFrom('server1')
		]);

		stopClusters(clusters);
		clusters.forEach(({cluster}) => {
			t.equal(cluster.peers[0].connected, false);
		});
		t.equal(connected.size, iter ? 0 : 2);
		iter++;
	} while (iter < 2);
});

t.test('stop while connecting', async t => {
	const clusters = await createClusters(t, 2);
	const peers = [];
	clusters.map(c => c.cluster).forEach(cluster => {
		peers.push(...cluster.peers);
	});
	const wsList = peers.map(peer => peer[outboundWS]).filter(ws => ws);
	wsList.forEach(ws => {
		t.equal(ws.readyState, 0);
	});

	stopClusters(clusters);

	wsList.forEach(ws => {
		t.equal(ws.readyState, 2);
	});

	await delay(100);

	wsList.forEach(ws => {
		t.equal(ws.readyState, 3);
	});
});

t.test('tryUpgrade success', async t => {
	const {cluster, httpd} = await createCluster(t, '/', 'local');
	const remote = cluster.addPeer({peerID: 'remote', origin: 'ws://remotehost/', psk: 'psk2'});

	const ws = new WebSocket(`${cluster.origin}?psk=psk2`, {
		headers: {
			'x-connection-serial': Date.now()
		},
		origin: 'ws://remotehost/',
		perMessageDeflate: false
	});

	const message = {name: 'value'};
	let gotMessage = 0;
	let gotPing = 0;
	let gotPong = 0;
	ws
		.on('unexpected-response', (request, response) => t.fail(`unexpected-response: ${response.statusCode}`))
		.on('error', error => t.fail(`error: ${error.message}`))
		.on('pong', () => {
			gotPong++;
		})
		.on('ping', () => {
			gotPing++;
		})
		.on('message', data => {
			gotMessage++;
			t.same(JSON.parse(data), message);
		});

	await once(ws, 'open');

	ws.ping();
	await once(ws, 'pong');
	t.equal(gotPong, 1);

	cluster.send(message);
	await once(ws, 'message');
	t.equal(gotMessage, 1);

	/* Needed to allow cluster[oninterval]() to execute */
	cluster.start();
	await delay(500);

	t.equal(Math.round(remote.inactiveTime / 1000), 0);
	t.equal(gotPing, 0);

	await delay(5000);
	t.equal(gotPing, 0);
	t.equal(Math.round(remote.inactiveTime / 1000), 5);

	await delay(1000);
	t.equal(gotPing, 1);
	t.equal(remote.inactiveTime, 0);

	cluster.stop();
	t.equal(cluster.stopping, true);
	t.equal(remote.stopping, true);

	ws.close();
	httpd.close();
});

t.test('tryOutbound ping', async t => {
	const wss = new WebSocket.Server({
		noServer: true,
		clientTracking: false,
		perMessageDeflate: false
	});
	let testWS;
	const httpdTest = createServer();
	httpdTest.listen(0);
	await once(httpdTest, 'listening');
	httpdTest.on('upgrade', (request, socket, head) => {
		wss.handleUpgrade(request, socket, head, ws => {
			testWS = ws;
		});
	});

	const {cluster, httpd} = await createCluster(t, '/', 'local');
	const remote = cluster.addPeer({
		peerID: 'remote',
		origin: `ws://localhost:${httpdTest.address().port}/`,
		psk: 'psk2'
	});

	cluster.start();

	await delay(500);

	let gotPing = 0;
	testWS.on('ping', () => {
		gotPing++;
	});

	t.equal(Math.round(remote.inactiveTime / 1000), 0);
	t.equal(gotPing, 0);

	await delay(3000);
	t.equal(gotPing, 0);
	t.equal(Math.round(remote.inactiveTime / 1000), 3);

	await delay(1000);
	t.equal(gotPing, 1);
	t.equal(remote.inactiveTime, 0);

	cluster.stop();
	testWS.close();
	httpdTest.close();
	httpd.close();
});

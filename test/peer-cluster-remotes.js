import path from 'path';
import {createServer} from 'http';

import test from 'ava';
import delay from 'delay';
import pEvent from 'p-event';
import WebSocket from 'ws';

import {outboundWS} from '../lib/protected-symbols';

import {filterCoverage, createCluster, createClusters, stopClusters} from './_helpers';

const libdir = path.resolve(__dirname, '..', 'lib');
filterCoverage(
	path.join(libdir, 'peer-cluster.js'),
	path.join(libdir, 'remote-peer.js')
);
test('connection on start', async t => {
	const clusters = await createClusters(t, 2);
	const msgsFrom = from => [{message: {from}, peerId: from}];
	const testPeer = clusters[0].cluster.peers[0];
	const ws = testPeer[outboundWS];

	testPeer.tryOutbound();
	t.is(testPeer[outboundWS], ws);
	const connected = new Set();
	clusters.forEach(({cluster}) => {
		cluster
			.on('connected', peer => connected.add(peer))
			.on('disconnected', peer => connected.delete(peer));
	});

	await delay(100);
	clusters.forEach(({cluster}) => {
		t.true(connected.has(cluster.peers[0]));
		t.true(cluster.peers[0].connected);
	});
	t.is(connected.size, 2);

	let iter = 0;
	do {
		clusters.forEach(({cluster}) => {
			/* The second argument cluster.peers is effectively the
			 * default but this verifies that RemotePeer objects are
			 * accepted in the second argument of cluster.send.  */
			cluster.send({from: cluster.peerId}, cluster.peers);
		});

		await delay(100); // eslint-disable-line no-await-in-loop
		t.deepEqual(clusters.map(a => a.msgs), [
			msgsFrom('server2'),
			msgsFrom('server1')
		]);

		stopClusters(clusters);
		clusters.forEach(({cluster}) => {
			t.false(cluster.peers[0].connected);
		});
		t.is(connected.size, iter ? 0 : 2);
		iter++;
	} while (iter < 2);
});

test('stop while connecting', async t => {
	const clusters = await createClusters(t, 2);
	const peers = [];
	clusters.map(c => c.cluster).forEach(cluster => {
		peers.push(...cluster.peers);
	});
	const wsList = peers.map(peer => peer[outboundWS]).filter(ws => ws);
	wsList.forEach(ws => {
		t.is(ws.readyState, 0);
	});

	stopClusters(clusters);

	wsList.forEach(ws => {
		t.is(ws.readyState, 2);
	});

	await delay(100);

	wsList.forEach(ws => {
		t.is(ws.readyState, 3);
	});
});

test('tryUpgrade success', async t => {
	const {cluster, httpd} = await createCluster(t, '/', 'local');
	const remote = cluster.addPeer({peerId: 'remote', origin: 'ws://remotehost/', psk: 'psk2'});

	const ws = new WebSocket(`${cluster.origin}?psk=psk2`, {
		headers: {
			'x-connection-serial': Date.now()
		},
		origin: 'ws://remotehost/',
		perMessageDeflate: false
	});

	const msg = {name: 'value'};
	let gotMsg = 0;
	let gotPing = 0;
	let gotPong = 0;
	ws
		.on('unexpected-response', (req, res) => t.fail(`unexpected-response: ${res.statusCode}`))
		.on('error', error => t.fail(`error: ${error.message}`))
		.on('pong', () => {
			gotPong++;
		})
		.on('ping', () => {
			gotPing++;
		})
		.on('message', data => {
			gotMsg++;
			t.deepEqual(JSON.parse(data), msg);
		});

	await pEvent(ws, 'open');

	ws.ping();
	await pEvent(ws, 'pong');
	t.is(gotPong, 1);

	cluster.send(msg);
	await pEvent(ws, 'message');
	t.is(gotMsg, 1);

	/* Needed to allow cluster[oninterval]() to execute */
	cluster.start();
	await delay(500);

	t.is(Math.round(remote.inactiveTime / 1000), 0);
	t.is(gotPing, 0);

	await delay(5000);
	t.is(gotPing, 0);
	t.is(Math.round(remote.inactiveTime / 1000), 5);

	await delay(1000);
	t.is(gotPing, 1);
	t.is(remote.inactiveTime, 0);

	cluster.stop();
	t.true(cluster.stopping);
	t.true(remote.stopping);

	ws.close();
	httpd.close();
});

test('tryOutbound ping', async t => {
	const wss = new WebSocket.Server({
		noServer: true,
		clientTracking: false,
		perMessageDeflate: false
	});
	let testWS;
	const httpdTest = createServer();
	httpdTest.listen(0);
	await pEvent(httpdTest, 'listening');
	httpdTest.on('upgrade', (req, sock, head) => {
		wss.handleUpgrade(req, sock, head, ws => {
			testWS = ws;
		});
	});

	const {cluster, httpd} = await createCluster(t, '/', 'local');
	const remote = cluster.addPeer({
		peerId: 'remote',
		origin: `ws://localhost:${httpdTest.address().port}/`,
		psk: 'psk2'
	});

	cluster.start();

	await delay(500);

	let gotPing = 0;
	testWS.on('ping', () => {
		gotPing++;
	});

	t.is(Math.round(remote.inactiveTime / 1000), 0);
	t.is(gotPing, 0);

	await delay(3000);
	t.is(gotPing, 0);
	t.is(Math.round(remote.inactiveTime / 1000), 3);

	await delay(1000);
	t.is(gotPing, 1);
	t.is(remote.inactiveTime, 0);

	cluster.stop();
	testWS.close();
	httpdTest.close();
	httpd.close();
});

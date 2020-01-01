import {once} from 'events';
import {createServer} from 'http';

import {PeerCluster} from '../lib/peer-cluster.mjs';

export function assertInfo(fieldname) {
	return new TypeError(`${fieldname} must be non-empty a string`);
}

export async function createCluster(t, pathname, peerId, moreSettings = {}) {
	const httpd = createServer();
	httpd.listen(0);
	await once(httpd, 'listening');

	const cluster = new PeerCluster({
		peerId,
		origin: `ws://localhost:${httpd.address().port}${pathname}`,
		...moreSettings
	});
	httpd.on('upgrade', (request, socket, head) => {
		t.equal(cluster.tryUpgrade(request, socket, head), true);
	});

	return {cluster, httpd};
}

export function addToCluster(cluster, psk, {peerId, origin}) {
	return cluster.addPeer({peerId, origin, psk});
}

export async function createClusters(t, count) {
	const clusters = await Promise.all(
		new Array(count).fill()
			.map((item, idx) => createCluster(t, '/', `server${idx + 1}`))
	);

	clusters.forEach(clusterObject1 => {
		clusterObject1.msgs = [];
		clusterObject1.cluster.on('receive', ({peerId}, message) => {
			clusterObject1.msgs.push({message, peerId});
		});

		clusters.filter(a => a !== clusterObject1).forEach(clusterObject2 => {
			addToCluster(clusterObject1.cluster, 'psk', clusterObject2.cluster);
		});
	});

	clusters.forEach(cluster => {
		cluster.cluster.start();
	});

	return clusters;
}

export function stopClusters(clusters) {
	clusters.forEach(({cluster, httpd}) => {
		httpd.close();
		cluster.stop();
	});
}
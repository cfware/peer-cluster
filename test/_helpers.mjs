import {once} from 'events';
import {createServer} from 'http';

import {PeerCluster} from '../lib/peer-cluster.mjs';

export function assertInfo(fieldname) {
	return new TypeError(`${fieldname} must be non-empty a string`);
}

export async function createCluster(t, pathname, peerID, moreSettings = {}) {
	const httpd = createServer();
	httpd.listen(0);
	await once(httpd, 'listening');

	const cluster = new PeerCluster({
		peerID,
		origin: `ws://localhost:${httpd.address().port}${pathname}`,
		...moreSettings
	});
	httpd.on('upgrade', (request, socket, head) => {
		// Verify that tryUpgrade is bound to cluster
		const {tryUpgrade} = cluster;
		t.equal(tryUpgrade(request, socket, head), true);
	});

	return {cluster, httpd};
}

export function addToCluster(cluster, psk, {peerID, origin}) {
	return cluster.addPeer({peerID, origin, psk});
}

export async function createClusters(t, count) {
	const clusters = await Promise.all(
		new Array(count).fill()
			.map((item, idx) => createCluster(t, '/', `server${idx + 1}`))
	);

	clusters.forEach(clusterObject1 => {
		clusterObject1.msgs = [];
		clusterObject1.cluster.on('receive', ({peerID}, message) => {
			clusterObject1.msgs.push({message, peerID});
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

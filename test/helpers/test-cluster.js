import {createServer} from 'http';
import pEvent from 'p-event';

import {PeerCluster} from '../../lib/peer-cluster';

export async function createCluster(t, pathname, peerId, moreSettings = {}) {
	const httpd = createServer();
	httpd.listen(0);
	await pEvent(httpd, 'listening');

	const cluster = new PeerCluster({
		peerId,
		origin: `ws://localhost:${httpd.address().port}${pathname}`,
		...moreSettings
	});
	httpd.on('upgrade', (req, sock, head) => {
		t.true(cluster.tryUpgrade(req, sock, head));
	});

	return {cluster, httpd};
}

export function addToCluster(cluster, psk, {peerId, origin}) {
	return cluster.addPeer({peerId, origin, psk});
}

export async function createClusters(t, count) {
	const clusters = await Promise.all(new Array(count).fill().map((item, idx) => createCluster(t, '/', `server${idx + 1}`)));
	clusters.forEach(clusterObj1 => {
		clusterObj1.msgs = [];
		clusterObj1.cluster.on('receive', (message, {peerId}) => {
			clusterObj1.msgs.push({message, peerId});
		});

		clusters.filter(a => a !== clusterObj1).forEach(clusterObj2 => {
			addToCluster(clusterObj1.cluster, 'psk', clusterObj2.cluster);
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

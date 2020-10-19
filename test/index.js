import t from 'libtap';

import {PeerCluster} from '../lib/peer-cluster.js';

t.test('exports', async t => {
	t.same(await import('../lib/index.js'), {PeerCluster});
});

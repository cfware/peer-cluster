import t from 'libtap';

import {PeerCluster} from '../lib/peer-cluster.mjs';

t.test('exports', async t => {
	t.same(await import('../lib/index.mjs'), {PeerCluster});
});

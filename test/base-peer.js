import test from 'ava';

import BasePeer from '../lib/base-peer';
import {peerStop} from '../lib/protected-symbols';

import {filterMeta} from './helpers/filter-coverage';

filterMeta();

test('lifecycle', t => {
	const cluster = {};
	const peer = new BasePeer(cluster);
	t.is(peer.cluster, cluster);
	t.false(peer.stopping);

	t.false(peer[peerStop]());
	t.true(peer.stopping);

	t.true(peer[peerStop]());
	t.true(peer.stopping);
});

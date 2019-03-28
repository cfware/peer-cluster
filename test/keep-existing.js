import test from 'ava';

import keepExisting from '../lib/keep-existing';

import {filterMeta} from './helpers/filter-coverage';

filterMeta();

test('results', t => {
	const srvOrder = [
		['srv1', 'srv2'],
		['srv2', 'srv1']
	];

	srvOrder.forEach((order, idx) => {
		t.true(keepExisting(1, false, 0, ...order));
		t.true(keepExisting(1, true, 0, ...order));

		t.is(keepExisting(1, true, 1, ...order), idx === 0);
		t.is(keepExisting(1, false, 1, ...order), idx !== 0);

		t.false(keepExisting(0, false, 1, ...order));
		t.false(keepExisting(0, true, 1, ...order));
	});
});

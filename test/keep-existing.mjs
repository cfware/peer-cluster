import t from 'libtap';

import {keepExisting} from '../lib/keep-existing.mjs';

t.test('results', async t => {
	const srvOrder = [
		['srv1', 'srv2'],
		['srv2', 'srv1']
	];

	srvOrder.forEach((order, idx) => {
		t.equal(keepExisting(1, false, 0, ...order), true);
		t.equal(keepExisting(1, true, 0, ...order), true);

		t.equal(keepExisting(1, true, 1, ...order), idx === 0);
		t.equal(keepExisting(1, false, 1, ...order), idx !== 0);

		t.equal(keepExisting(0, false, 1, ...order), false);
		t.equal(keepExisting(0, true, 1, ...order), false);
	});
});

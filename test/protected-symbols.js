import test from 'ava';

import * as protectedSymbols from '../lib/protected-symbols';

import {filterMeta} from './helpers/filter-coverage';

filterMeta();

test('export', t => {
	t.is(typeof protectedSymbols, 'object');
	/* BUGBUG: t.snapshot(Object.keys(protectedSymbols).sort()); */
});

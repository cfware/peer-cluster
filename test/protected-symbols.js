import test from 'ava';

import * as protectedSymbols from '../lib/protected-symbols';

import {filterMeta} from './helpers/filter-coverage';

filterMeta();

test('export', t => {
	t.snapshot(Object.keys(protectedSymbols).sort());
});

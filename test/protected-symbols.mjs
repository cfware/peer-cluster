import t from 'libtap';

import * as protectedSymbols from '../lib/protected-symbols.mjs';

t.test('export', async t => {
	t.matchSnapshot(Object.keys(protectedSymbols).sort());
});

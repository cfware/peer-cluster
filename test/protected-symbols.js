import t from 'libtap';

import * as protectedSymbols from '../lib/protected-symbols.js';

t.test('export', async t => {
	t.matchSnapshot(Object.keys(protectedSymbols).sort());
});

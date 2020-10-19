import path from 'path';
import {readdirSync} from 'fs';
import {fileURLToPath} from 'url';
import {cpus} from 'os';

import t from 'libtap';

const testDirectory = fileURLToPath(new URL('test', import.meta.url));

t.jobs = cpus().length;

for (const file of readdirSync(testDirectory)) {
	if (file.startsWith('_')) {
		continue;
	}

	t.spawn(
		process.execPath,
		['--experimental-loader', '@istanbuljs/esm-loader-hook', path.join(testDirectory, file)],
		file
	);
}

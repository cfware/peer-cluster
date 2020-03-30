import path from 'path';
import {readdirSync} from 'fs';
import {fileURLToPath} from 'url';
import {cpus} from 'os';

import t from 'libtap';

const testDirectory = path.join(path.dirname(fileURLToPath(import.meta.url)), 'test');

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

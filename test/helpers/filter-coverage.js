/* global __coverage__ */
import path from 'path';
import {meta} from 'ava'; // eslint-disable-line ava/use-test

export function filterCoverage(...files) {
	if (!('NYC_ROOT_ID' in process.env)) {
		return;
	}

	Object.keys(__coverage__ || {}).forEach(file => {
		if (!files.includes(file)) {
			delete __coverage__[file];
		}
	});
}

export function filterMeta() {
	const file = path.basename(meta.file);
	const dir = path.dirname(meta.file);

	filterCoverage(path.resolve(dir, '..', 'lib', file));
}

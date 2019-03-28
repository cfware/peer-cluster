import test from 'ava';

import assertNonEmptyString from '../lib/assert-non-empty-string';

import {assertInfo} from './helpers/assert-info';
import {filterMeta} from './helpers/filter-coverage';

filterMeta();

test('not a string', t => {
	t.throws(() => assertNonEmptyString(undefined, 'field1'), assertInfo('field1'));
	t.throws(() => assertNonEmptyString(null, 'field2'), assertInfo('field2'));
	t.throws(() => assertNonEmptyString(false, 'field3'), assertInfo('field3'));
	t.throws(() => assertNonEmptyString(0, 'field4'), assertInfo('field4'));
	t.throws(() => assertNonEmptyString(1.5, 'field5'), assertInfo('field5'));
	t.throws(() => assertNonEmptyString({}, 'field6'), assertInfo('field6'));
	t.throws(() => assertNonEmptyString([], 'field7'), assertInfo('field7'));
});

test('empty string', t => {
	t.throws(() => assertNonEmptyString('', 'field8'), assertInfo('field8'));
});

test('non-empty string', t => {
	t.notThrows(() => assertNonEmptyString('a', 'field9'));
});

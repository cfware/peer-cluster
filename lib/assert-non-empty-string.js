'use strict';

function assertNonEmptyString(value, field) {
	if (typeof value !== 'string' || value.length === 0) {
		throw new TypeError(`${field} must be non-empty a string`);
	}
}

module.exports = assertNonEmptyString;

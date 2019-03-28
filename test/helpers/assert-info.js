export function assertInfo(fieldname) {
	return {
		instanceOf: TypeError,
		message: `${fieldname} must be non-empty a string`
	};
}

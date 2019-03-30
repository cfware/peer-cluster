'use strict';

module.exports = {
	plugins: [
		'@babel/plugin-transform-modules-commonjs',
		'@babel/plugin-proposal-class-properties'
	],
	env: {
		test: {
			plugins: ['istanbul']
		}
	}
};

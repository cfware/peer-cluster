'use strict';

const EventEmitter = require('events');
const {peerStop} = require('./protected-symbols');

class BasePeer extends EventEmitter {
	constructor(cluster) {
		super();

		Object.assign(this, {
			stopping: false,
			cluster
		});
	}

	[peerStop]() {
		const ret = this.stopping;

		this.removeAllListeners('receive');
		this.stopping = true;

		return ret;
	}
}

module.exports = BasePeer;

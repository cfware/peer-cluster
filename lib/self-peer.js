'use strict';

const BasePeer = require('./base-peer');

class SelfPeer extends BasePeer {
	get isSelf() {
		return true;
	}

	get origin() {
		return this.cluster.origin;
	}

	get peerId() {
		return this.cluster.peerId;
	}

	send(message) {
		if (this.stopping) {
			return;
		}

		this.emit('receive', message);
	}
}

module.exports = SelfPeer;

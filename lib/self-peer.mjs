import {BasePeer} from './base-peer.mjs';

export class SelfPeer extends BasePeer {
	get isSelf() {
		return true;
	}

	get origin() {
		return this.cluster.origin;
	}

	get peerID() {
		return this.cluster.peerID;
	}

	send(message) {
		if (this.stopping) {
			return;
		}

		this.emit('receive', message);
	}
}

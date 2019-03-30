import EventEmitter from 'events';
import {peerStop} from './protected-symbols';

export class BasePeer extends EventEmitter {
	#stopping = false;

	constructor(cluster) {
		super();

		this.cluster = cluster;
	}

	get stopping() {
		return this.#stopping;
	}

	[peerStop]() {
		const ret = this.#stopping;

		this.removeAllListeners('receive');
		this.#stopping = true;

		return ret;
	}
}

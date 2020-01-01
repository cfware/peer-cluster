import EventEmitter from 'events';
import {peerStop} from './protected-symbols.mjs';

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
		const returnValue = this.#stopping;

		this.removeAllListeners('receive');
		this.#stopping = true;

		return returnValue;
	}
}

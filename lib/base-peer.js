import EventEmitter from 'events';
import {peerStop} from './protected-symbols';

export class BasePeer extends EventEmitter {
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

import WebSocket from 'ws';
import {assertNonEmptyString} from './assert-non-empty-string.js';
import {BasePeer} from './base-peer.js';
import {keepExisting} from './keep-existing.js';
import {peerStop, oninterval, outboundWS, checkInbound} from './protected-symbols.js';

export class RemotePeer extends BasePeer {
	#ws;
	#wsSerial = 0;
	#wsLocal = false;
	#lastActive = 0;
	#peerID;
	#origin;
	#psk;
	#outboundWS;

	constructor(cluster, {peerID, origin, psk}) {
		super(cluster);

		assertNonEmptyString(peerID, 'peerID');
		assertNonEmptyString(origin, 'origin');
		assertNonEmptyString(psk, 'psk');

		this.#peerID = peerID;
		this.#origin = origin;
		this.#psk = psk;
	}

	/* This is for testing only */
	get [outboundWS]() {
		return this.#outboundWS;
	}

	get peerID() {
		return this.#peerID;
	}

	get origin() {
		return this.#origin;
	}

	get connected() {
		return Boolean(this.#ws && !this.stopping);
	}

	get isSelf() {
		return false;
	}

	[checkInbound](psk) {
		return this.#psk === psk;
	}

	tryOutbound() {
		/* This intentionally doesn't check for `this.#ws` which could be stalled. */
		if (this.#outboundWS) {
			return;
		}

		const serial = Date.now();
		const {handshakeTimeout} = this.cluster;
		this.#outboundWS = new WebSocket(`${this.#origin}?psk=${this.#psk}`, {
			headers: {
				'x-connection-serial': serial
			},
			origin: this.cluster.origin,
			perMessageDeflate: false,
			handshakeTimeout
		});

		this.#outboundWS.once('open', () => {
			this.gotWS(this.#outboundWS, serial, true);
			this.#outboundWS = undefined;
		});
		this._enableEvents(this.#outboundWS);
	}

	[oninterval]() {
		const {inactiveTime} = this;
		const {inactivityPingFatal, inactivityPingLocal, inactivityPingRemote} = this.cluster;
		if (!this.#ws || inactiveTime >= inactivityPingFatal) {
			this.tryOutbound();

			return;
		}

		if (inactiveTime >= (this.#wsLocal ? inactivityPingLocal : inactivityPingRemote)) {
			this.#ws.ping();
		}
	}

	get inactiveTime() {
		return this.cluster.lastInterval - this.#lastActive;
	}

	_onactivity() {
		this.#lastActive = this.cluster.lastInterval;
	}

	_onclose(ws) {
		if (this.#ws === ws) {
			this.#ws = undefined;
			this.#wsSerial = 0;
			this.emit('disconnected');
		} else if (this.#outboundWS === ws) {
			this.#outboundWS = undefined;
		}
	}

	_onmessage(ws, data) {
		/* istanbul ignore if: race check */
		if (this.stopping || this.#ws !== ws) {
			return;
		}

		try {
			const message = JSON.parse(data);

			this._onactivity();
			this.emit('receive', message);
		} catch (error) {
			/* istanbul ignore next: not sure this is even possible? */
			this.emit('error', error);
		}
	}

	_enableEvents(ws) {
		ws
			.on('close', () => this._onclose(ws))
			.on('message', data => this._onmessage(ws, data))
			.on('ping', () => this._onactivity())
			.on('pong', () => this._onactivity());
	}

	gotWS(ws, serial, local) {
		const previousWS = this.#ws;
		if (previousWS && keepExisting(this.#wsSerial, this.#wsLocal, serial, this.cluster.peerID, this.#peerID)) {
			ws.close();
			return;
		}

		this.#ws = ws;
		this.#wsSerial = serial;
		this.#wsLocal = local;
		if (previousWS) {
			previousWS.close();
		}

		this._onactivity();
		if (!local) {
			this._enableEvents(ws);
		}

		this.emit('connected');
	}

	_closeConnection(ws) {
		ws.once('error', () => this._onclose(ws));
		ws.close();
	}

	[peerStop]() {
		if (super[peerStop]()) {
			return;
		}

		if (this.#ws) {
			this._closeConnection(this.#ws);
		}

		if (this.#outboundWS) {
			this._closeConnection(this.#outboundWS);
		}
	}

	send(data) {
		if (!this.stopping) {
			this.#ws?.send(data);
		}
	}
}

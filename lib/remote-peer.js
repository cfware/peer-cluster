import WebSocket from 'ws';
import {assertNonEmptyString} from './assert-non-empty-string';
import {BasePeer} from './base-peer';
import {keepExisting} from './keep-existing';
import {peerStop, oninterval, outboundWS, checkInbound} from './protected-symbols';

export class RemotePeer extends BasePeer {
	#ws = null;
	#wsSerial = 0;
	#wsLocal = false;
	#lastActive = 0;
	#peerId;
	#origin;
	#psk;
	/* BUGBUG: rename after release of https://github.com/babel/babel/pull/9861 */
	#_outboundWS = null;

	constructor(cluster, {peerId, origin, psk}) {
		super(cluster);

		assertNonEmptyString(peerId, 'peerId');
		assertNonEmptyString(origin, 'origin');
		assertNonEmptyString(psk, 'psk');

		this.#peerId = peerId;
		this.#origin = origin;
		this.#psk = psk;
	}

	/* This is for testing only */
	get [outboundWS]() {
		return this.#_outboundWS;
	}

	get peerId() {
		return this.#peerId;
	}

	get origin() {
		return this.#origin;
	}

	get connected() {
		return this.#ws !== null && !this.stopping;
	}

	get isSelf() {
		return false;
	}

	[checkInbound](psk) {
		return this.#psk === psk;
	}

	tryOutbound() {
		/* This intentionally doesn't check for `this.#ws` which could be stalled. */
		if (this.#_outboundWS) {
			return;
		}

		const serial = Date.now();
		const {handshakeTimeout} = this.cluster;
		this.#_outboundWS = new WebSocket(`${this.#origin}?psk=${this.#psk}`, {
			headers: {
				'x-connection-serial': serial
			},
			origin: this.cluster.origin,
			perMessageDeflate: false,
			handshakeTimeout
		});

		this.#_outboundWS.once('open', () => {
			this.gotWS(this.#_outboundWS, serial, true);
			this.#_outboundWS = null;
		});
		this._enableEvents(this.#_outboundWS);
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
			this.#ws = null;
			this.#wsSerial = 0;
			this.emit('disconnected');
		} else if (this.#_outboundWS === ws) {
			this.#_outboundWS = null;
		}
	}

	_onmessage(ws, data) {
		/* istanbul ignore if */
		if (this.stopping || this.#ws !== ws) {
			return;
		}

		try {
			const message = JSON.parse(data);

			this._onactivity();
			this.emit('receive', message);
		} catch (error) {
			/* istanbul ignore next */
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
		const prevWS = this.#ws;
		if (prevWS && keepExisting(this.#wsSerial, this.#wsLocal, serial, this.cluster.peerId, this.#peerId)) {
			ws.close();
			return;
		}

		this.#ws = ws;
		this.#wsSerial = serial;
		this.#wsLocal = local;
		if (prevWS) {
			prevWS.close();
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

		if (this.#_outboundWS) {
			this._closeConnection(this.#_outboundWS);
		}
	}

	send(data) {
		if (!this.#ws || this.stopping) {
			return;
		}

		this.#ws.send(data);
	}
}

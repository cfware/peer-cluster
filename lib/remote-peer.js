import WebSocket from 'ws';
import {assertNonEmptyString} from './assert-non-empty-string';
import {BasePeer} from './base-peer';
import {keepExisting} from './keep-existing';
import {peerStop, oninterval, outboundWS} from './protected-symbols';

export class RemotePeer extends BasePeer {
	constructor(cluster, {peerId, origin, psk}) {
		super(cluster);

		assertNonEmptyString(peerId, 'peerId');
		assertNonEmptyString(origin, 'origin');
		assertNonEmptyString(psk, 'psk');

		Object.assign(this, {
			[outboundWS]: null,
			_ws: null,
			_wsSerial: 0,
			_wsLocal: false,
			_lastActive: 0,
			peerId,
			origin,
			psk
		});
	}

	get connected() {
		return this._ws !== null && !this.stopping;
	}

	get isSelf() {
		return false;
	}

	tryOutbound() {
		/* This intentionally doesn't check for `this._ws` which could be stalled. */
		if (this[outboundWS]) {
			return;
		}

		const serial = Date.now();
		const {handshakeTimeout} = this.cluster;
		this[outboundWS] = new WebSocket(`${this.origin}?psk=${this.psk}`, {
			headers: {
				'x-connection-serial': serial
			},
			origin: this.cluster.origin,
			perMessageDeflate: false,
			handshakeTimeout
		});

		this[outboundWS].once('open', () => {
			this.gotWS(this[outboundWS], serial, true);
			this[outboundWS] = null;
		});
		this._enableEvents(this[outboundWS]);
	}

	[oninterval]() {
		const {inactiveTime} = this;
		const {inactivityPingFatal, inactivityPingLocal, inactivityPingRemote} = this.cluster;
		if (!this._ws || inactiveTime >= inactivityPingFatal) {
			this.tryOutbound();

			return;
		}

		if (inactiveTime >= (this._wsLocal ? inactivityPingLocal : inactivityPingRemote)) {
			this._ws.ping();
		}
	}

	get inactiveTime() {
		return this.cluster.lastInterval - this._lastActive;
	}

	_onactivity() {
		this._lastActive = this.cluster.lastInterval;
	}

	_onclose(ws) {
		if (this._ws === ws) {
			this._ws = null;
			this._wsSerial = 0;
		} else if (this[outboundWS] === ws) {
			this[outboundWS] = null;
		}
	}

	_onmessage(ws, data) {
		/* istanbul ignore if */
		if (this.stopping || this._ws !== ws) {
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
		if (this._ws) {
			if (keepExisting(this._wsSerial, this._wsLocal, serial, this.cluster.peerId, this.peerId)) {
				ws.close();
				return;
			}

			this._ws.close();
		}

		this._ws = ws;
		this._wsSerial = serial;
		this._wsLocal = local;
		this._onactivity();
		if (!local) {
			this._enableEvents(ws);
		}
	}

	_closeConnection(ws) {
		ws.once('error', () => this._onclose(ws));
		ws.close();
	}

	[peerStop]() {
		if (super[peerStop]()) {
			return;
		}

		if (this._ws) {
			this._closeConnection(this._ws);
		}

		if (this[outboundWS]) {
			this._closeConnection(this[outboundWS]);
		}
	}

	send(data) {
		if (!this._ws || this.stopping) {
			return;
		}

		this._ws.send(data);
	}
}

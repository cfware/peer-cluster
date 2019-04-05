import EventEmitter from 'events';
import {URL} from 'url';

import WebSocket from 'ws';

import {assertNonEmptyString} from './assert-non-empty-string';
import {BasePeer} from './base-peer';
import {SelfPeer} from './self-peer';
import {RemotePeer} from './remote-peer';
import {peerStop, oninterval, checkInbound} from './protected-symbols';

function rejectWS(sock, code, msg) {
	sock.end(
		`HTTP/1.1 ${code} ${msg}\r\n` +
		'Connection: close\r\n' +
		'Content-type: text/html\r\n' +
		`Content-Length: ${msg.length}\r\n` +
		'\r\n' +
		msg
	);
}

export class PeerCluster extends EventEmitter {
	#stopping = false;
	#selfPeer = new SelfPeer(this);
	#peers = [];
	#lastInterval = Date.now();
	#pathname;
	#settings;
	#wss = new WebSocket.Server({
		noServer: true,
		clientTracking: false,
		perMessageDeflate: false
	});

	constructor(settings) {
		super();

		assertNonEmptyString(settings.peerId, 'peerId');
		assertNonEmptyString(settings.origin, 'origin');

		this.#settings = {
			activityCheckInterval: 1000,
			inactivityPingLocal: 4000,
			inactivityPingRemote: 6000,
			inactivityPingFatal: 10000,
			handshakeTimeout: 2000,
			respond404: false,
			...settings
		};

		this.#pathname = new URL(this.#settings.origin).pathname;
		this.#selfPeer.on('receive', message => this.emit('receive', this.#selfPeer, message));
	}

	get peers() {
		return [...this.#peers];
	}

	get stopping() {
		return this.#stopping;
	}

	get selfPeer() {
		return this.#selfPeer;
	}

	get lastInterval() {
		return this.#lastInterval;
	}

	get pathname() {
		return this.#pathname;
	}

	get peerId() {
		return this.#settings.peerId;
	}

	get origin() {
		return this.#settings.origin;
	}

	get handshakeTimeout() {
		return this.#settings.handshakeTimeout;
	}

	get activityCheckInterval() {
		return this.#settings.activityCheckInterval;
	}

	get inactivityPingLocal() {
		return this.#settings.inactivityPingLocal;
	}

	get inactivityPingRemote() {
		return this.#settings.inactivityPingRemote;
	}

	get inactivityPingFatal() {
		return this.#settings.inactivityPingFatal;
	}

	get respond404() {
		return this.#settings.respond404;
	}

	get active() {
		return Boolean(this._interval);
	}

	[oninterval]() {
		if (!this.active) {
			return;
		}

		this.#lastInterval = Date.now();
		this.#peers
			.filter(peer => !peer.isSelf && (!peer.connected || peer.inactiveTime >= this.inactivityPingLocal))
			.forEach(peer => {
				peer[oninterval]();
			});
	}

	start() {
		if (this._interval || this.#stopping) {
			return;
		}

		this._interval = setInterval(() => this[oninterval](), this.activityCheckInterval);
		this[oninterval]();
	}

	stop() {
		if (!this._interval) {
			return;
		}

		this.#stopping = true;
		this._interval = clearInterval(this._interval);

		this.#selfPeer[peerStop]();
		this.#peers.forEach(peer => {
			peer[peerStop]();
		});
	}

	tryUpgrade(req, sock, head, url = new URL(req.url, this.#selfPeer.origin)) {
		if (this.pathname === url.pathname) {
			const peer = this.#peers.find(peer => peer.origin === req.headers.origin);
			const serial = Number(req.headers['x-connection-serial']);
			const psk = url.searchParams.get('psk');

			if (!peer || !psk || !peer[checkInbound](psk)) {
				rejectWS(sock, 401, 'Unauthorized');

				return true;
			}

			this.#wss.handleUpgrade(req, sock, head, ws => peer.gotWS(ws, serial));

			return true;
		}

		if (this.respond404) {
			rejectWS(sock, 404, 'Not Found');

			return true;
		}

		return false;
	}

	addPeer(settings) {
		if (settings.peerId === this.peerId || settings.origin === this.origin) {
			throw new Error('addPeer cannot match local server');
		}

		if (this.#peers.some(peer => peer.peerId === settings.peerId || peer.origin === settings.origin)) {
			throw new Error('Duplicate peerId or origin');
		}

		const peer = new RemotePeer(this, settings);
		['receive', 'connected', 'disconnected'].forEach(type => {
			peer.on(type, (...args) => this.emit(type, peer, ...args));
		});
		this.#peers.push(peer);

		return peer;
	}

	findPeer(peerId) {
		if (peerId === this.peerId) {
			return this.#selfPeer;
		}

		return this.#peers.find(peer => peer.peerId === peerId);
	}

	removePeer(peerId) {
		const peer = this.findPeer(peerId);
		if (!peer) {
			throw new Error(`Peer '${peerId}' does not exist.`);
		} else if (peer === this.#selfPeer) {
			throw new Error('Cannot remove selfPeer.');
		}

		peer[peerStop]();
		this.#peers = this.#peers.filter(p => p !== peer);
	}

	send(message, peers) {
		if (peers === true) {
			peers = [this.#selfPeer, ...this.#peers];
		} else if (typeof peers === 'undefined') {
			peers = this.#peers;
		} else {
			peers = [].concat(peers).map((item, idx) => {
				if (typeof item === 'string') {
					const peer = this.findPeer(item);
					if (!peer) {
						throw new Error(`PeerId '${item}' not found`);
					}

					return peer;
				}

				if (item instanceof BasePeer) {
					return item;
				}

				throw new TypeError(`Invalid peer at index ${idx}`);
			});
		}

		const data = JSON.stringify(message);
		peers.forEach(peer => {
			peer.send(peer.isSelf ? message : data);
		});
	}
}

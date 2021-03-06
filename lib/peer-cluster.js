import EventEmitter from 'events';

import WebSocket from 'ws';

import {assertNonEmptyString} from './assert-non-empty-string.js';
import {BasePeer} from './base-peer.js';
import {SelfPeer} from './self-peer.js';
import {RemotePeer} from './remote-peer.js';
import {peerStop, oninterval, checkInbound} from './protected-symbols.js';

function rejectWS(socket, code, message) {
	socket.end([
		`HTTP/1.1 ${code} ${message}`,
		'Connection: close',
		'Content-type: text/html',
		`Content-Length: ${message.length}`,
		'',
		message
	].join('\r\n'));
}

const defaultSettings = {
	activityCheckInterval: 1000,
	inactivityPingLocal: 4000,
	inactivityPingRemote: 6000,
	inactivityPingFatal: 10000,
	handshakeTimeout: 2000,
	respond404: false
};

const wssOptions = {
	noServer: true,
	clientTracking: false,
	perMessageDeflate: false
};

export class PeerCluster extends EventEmitter {
	#stopping = false;
	#peers = [];
	#lastInterval = Date.now();
	#pathname;
	#settings;
	#interval;
	#wss = new WebSocket.Server(wssOptions);

	#selfPeer = new SelfPeer(this).on('receive', message => {
		this.emit('receive', this.#selfPeer, message);
	});

	constructor(settings) {
		super();

		assertNonEmptyString(settings.peerID, 'peerID');
		assertNonEmptyString(settings.origin, 'origin');

		this.#settings = {
			...defaultSettings,
			...settings
		};

		this.#pathname = new URL(this.#settings.origin).pathname;
		this.tryUpgrade = this.tryUpgrade.bind(this);
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

	get peerID() {
		return this.#settings.peerID;
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
		return Boolean(this.#interval);
	}

	[oninterval]() {
		if (!this.#interval) {
			return;
		}

		this.#lastInterval = Date.now();
		for (const peer of this.#peers) {
			if (!peer.isSelf && (!peer.connected || peer.inactiveTime >= this.inactivityPingLocal)) {
				peer[oninterval]();
			}
		}
	}

	start() {
		if (this.#interval || this.#stopping) {
			return;
		}

		this.#interval = setInterval(() => this[oninterval](), this.activityCheckInterval);
		this[oninterval]();
	}

	stop() {
		if (!this.#interval) {
			return;
		}

		this.#stopping = true;
		this.#interval = clearInterval(this.#interval);

		this.#selfPeer[peerStop]();
		for (const peer of this.#peers) {
			peer[peerStop]();
		}
	}

	tryUpgrade(request, socket, head, url = new URL(request.url, this.#selfPeer.origin)) {
		if (this.pathname === url.pathname) {
			const peer = this.#peers.find(peer => peer.origin === request.headers.origin);
			const serial = Number(request.headers['x-connection-serial']);
			const psk = url.searchParams.get('psk');

			if (!peer || !psk || !peer[checkInbound](psk)) {
				rejectWS(socket, 401, 'Unauthorized');

				return true;
			}

			this.#wss.handleUpgrade(request, socket, head, ws => peer.gotWS(ws, serial));

			return true;
		}

		if (this.respond404) {
			rejectWS(socket, 404, 'Not Found');

			return true;
		}

		return false;
	}

	addPeer(settings) {
		if (settings.peerID === this.peerID || settings.origin === this.origin) {
			throw new Error('addPeer cannot match local server');
		}

		if (this.#peers.some(peer => peer.peerID === settings.peerID || peer.origin === settings.origin)) {
			throw new Error('Duplicate peerID or origin');
		}

		const peer = new RemotePeer(this, settings);
		for (const type of ['receive', 'connected', 'disconnected']) {
			peer.on(type, (...args) => this.emit(type, peer, ...args));
		}

		this.#peers.push(peer);

		return peer;
	}

	findPeer(peerID) {
		if (peerID === this.peerID) {
			return this.#selfPeer;
		}

		return this.#peers.find(peer => peer.peerID === peerID);
	}

	removePeer(peerID) {
		const peer = this.findPeer(peerID);
		if (!peer) {
			throw new Error(`Peer '${peerID}' does not exist.`);
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
						throw new Error(`Could not find peerID '${item}'`);
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
		for (const peer of peers) {
			peer.send(peer.isSelf ? message : data);
		}
	}
}

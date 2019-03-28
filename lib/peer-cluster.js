'use strict';
const EventEmitter = require('events');
const {URL} = require('url');

const arrify = require('arrify');
const WebSocket = require('ws');

const assertNonEmptyString = require('./assert-non-empty-string');
const BasePeer = require('./self-peer');
const SelfPeer = require('./self-peer');
const RemotePeer = require('./remote-peer');
const {peerStop, oninterval} = require('./protected-symbols');

class PeerCluster extends EventEmitter {
	constructor(settings) {
		super();

		assertNonEmptyString(settings.peerId, 'peerId');
		assertNonEmptyString(settings.origin, 'origin');

		this._settings = {
			activityCheckInterval: 1000,
			inactivityPingLocal: 4000,
			inactivityPingRemote: 6000,
			inactivityPingFatal: 10000,
			handshakeTimeout: 2000,
			...settings
		};

		Object.assign(this, {
			stopping: false,
			_pathname: new URL(this._settings.origin).pathname,
			selfPeer: new SelfPeer(this),
			peers: [],
			lastInterval: Date.now(),
			wss: new WebSocket.Server({
				noServer: true,
				clientTracking: false,
				perMessageDeflate: false
			})
		});
		this.selfPeer.on('receive', message => this.emit('receive', message, this.selfPeer));
	}

	get pathname() {
		return this._pathname;
	}

	get peerId() {
		return this._settings.peerId;
	}

	get origin() {
		return this._settings.origin;
	}

	get handshakeTimeout() {
		return this._settings.handshakeTimeout;
	}

	get activityCheckInterval() {
		return this._settings.activityCheckInterval;
	}

	get inactivityPingLocal() {
		return this._settings.inactivityPingLocal;
	}

	get inactivityPingRemote() {
		return this._settings.inactivityPingRemote;
	}

	get inactivityPingFatal() {
		return this._settings.inactivityPingFatal;
	}

	get active() {
		return Boolean(this._interval);
	}

	[oninterval]() {
		if (!this.active) {
			return;
		}

		this.lastInterval = Date.now();
		this.peers
			.filter(peer => !peer.isSelf && (!peer.connected || peer.inactiveTime >= this.inactivityPingLocal))
			.forEach(peer => {
				peer[oninterval]();
			});
	}

	start() {
		if (this._interval || this.stopping) {
			return;
		}

		this._interval = setInterval(() => this[oninterval](), this.activityCheckInterval);
		this[oninterval]();
	}

	stop() {
		if (!this._interval) {
			return;
		}

		this.stopping = true;
		this._interval = clearInterval(this._interval);

		this.selfPeer[peerStop]();
		this.peers.forEach(peer => {
			peer[peerStop]();
		});
	}

	tryUpgrade(req, sock, head, url = new URL(req.url, this.selfPeer.origin)) {
		if (this.pathname === url.pathname) {
			const peer = this.peers.find(peer => peer.origin === req.headers.origin);
			const serial = Number(req.headers['x-connection-serial']);
			const psk = url.searchParams.get('psk');

			if (!peer || !psk || peer.psk !== psk) {
				const msg = 'Unauthorized';
				sock.end(
					`HTTP/1.1 401 ${msg}\r\n` +
					'Connection: close\r\n' +
					'Content-type: text/html\r\n' +
					`Content-Length: ${msg.length}\r\n` +
					'\r\n' +
					msg
				);

				return true;
			}

			this.wss.handleUpgrade(req, sock, head, ws => peer.gotWS(ws, serial));

			return true;
		}

		return false;
	}

	addPeer(settings) {
		if (settings.peerId === this.peerId || settings.origin === this.origin) {
			throw new Error('addPeer cannot match local server');
		}

		if (this.peers.some(peer => peer.peerId === settings.peerId || peer.origin === settings.origin)) {
			throw new Error('Duplicate peerId or origin');
		}

		const peer = new RemotePeer(this, settings);
		peer.on('receive', message => this.emit('receive', message, peer));
		this.peers.push(peer);

		return peer;
	}

	findPeer(peerId) {
		if (peerId === this.peerId) {
			return this.selfPeer;
		}

		return this.peers.find(peer => peer.peerId === peerId);
	}

	removePeer(peerId) {
		const peer = this.findPeer(peerId);
		if (!peer) {
			throw new Error(`Peer '${peerId}' does not exist.`);
		} else if (peer === this.selfPeer) {
			throw new Error('Cannot remove selfPeer.');
		}

		peer[peerStop]();
		this.peers = this.peers.filter(p => p !== peer);
	}

	send(message, peers) {
		if (peers === true) {
			peers = [this.selfPeer, ...this.peers];
		} else if (typeof peers === 'undefined') {
			peers = this.peers;
		} else {
			peers = arrify(peers).map((item, idx) => {
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

module.exports = {
	PeerCluster
};

'use strict';

function keepExisting(existingSerial, existingLocal, serial, localPeerId, remotePeerId) { // eslint-disable-line max-params
	if (existingSerial > serial) {
		/* Existing connection is newer */
		return true;
	}

	if (existingSerial === serial) {
		/* If two connections were initiated at exactly the same time
		 * then we use the peerId's.  Take a connection between peerId
		 * 'server1' and 'server2', we will keep the connection initiated
		 * by 'server1'. */
		return localPeerId < remotePeerId ? existingLocal : !existingLocal;
	}

	/* Existing connection is older */
	return false;
}

module.exports = keepExisting;

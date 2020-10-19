export function keepExisting(existingSerial, existingLocal, serial, localPeerID, remotePeerID) {
	if (existingSerial > serial) {
		/* Existing connection is newer */
		return true;
	}

	if (existingSerial === serial) {
		/* If two connections were initiated at exactly the same time
		 * then we use the peerID's.  Take a connection between peerID
		 * 'server1' and 'server2', we will keep the connection initiated
		 * by 'server1'. */
		return localPeerID < remotePeerID ? existingLocal : !existingLocal;
	}

	/* Existing connection is older */
	return false;
}

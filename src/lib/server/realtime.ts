import { EventEmitter } from 'node:events';

// In-process pub/sub that tells open event pages to reload when something changes.
// This works for a single server process; running several would need a shared broker.
const bus = new EventEmitter();
bus.setMaxListeners(0);

export function publish(eventId: number) {
	bus.emit(`event:${eventId}`);
}

export function subscribe(eventId: number, listener: () => void) {
	bus.on(`event:${eventId}`, listener);
	return () => bus.off(`event:${eventId}`, listener);
}

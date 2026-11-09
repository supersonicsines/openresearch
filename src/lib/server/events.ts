import { EventEmitter } from 'node:events';

export type Phase = 'starting' | 'searching' | 'writing' | 'editing';

export type LiveRun = {
	seq: number;
	phase: Phase;
	question: string;
	modelName: string;
	handle: string;
	text: string;
};

export type ProjectEvent =
	| { type: 'run'; live: LiveRun }
	| { type: 'phase'; phase: Phase }
	| { type: 'delta'; text: string }
	| { type: 'end' };

type Bus = { emitter: EventEmitter; live: Map<number, LiveRun>; closed?: boolean };
const holder = globalThis as unknown as { __osBus?: Bus };
const bus: Bus = (holder.__osBus ??= { emitter: new EventEmitter(), live: new Map() });
bus.emitter.setMaxListeners(0);

const channel = (projectId: number) => `project:${projectId}`;
const CLOSING = 'closing';

export function currentRun(projectId: number): LiveRun | undefined {
	return bus.live.get(projectId);
}

export function publishRun(projectId: number, live: LiveRun) {
	bus.live.set(projectId, live);
	bus.emitter.emit(channel(projectId), { type: 'run', live } satisfies ProjectEvent);
}

export function publishPhase(projectId: number, phase: Phase) {
	const live = bus.live.get(projectId);
	if (live) live.phase = phase;
	bus.emitter.emit(channel(projectId), { type: 'phase', phase } satisfies ProjectEvent);
}

export function publishDelta(projectId: number, text: string) {
	const live = bus.live.get(projectId);
	if (live) live.text += text;
	bus.emitter.emit(channel(projectId), { type: 'delta', text } satisfies ProjectEvent);
}

export function publishEnd(projectId: number) {
	bus.live.delete(projectId);
	bus.emitter.emit(channel(projectId), { type: 'end' } satisfies ProjectEvent);
}

/** onClose is called when the server stops, so that no live connection keeps it running. */
export function subscribe(projectId: number, fn: (event: ProjectEvent) => void, onClose: () => void): () => void {
	bus.emitter.on(channel(projectId), fn);
	bus.emitter.on(CLOSING, onClose);
	return () => {
		bus.emitter.off(channel(projectId), fn);
		bus.emitter.off(CLOSING, onClose);
	};
}

export const streamsClosed = () => Boolean(bus.closed);

export function closeStreams() {
	bus.closed = true;
	bus.emitter.emit(CLOSING);
}

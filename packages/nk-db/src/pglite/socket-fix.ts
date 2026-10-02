// Makes pglite-socket safe for more than one connection. PGlite is a single
// Postgres session, and pglite-socket 0.2.x shares it between connections by
// queueing their protocol messages one at a time, with connection affinity only
// inside a transaction. Two bugs follow once a second connection exists:
//
//  - Two connections' Parse/Bind/Execute/Sync batches interleave and clobber
//    each other's unnamed statement ("unexpected commandComplete"), and one
//    failed message returns without clearing the queue's `processing` flag, so
//    the queue stops for good (electric-sql/pglite#1046; upstream fixes are
//    open as #977 and #1094).
//  - PGlite answers an error inside an extended-protocol batch with
//    ErrorResponse plus an early ReadyForQuery, then a second one on Sync
//    (electric-sql/pglite#958). `pg` takes the early one as its next query's
//    completion, and every later result is shifted by one.
//
// This replaces the queue loop: a connection that sends an extended-protocol
// message owns the session until its Sync, a transaction owns it until it
// ends, and an error rejects only its own message. It also drops the early
// ReadyForQuery.
//
// Delete once pglite-socket ships #977/#1094 and PGlite fixes #958. It patches
// a private field, so it checks the field's shape first and leaves the server
// untouched (with a warning) if a pglite-socket release has changed it.

import type { PGlite } from "@electric-sql/pglite";
import type { PGLiteSocketServer } from "@electric-sql/pglite-socket";

interface QueueItem {
	handlerId: number;
	message: Uint8Array;
	resolve: (bytes: number) => void;
	reject: (error: unknown) => void;
	onData: (data: Uint8Array) => void;
}

interface QueryQueue {
	queue: QueueItem[];
	processing: boolean;
	lastHandlerId: number | null;
	processQueue: () => Promise<void>;
	clearQueueForHandler: (handlerId: number) => void;
}

const isQueryQueue = (value: unknown): value is QueryQueue =>
	typeof value === "object" &&
	value !== null &&
	Array.isArray(Reflect.get(value, "queue")) &&
	typeof Reflect.get(value, "processing") === "boolean" &&
	typeof Reflect.get(value, "processQueue") === "function" &&
	typeof Reflect.get(value, "clearQueueForHandler") === "function";

const code = (c: string): number => c.charCodeAt(0);
// Parse, Bind, Describe, Execute, Flush, Close: a batch stays open until Sync.
const EXTENDED = new Set([..."PBDEHC"].map(code));
const SYNC = code("S");
const ERROR_RESPONSE = code("E");
const READY_FOR_QUERY = code("Z");

/** Drop ReadyForQuery from a reply that carries an ErrorResponse; the batch's
 *  Sync sends the one Postgres would have sent. */
const dropEarlyReadyForQuery = (reply: Buffer): Buffer => {
	const messages: Buffer[] = [];
	for (let o = 0; o + 5 <= reply.length; o += 1 + reply.readInt32BE(o + 1)) {
		messages.push(reply.subarray(o, o + 1 + reply.readInt32BE(o + 1)));
	}
	if (!messages.some((m) => m[0] === ERROR_RESPONSE)) return reply;
	return Buffer.concat(messages.filter((m) => m[0] !== READY_FOR_QUERY));
};

/** First line of the SQL in a Query (`sql\0`) or Parse (`name\0sql\0…`). */
const sqlOf = (message: Uint8Array): string => {
	const parts = Buffer.from(message).toString("utf8", 5).split("\0");
	const sql = message[0] === code("Q") ? parts[0] : parts[1];
	return (sql ?? "").replace(/\s+/g, " ").slice(0, 160);
};

/**
 * Patch `server`'s query queue so several connections can share `db` safely.
 * Call before `server.start()`. Returns whether the patch was applied.
 */
export const isolateConnections = (server: PGLiteSocketServer, db: PGlite): boolean => {
	const q: unknown = Reflect.get(server, "queryQueue");
	if (!isQueryQueue(q)) {
		console.warn(
			"nk(pglite): pglite-socket's query queue has an unexpected shape; " +
				"running it unpatched, so concurrent connections may interleave.",
		);
		return false;
	}
	let batchOwner: number | null = null;

	// One session means a connection holding a transaction blocks every other
	// connection until it commits. If app code awaits a second connection from
	// inside that transaction, nothing moves again; say so instead of hanging
	// silently.
	const lastSql = new Map<number, string>();
	let stalledSince: number | null = null;
	let stalledOwner: number | null = null;
	// A deadlock never clears itself, so the warning backs off (5s, 10s, 20s…
	// capped at a minute) instead of repeating every 5s for the rest of the run.
	let warnGap = 5000;
	let warnAt = 0;
	let stallTimer: ReturnType<typeof setTimeout> | undefined;
	const armStallCheck = (): void => {
		stallTimer = setTimeout(checkStall, Math.max(0, warnAt - Date.now()));
		stallTimer.unref?.();
	};
	const checkStall = (): void => {
		stallTimer = undefined;
		if (stalledSince === null || q.queue.length === 0) {
			stalledSince = null;
			return;
		}
		// The stall that armed this timer may have ended and a newer one begun;
		// then it is not yet due.
		if (Date.now() >= warnAt) {
			const seconds = Math.round((Date.now() - stalledSince) / 1000);
			const waiting = q.queue
				.map(
					(i) => `#${i.handlerId}:${String.fromCharCode(i.message[0] ?? 63)}`,
				)
				.join(" ");
			const holding = db.isInTransaction() ? "open transaction" : "open batch";
			console.warn(
				`nk(pglite): queue stalled ${seconds}s on connection #${stalledOwner} ` +
					`(${holding}); its last SQL: ${lastSql.get(stalledOwner ?? -1) ?? "?"}; ` +
					`waiting: ${waiting}. PGlite is one session: code that awaits ` +
					"a second connection inside a transaction never finishes here.",
			);
			warnGap = Math.min(warnGap * 2, 60_000);
			warnAt = Date.now() + warnGap;
		}
		armStallCheck();
	};
	const reportStall = (owner: number | null): void => {
		stalledOwner = owner;
		if (stalledSince === null) {
			stalledSince = Date.now();
			warnGap = 5000;
			warnAt = stalledSince + warnGap;
		}
		// Arm once per stall: re-arming on every arrival would let steady traffic
		// from the waiting connections postpone the warning forever.
		if (stallTimer === undefined) armStallCheck();
	};

	q.processQueue = async (): Promise<void> => {
		if (q.processing) return;
		q.processing = true;
		try {
			while (q.queue.length > 0) {
				const owner = db.isInTransaction() ? q.lastHandlerId : batchOwner;
				const index =
					owner === null
						? 0
						: q.queue.findIndex((i) => i.handlerId === owner);
				// The owner's next message has not arrived; its arrival re-runs this.
				if (index === -1) {
					reportStall(owner);
					break;
				}
				stalledSince = null;
				const [item] = q.queue.splice(index, 1);
				if (!item) break;
				const type = item.message[0] ?? 0;
				if (type === code("P") || type === code("Q")) {
					lastSql.set(item.handlerId, sqlOf(item.message));
				}
				const chunks: Uint8Array[] = [];
				try {
					await db.runExclusive(() =>
						db.execProtocolRawStream(item.message, {
							onRawData: (data) => chunks.push(data.slice()),
						}),
					);
					const raw = Buffer.concat(chunks);
					const reply = EXTENDED.has(type)
						? dropEarlyReadyForQuery(raw)
						: raw;
					if (reply.length > 0) item.onData(reply);
					item.resolve(reply.length);
				} catch (error) {
					item.reject(error);
				}
				q.lastHandlerId = item.handlerId;
				if (EXTENDED.has(type)) batchOwner = item.handlerId;
				else if (type === SYNC) batchOwner = null;
			}
		} finally {
			q.processing = false;
		}
	};

	const clear = q.clearQueueForHandler.bind(q);
	q.clearQueueForHandler = (handlerId: number): void => {
		clear(handlerId);
		lastSql.delete(handlerId);
		if (batchOwner === handlerId) {
			batchOwner = null;
			void q.processQueue();
		}
	};
	return true;
};

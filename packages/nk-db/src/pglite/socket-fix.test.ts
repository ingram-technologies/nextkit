import { connect } from "node:net";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "./index.js";

// `next dev` opens one pool per module graph and per process, so the PGlite
// socket must take several connections and keep their protocol batches apart
// on its one session. See socket-fix.ts for the two pglite-socket bugs these
// reproduce; each test fails on the unpatched server.
let testDb: TestDb;

beforeAll(async () => {
	testDb = await createTestDb({ migrate: async () => {} });
});

afterAll(async () => {
	await testDb.close();
});

const withClients = async (
	count: number,
	run: (clients: Client[]) => Promise<void>,
): Promise<void> => {
	const clients = Array.from({ length: count }, () => new Client(testDb.databaseUrl));
	try {
		for (const client of clients) await client.connect();
		await run(clients);
	} finally {
		await Promise.allSettled(clients.map((client) => client.end()));
	}
};

// Frontend protocol messages, built by hand for the raw-socket test below.
const message = (type: string, ...parts: Buffer[]): Buffer => {
	const body = Buffer.concat(parts);
	const head = Buffer.alloc(5);
	head.write(type, 0);
	head.writeInt32BE(body.length + 4, 1);
	return Buffer.concat([head, body]);
};
const cstr = (s: string): Buffer => Buffer.from(`${s}\0`);
const int16 = (n: number): Buffer => {
	const b = Buffer.alloc(2);
	b.writeInt16BE(n);
	return b;
};
const int32 = (n: number): Buffer => {
	const b = Buffer.alloc(4);
	b.writeInt32BE(n);
	return b;
};

/** Start up, then send one Parse/Bind/Describe/Execute/Sync batch whose Bind
 *  fails; resolve with how many ReadyForQuery messages it got within 500ms. */
const readyCountAfterBindError = (port: number): Promise<number> =>
	new Promise((resolve, reject) => {
		const socket = connect(port, "127.0.0.1");
		let buffer = Buffer.alloc(0);
		let ready = -1; // the startup's own ReadyForQuery takes it to 0
		socket.on("error", reject);
		socket.on("data", (data: Buffer) => {
			buffer = Buffer.concat([buffer, data]);
			while (buffer.length >= 5 && buffer.length >= 1 + buffer.readInt32BE(1)) {
				if (buffer[0] === "Z".charCodeAt(0) && ++ready === 0) {
					const param = Buffer.from("abc");
					socket.write(
						Buffer.concat([
							message("P", cstr(""), cstr("SELECT $1::int"), int16(0)),
							message(
								"B",
								cstr(""),
								cstr(""),
								int16(0),
								int16(1),
								int32(param.length),
								param,
								int16(0),
							),
							message("D", Buffer.from("P"), cstr("")),
							message("E", cstr(""), int32(0)),
							message("S"),
						]),
					);
					setTimeout(() => {
						socket.destroy();
						resolve(ready);
					}, 500);
				}
				buffer = buffer.subarray(1 + buffer.readInt32BE(1));
			}
		});
		const params = Buffer.concat([
			cstr("user"),
			cstr("postgres"),
			cstr("database"),
			cstr("postgres"),
			Buffer.from([0]),
		]);
		socket.write(Buffer.concat([int32(params.length + 8), int32(196608), params]));
	});

describe("PGlite socket with several connections", () => {
	it("accepts more than one connection at a time", async () => {
		await withClients(3, async (clients) => {
			const results = await Promise.all(
				clients.map((client, i) => client.query("select $1::int as i", [i])),
			);
			expect(results.map((r) => r.rows[0]?.i)).toEqual([0, 1, 2]);
		});
	});

	it("keeps concurrent extended-protocol batches apart", async () => {
		// A large parameter splits the Bind across TCP chunks, so a batch
		// arrives in parts and the other connection's messages can land between
		// them; small queries arrive whole and never interleave.
		const pad = "x".repeat(200_000);
		await withClients(2, async ([a, b]) => {
			if (!a || !b) throw new Error("expected two clients");
			for (let i = 0; i < 300; i++) {
				const [ra, rb] = await Promise.all([
					a.query("select $1::text as who, $2::int as i, length($3) as n", [
						"a",
						i,
						pad,
					]),
					b.query("select $1::int * 2 as doubled, length($2) as n", [i, pad]),
				]);
				expect(ra.rows[0]).toEqual({ who: "a", i, n: pad.length });
				expect(rb.rows[0]).toEqual({ doubled: i * 2, n: pad.length });
			}
		});
	}, 60_000);

	it("answers a failed extended-protocol batch with one ReadyForQuery", async () => {
		const port = Number(new URL(testDb.databaseUrl).port);
		expect(await readyCountAfterBindError(port)).toBe(1);
	});
});

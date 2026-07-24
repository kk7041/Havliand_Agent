import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { extractMessageText } from "../src/core/chat-storage.ts";
import { SessionManager } from "../src/core/session-manager.ts";
import { allToolNames, createToolDefinition } from "../src/core/tools/index.ts";

describe("chat storage", () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = join(tmpdir(), `havliand-chat-storage-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		mkdirSync(tempDir, { recursive: true });
	});

	afterEach(() => {
		rmSync(tempDir, { recursive: true, force: true });
	});

	it("extracts searchable text from message content", () => {
		expect(
			extractMessageText({
				role: "user",
				content: [
					{ type: "text", text: "alpha" },
					{ type: "text", text: "beta" },
				],
				timestamp: 1,
			}),
		).toBe("alpha\nbeta");
	});

	it("does not block JSONL persistence when Postgres is unavailable", () => {
		const previousPgUrl = process.env.HAVLIAND_PG_URL;
		process.env.HAVLIAND_PG_URL = "postgres://127.0.0.1:1/havliand";
		try {
			const session = SessionManager.create(tempDir, tempDir);
			session.appendMessage({ role: "user", content: [{ type: "text", text: "remember this" }], timestamp: 1 });
			session.appendMessage({
				role: "assistant",
				content: [{ type: "text", text: "stored in jsonl" }],
				api: "anthropic-messages",
				provider: "anthropic",
				model: "claude",
				usage: {
					input: 1,
					output: 1,
					cacheRead: 0,
					cacheWrite: 0,
					totalTokens: 2,
					cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
				},
				stopReason: "stop",
				timestamp: 2,
			});
			expect(session.getEntries()).toHaveLength(2);
			expect(session.getSessionFile()).toBeDefined();
		} finally {
			if (previousPgUrl === undefined) delete process.env.HAVLIAND_PG_URL;
			else process.env.HAVLIAND_PG_URL = previousPgUrl;
		}
	});

	it("registers chat_search as a built-in tool", () => {
		expect(allToolNames.has("chat_search")).toBe(true);
		expect(createToolDefinition("chat_search", tempDir).name).toBe("chat_search");
	});
});

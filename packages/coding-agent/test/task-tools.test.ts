import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ENV_AGENT_DIR } from "../src/config.ts";
import type { ExtensionContext } from "../src/core/extensions/types.ts";
import {
	createTaskCreateToolDefinition,
	createTaskGetToolDefinition,
	createTaskListToolDefinition,
	createTaskUpdateToolDefinition,
} from "../src/core/tools/tasks.ts";

function getTextOutput(result: { content: Array<{ type: string; text?: string }> }): string {
	return result.content
		.filter((part) => part.type === "text")
		.map((part) => part.text ?? "")
		.join("\n");
}

describe("task tools", () => {
	let tempDir: string;
	let agentDir: string;
	let cwd: string;
	let previousAgentDir: string | undefined;
	let ctx: ExtensionContext;

	beforeEach(() => {
		tempDir = join(tmpdir(), `task-tools-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		agentDir = join(tempDir, "agent");
		cwd = join(tempDir, "project");
		mkdirSync(agentDir, { recursive: true });
		mkdirSync(cwd, { recursive: true });
		previousAgentDir = process.env[ENV_AGENT_DIR];
		process.env[ENV_AGENT_DIR] = agentDir;
		ctx = {
			cwd,
			sessionManager: {
				getSessionId: () => "session-1",
			},
		} as ExtensionContext;
	});

	afterEach(() => {
		if (previousAgentDir === undefined) delete process.env[ENV_AGENT_DIR];
		else process.env[ENV_AGENT_DIR] = previousAgentDir;
		rmSync(tempDir, { recursive: true, force: true });
	});

	it("creates, lists, and gets tasks", async () => {
		const create = createTaskCreateToolDefinition(cwd);
		const list = createTaskListToolDefinition(cwd);
		const get = createTaskGetToolDefinition(cwd);

		const created = await create.execute(
			"create",
			{ task: { id: "write-tests", subject: "Write focused tests", owner: "Angel" } },
			undefined,
			undefined,
			ctx,
		);
		expect(getTextOutput(created)).toContain("write-tests");

		const listed = await list.execute("list", { owner: "Angel" }, undefined, undefined, ctx);
		expect(getTextOutput(listed)).toContain("Write focused tests");

		const fetched = await get.execute("get", { id: "write-tests" }, undefined, undefined, ctx);
		expect(fetched.details?.task?.status).toBe("pending");
	});

	it("blocks in_progress until dependencies are resolved", async () => {
		const create = createTaskCreateToolDefinition(cwd);
		const update = createTaskUpdateToolDefinition(cwd);

		await create.execute(
			"create",
			{
				tasks: [
					{ id: "research", subject: "Research implementation" },
					{ id: "implement", subject: "Implement change", blockedBy: ["research"] },
				],
			},
			undefined,
			undefined,
			ctx,
		);

		await expect(
			update.execute("update", { id: "implement", status: "in_progress" }, undefined, undefined, ctx),
		).rejects.toThrow(/blocked/);

		await update.execute("update", { id: "research", status: "completed" }, undefined, undefined, ctx);
		const updated = await update.execute(
			"update",
			{ id: "implement", status: "in_progress" },
			undefined,
			undefined,
			ctx,
		);
		expect(updated.details?.task?.status).toBe("in_progress");
	});
});

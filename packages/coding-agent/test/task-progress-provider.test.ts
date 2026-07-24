import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ENV_AGENT_DIR } from "../src/config.ts";
import { calculateTaskProgress, TaskProgressProvider } from "../src/core/task-progress-provider.ts";
import { getTaskStorePath } from "../src/core/tools/tasks.ts";

function waitFor(predicate: () => boolean): Promise<void> {
	return new Promise((resolve, reject) => {
		const startedAt = Date.now();
		const timer = setInterval(() => {
			if (predicate()) {
				clearInterval(timer);
				resolve();
				return;
			}
			if (Date.now() - startedAt > 3000) {
				clearInterval(timer);
				reject(new Error("Timed out waiting for task progress update"));
			}
		}, 25);
	});
}

describe("TaskProgressProvider", () => {
	let tempDir: string;
	let agentDir: string;
	let cwd: string;
	let previousAgentDir: string | undefined;

	beforeEach(() => {
		tempDir = join(tmpdir(), `task-progress-provider-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		agentDir = join(tempDir, "agent");
		cwd = join(tempDir, "project");
		mkdirSync(agentDir, { recursive: true });
		mkdirSync(cwd, { recursive: true });
		previousAgentDir = process.env[ENV_AGENT_DIR];
		process.env[ENV_AGENT_DIR] = agentDir;
	});

	afterEach(() => {
		if (previousAgentDir === undefined) delete process.env[ENV_AGENT_DIR];
		else process.env[ENV_AGENT_DIR] = previousAgentDir;
		rmSync(tempDir, { recursive: true, force: true });
	});

	it("calculates completed over non-deleted tasks", () => {
		expect(
			calculateTaskProgress([
				{
					id: "a",
					subject: "A",
					status: "completed",
					activeForm: "A",
					blocks: [],
					blockedBy: [],
					createdAt: "",
					updatedAt: "",
				},
				{
					id: "b",
					subject: "B",
					status: "pending",
					activeForm: "B",
					blocks: [],
					blockedBy: [],
					createdAt: "",
					updatedAt: "",
				},
				{
					id: "c",
					subject: "C",
					status: "deleted",
					activeForm: "C",
					blocks: [],
					blockedBy: [],
					createdAt: "",
					updatedAt: "",
				},
			]),
		).toEqual({ done: 1, total: 2 });
	});

	it("updates when the session task store is created and changed", async () => {
		const sessionId = "session-1";
		const filePath = getTaskStorePath(cwd, sessionId);
		const updates: Array<{ done: number; total: number }> = [];
		const provider = new TaskProgressProvider(cwd, sessionId);
		provider.onChange((progress) => updates.push(progress));

		try {
			mkdirSync(dirname(filePath), { recursive: true });
			writeFileSync(
				filePath,
				`${JSON.stringify({
					cwd,
					sessionId,
					tasks: [
						{
							id: "a",
							subject: "A",
							status: "pending",
							activeForm: "A",
							blocks: [],
							blockedBy: [],
							createdAt: "",
							updatedAt: "",
						},
					],
				})}\n`,
				"utf-8",
			);
			await waitFor(() => updates.some((progress) => progress.done === 0 && progress.total === 1));

			writeFileSync(
				filePath,
				`${JSON.stringify({
					cwd,
					sessionId,
					tasks: [
						{
							id: "a",
							subject: "A",
							status: "completed",
							activeForm: "A",
							blocks: [],
							blockedBy: [],
							createdAt: "",
							updatedAt: "",
						},
					],
				})}\n`,
				"utf-8",
			);
			await waitFor(() => updates.some((progress) => progress.done === 1 && progress.total === 1));
		} finally {
			provider.dispose();
		}
	});
});

import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ENV_AGENT_DIR } from "../src/config.ts";
import type { ExtensionContext } from "../src/core/extensions/types.ts";
import {
	createMemoryDeleteToolDefinition,
	createMemoryReadToolDefinition,
	createMemorySearchToolDefinition,
	createMemoryWriteToolDefinition,
} from "../src/core/tools/memory.ts";

function text(result: { content: Array<{ type: string; text?: string }> }): string {
	return result.content.map((part) => part.text ?? "").join("\n");
}

async function executeTool<TParams, TDetails>(
	tool: {
		execute: (
			toolCallId: string,
			params: TParams,
			signal: AbortSignal | undefined,
			onUpdate: undefined,
			ctx: ExtensionContext,
		) => Promise<{ content: Array<{ type: string; text?: string }>; details: TDetails }>;
	},
	toolCallId: string,
	params: TParams,
): Promise<{ content: Array<{ type: string; text?: string }>; details: TDetails }> {
	const ctx = {} as ExtensionContext;
	return await tool.execute(toolCallId, params, undefined, undefined, ctx);
}

describe("memory tools", () => {
	let tempDir: string;
	let agentDir: string;
	let cwd: string;
	let previousAgentDir: string | undefined;

	beforeEach(() => {
		tempDir = join(tmpdir(), `havliand-memory-tools-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		agentDir = join(tempDir, "agent");
		cwd = join(tempDir, "project");
		mkdirSync(agentDir, { recursive: true });
		mkdirSync(cwd, { recursive: true });
		previousAgentDir = process.env[ENV_AGENT_DIR];
		process.env[ENV_AGENT_DIR] = agentDir;
	});

	afterEach(() => {
		if (previousAgentDir === undefined) {
			delete process.env[ENV_AGENT_DIR];
		} else {
			process.env[ENV_AGENT_DIR] = previousAgentDir;
		}
		rmSync(tempDir, { recursive: true, force: true });
	});

	it("writes an indexed user memory, searches the index, reads the body, and deletes it", async () => {
		const write = createMemoryWriteToolDefinition(cwd);
		const search = createMemorySearchToolDefinition(cwd);
		const read = createMemoryReadToolDefinition(cwd);
		const deleteTool = createMemoryDeleteToolDefinition(cwd);

		await executeTool(write, "write", {
			name: "repo-preferences",
			description: "Repository coding preferences",
			content: "Use exact dependency pins and avoid inline imports.",
			type: "project-note",
			scope: "user",
		});

		const indexPath = join(agentDir, "memory", "MEMORY.md");
		expect(readFileSync(indexPath, "utf-8")).toContain("[[repo-preferences]] - Repository coding preferences");

		const searchResult = await executeTool(search, "search", { query: "coding preferences" });
		expect(text(searchResult)).toContain("repo-preferences");
		expect(searchResult.details.memories?.[0]).not.toHaveProperty("content");

		const readResult = await executeTool(read, "read", { name: "repo-preferences" });
		expect(text(readResult)).toContain("Use exact dependency pins");

		await executeTool(deleteTool, "delete", { name: "repo-preferences" });
		expect(existsSync(join(agentDir, "memory", "repo-preferences.md"))).toBe(false);
		expect(readFileSync(indexPath, "utf-8")).not.toContain("repo-preferences");
	});

	it("keeps project memories separate from user memories", async () => {
		const write = createMemoryWriteToolDefinition(cwd);
		const search = createMemorySearchToolDefinition(cwd);

		await executeTool(write, "write", {
			name: "local-note",
			description: "Project scoped note",
			content: "Only for this checkout.",
			scope: "project",
		});

		expect(readFileSync(join(cwd, ".havliand_agent", "memory", "MEMORY.md"), "utf-8")).toContain("local-note");
		expect(text(await executeTool(search, "search", { scope: "user" }))).toBe("No memories.");
		expect(text(await executeTool(search, "search", { scope: "project" }))).toContain("local-note");
	});
});

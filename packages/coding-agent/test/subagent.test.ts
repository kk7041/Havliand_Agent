import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ENV_AGENT_DIR } from "../src/config.ts";
import {
	createSubagentToolDefinition,
	discoverAgents,
	formatSubagentPanelOptions,
	type SubagentDetails,
} from "../src/core/subagent/index.ts";
import { initTheme } from "../src/modes/interactive/theme/theme.ts";

describe("built-in subagents", () => {
	let tempDir: string;
	let agentDir: string;
	let cwd: string;
	let previousAgentDir: string | undefined;

	beforeEach(() => {
		tempDir = join(tmpdir(), `subagent-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
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

	it("always discovers OG and Angel as built-in agents", () => {
		const { agents } = discoverAgents(cwd, "user");

		expect(agents.find((agent) => agent.name === "OG")?.source).toBe("builtin");
		expect(agents.find((agent) => agent.name === "Angel")?.source).toBe("builtin");
		expect(agents.find((agent) => agent.name === "OG")?.model).toBe("aicodewith-openai/deepseek-v4-pro");
		expect(agents.find((agent) => agent.name === "Angel")?.model).toBe("aicodewith-openai/gpt-5.5");
	});

	it("lists built-in and user agents in the subagent tool description", () => {
		const userAgentsDir = join(agentDir, "agents");
		mkdirSync(userAgentsDir, { recursive: true });
		writeFileSync(
			join(userAgentsDir, "reviewer.md"),
			`---
name: reviewer
description: user reviewer
---
Review code.`,
		);

		const tool = createSubagentToolDefinition(cwd);

		expect(tool.description).toContain("OG (builtin): Research and fact-finding");
		expect(tool.description).toContain("Angel (builtin): Execution lead");
		expect(tool.description).toContain("reviewer (user): user reviewer");
	});

	it("does not allow user or project agents to override built-in OG and Angel", () => {
		const userAgentsDir = join(agentDir, "agents");
		const projectAgentsDir = join(cwd, ".havliand_agent", "agents");
		mkdirSync(userAgentsDir, { recursive: true });
		mkdirSync(projectAgentsDir, { recursive: true });

		writeFileSync(
			join(userAgentsDir, "OG.md"),
			`---
name: OG
description: user override
---
User override.`,
		);
		writeFileSync(
			join(projectAgentsDir, "Angel.md"),
			`---
name: Angel
description: project override
---
Project override.`,
		);

		const { agents } = discoverAgents(cwd, "both");

		expect(agents.find((agent) => agent.name === "OG")?.source).toBe("builtin");
		expect(agents.find((agent) => agent.name === "Angel")?.source).toBe("builtin");
	});

	it("keeps non-built-in custom agents discoverable", () => {
		const userAgentsDir = join(agentDir, "agents");
		const projectAgentsDir = join(cwd, ".havliand_agent", "agents");
		mkdirSync(userAgentsDir, { recursive: true });
		mkdirSync(projectAgentsDir, { recursive: true });

		writeFileSync(
			join(userAgentsDir, "reviewer.md"),
			`---
name: reviewer
description: user reviewer
---
Review code.`,
		);
		writeFileSync(
			join(projectAgentsDir, "planner.md"),
			`---
name: planner
description: project planner
---
Plan work.`,
		);

		const { agents } = discoverAgents(cwd, "both");

		expect(agents.find((agent) => agent.name === "reviewer")?.source).toBe("user");
		expect(agents.find((agent) => agent.name === "planner")?.source).toBe("project");
	});

	it("formats subagent live panel rows with status, action, elapsed time, and usage", () => {
		initTheme("dark");
		const details: SubagentDetails = {
			mode: "parallel",
			agentScope: "user",
			projectAgentsDir: null,
			results: [
				{
					agent: "OG",
					agentSource: "builtin",
					task: "inspect",
					exitCode: -1,
					messages: [
						{
							role: "assistant",
							content: [{ type: "toolCall", id: "t1", name: "grep", arguments: { pattern: "auth", path: "." } }],
							api: "anthropic-messages",
							provider: "anthropic",
							model: "claude",
							usage: {
								input: 0,
								output: 0,
								cacheRead: 0,
								cacheWrite: 0,
								totalTokens: 0,
								cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
							},
							stopReason: "toolUse",
							timestamp: 1000,
						},
					],
					stderr: "",
					usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, contextTokens: 0, turns: 0 },
					startedAt: 1000,
				},
				{
					agent: "Angel",
					agentSource: "builtin",
					task: "implement",
					exitCode: 0,
					messages: [],
					stderr: "",
					usage: { input: 1200, output: 800, cacheRead: 0, cacheWrite: 0, cost: 0.01, contextTokens: 0, turns: 1 },
					startedAt: 1000,
					finishedAt: 6100,
					model: "aicodewith-openai/gpt-5.5",
				},
			],
		};

		const panel = formatSubagentPanelOptions(details, 3500);

		expect(panel.subtitle).toContain("live: 1");
		expect(panel.subtitle).toContain("done: 1");
		expect(panel.rows?.join("\n")).toContain("RUN");
		expect(panel.rows?.join("\n")).toContain("DONE");
		expect(panel.rows?.join("\n")).toContain("grep");
		expect(panel.rows?.join("\n")).toContain("2.5s");
		expect(panel.rows?.join("\n")).toContain("aicodewith-openai/gpt-5.5");
	});
});

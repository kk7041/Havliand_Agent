import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ENV_AGENT_DIR } from "../src/config.ts";
import { discoverAgents } from "../src/core/subagent/index.ts";

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
});

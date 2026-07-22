/**
 * Agent discovery and configuration
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { stringify } from "yaml";
import { CONFIG_DIR_NAME, getAgentDir } from "../../config.ts";
import { parseFrontmatter } from "../../utils/frontmatter.ts";

export type AgentScope = "user" | "project" | "both";

export interface AgentConfig {
	name: string;
	description: string;
	tools?: string[];
	model?: string;
	systemPrompt: string;
	source: "builtin" | "user" | "project";
	filePath: string;
}

export interface AgentDiscoveryResult {
	agents: AgentConfig[];
	projectAgentsDir: string | null;
}

const BUILTIN_AGENTS: AgentConfig[] = [
	{
		name: "OG",
		description: "Research and fact-finding subagent that investigates, verifies, and explains problems objectively",
		tools: ["read", "grep", "find", "ls", "bash"],
		model: process.env.HAVLIAND_SUBAGENT_OG_MODEL,
		systemPrompt: `You are OG, the research and fact-finding subagent for havliand_agent.

Hierarchy:
- havliand_agent is the main brain. It investigates at the orchestration level, gives orders, and validates final results.
- Angel is the execution lead above you in the execution layer.
- You obey tasks delegated by havliand_agent. If Angel provides execution-context requirements through havliand_agent, respect them.

Role:
- Investigate facts.
- Read code, docs, logs, command output, and configuration.
- Explain what is true, what is uncertain, and what evidence supports each claim.
- Identify risks, blockers, root causes, and likely next steps.

Operating rules:
- Be objective and precise.
- Do not implement changes unless the delegated task explicitly asks for a small read-only-safe diagnostic script or command.
- Prefer read-only tools: read, grep, find, ls.
- Use bash for read-only inspection commands when it materially improves accuracy.
- Do not invent missing facts. Say what you could not verify.
- Return concise findings that havliand_agent can use to issue execution instructions.

Output format:

## Findings
- Concrete finding with evidence.

## Evidence
- \`path/to/file:line\` or command inspected - what it proves.

## Risks And Unknowns
- Anything not verified or potentially risky.

## Recommendation
- What havliand_agent should do next.`,
		source: "builtin",
		filePath: "<builtin:OG>",
	},
	{
		name: "Angel",
		description: "Execution lead subagent that implements delegated work under havliand_agent direction",
		model: process.env.HAVLIAND_SUBAGENT_ANGEL_MODEL,
		systemPrompt: `You are Angel, the execution lead subagent for havliand_agent.

Hierarchy:
- havliand_agent is the main brain. It decides strategy, issues commands, and performs final validation.
- Angel is the execution-layer lead.
- OG is below Angel in the execution layer and focuses on research, fact-finding, and issue explanation.
- You and OG both obey havliand_agent. You do not override havliand_agent's instructions.

Role:
- Execute implementation tasks delegated by havliand_agent.
- Apply code, configuration, documentation, and script changes when explicitly asked.
- Use OG's findings when havliand_agent provides them.
- Keep changes focused and avoid unrelated refactors.

Operating rules:
- Follow the repository instructions and existing code style.
- Before changing behavior, understand the current implementation enough to avoid regressions.
- Prefer minimal correct changes.
- Preserve user work and unrelated changes.
- Run focused validation when practical.
- Report exactly what changed, what was verified, and what remains.

Output format:

## Completed
- What you changed or executed.

## Files Changed
- \`path/to/file\` - short description.

## Validation
- Commands run and outcomes.

## Notes For havliand_agent
- Follow-up risks, open questions, or handoff details.`,
		source: "builtin",
		filePath: "<builtin:Angel>",
	},
];

const BUILTIN_AGENT_NAMES = new Set(BUILTIN_AGENTS.map((agent) => agent.name));

type AgentFrontmatter = {
	name?: unknown;
	description?: unknown;
	tools?: unknown;
	model?: unknown;
};

function stringField(value: unknown): string | undefined {
	return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function toolsField(value: unknown): string[] | undefined {
	if (typeof value === "string") {
		const tools = value
			.split(",")
			.map((tool) => tool.trim())
			.filter(Boolean);
		return tools.length > 0 ? tools : undefined;
	}
	if (Array.isArray(value)) {
		const tools = value.filter((tool): tool is string => typeof tool === "string").map((tool) => tool.trim());
		const nonEmptyTools = tools.filter(Boolean);
		return nonEmptyTools.length > 0 ? nonEmptyTools : undefined;
	}
	return undefined;
}

function mergeAgentOverlay(base: AgentConfig, overlay: AgentConfig): AgentConfig {
	return {
		...base,
		description: overlay.description || base.description,
		tools: overlay.tools ?? base.tools,
		model: overlay.model ?? base.model,
		systemPrompt: overlay.systemPrompt.trim() ? overlay.systemPrompt : base.systemPrompt,
		source: overlay.source,
		filePath: overlay.filePath,
	};
}

function loadAgentsFromDir(dir: string, source: "user" | "project"): AgentConfig[] {
	const agents: AgentConfig[] = [];

	if (!fs.existsSync(dir)) {
		return agents;
	}

	let entries: fs.Dirent[];
	try {
		entries = fs.readdirSync(dir, { withFileTypes: true });
	} catch {
		return agents;
	}

	for (const entry of entries) {
		if (!entry.name.endsWith(".md")) continue;
		if (!entry.isFile() && !entry.isSymbolicLink()) continue;

		const filePath = path.join(dir, entry.name);
		let content: string;
		try {
			content = fs.readFileSync(filePath, "utf-8");
		} catch {
			continue;
		}

		const { frontmatter, body } = parseFrontmatter<AgentFrontmatter>(content);

		const name = stringField(frontmatter.name);
		if (!name) {
			continue;
		}

		const description = stringField(frontmatter.description);
		if (!description && !BUILTIN_AGENT_NAMES.has(name)) {
			continue;
		}

		const tools = toolsField(frontmatter.tools);
		const model = stringField(frontmatter.model);

		agents.push({
			name,
			description: description ?? "",
			tools,
			model,
			systemPrompt: body,
			source,
			filePath,
		});
	}

	return agents;
}

function isDirectory(p: string): boolean {
	try {
		return fs.statSync(p).isDirectory();
	} catch {
		return false;
	}
}

function findNearestProjectAgentsDir(cwd: string): string | null {
	let currentDir = cwd;
	while (true) {
		const candidate = path.join(currentDir, CONFIG_DIR_NAME, "agents");
		if (isDirectory(candidate)) return candidate;

		const parentDir = path.dirname(currentDir);
		if (parentDir === currentDir) return null;
		currentDir = parentDir;
	}
}

export function discoverAgents(cwd: string, scope: AgentScope): AgentDiscoveryResult {
	const userDir = path.join(getAgentDir(), "agents");
	const projectAgentsDir = findNearestProjectAgentsDir(cwd);

	const userAgents = scope === "project" ? [] : loadAgentsFromDir(userDir, "user");
	const projectAgents = scope === "user" || !projectAgentsDir ? [] : loadAgentsFromDir(projectAgentsDir, "project");

	const agentMap = new Map<string, AgentConfig>();

	for (const agent of BUILTIN_AGENTS) {
		agentMap.set(agent.name, agent);
	}

	const addCustomAgent = (agent: AgentConfig): void => {
		const existing = agentMap.get(agent.name);
		agentMap.set(agent.name, existing ? mergeAgentOverlay(existing, agent) : agent);
	};

	if (scope === "both") {
		for (const agent of userAgents) addCustomAgent(agent);
		for (const agent of projectAgents) addCustomAgent(agent);
	} else if (scope === "user") {
		for (const agent of userAgents) addCustomAgent(agent);
	} else {
		for (const agent of projectAgents) addCustomAgent(agent);
	}

	return { agents: Array.from(agentMap.values()), projectAgentsDir };
}

export function writeUserAgentModelOverride(agent: AgentConfig, model: string): string {
	const userAgentsDir = path.join(getAgentDir(), "agents");
	fs.mkdirSync(userAgentsDir, { recursive: true });

	const filePath =
		agent.source === "user" && agent.filePath !== `<builtin:${agent.name}>`
			? agent.filePath
			: path.join(userAgentsDir, `${agent.name}.md`);

	let frontmatter: Record<string, unknown> = {};
	let body = "";
	if (fs.existsSync(filePath)) {
		const parsed = parseFrontmatter<Record<string, unknown>>(fs.readFileSync(filePath, "utf-8"));
		frontmatter = { ...parsed.frontmatter };
		body = parsed.body;
	}

	frontmatter.name = typeof frontmatter.name === "string" && frontmatter.name.trim() ? frontmatter.name : agent.name;
	frontmatter.description =
		typeof frontmatter.description === "string" && frontmatter.description.trim()
			? frontmatter.description
			: agent.description;
	frontmatter.model = model;

	const yaml = stringify(frontmatter).trimEnd();
	const content = `---\n${yaml}\n---${body ? `\n${body.trimEnd()}\n` : "\n"}`;
	fs.writeFileSync(filePath, content, { encoding: "utf-8", mode: 0o600 });
	return filePath;
}

export function formatAgentList(agents: AgentConfig[], maxItems: number): { text: string; remaining: number } {
	if (agents.length === 0) return { text: "none", remaining: 0 };
	const listed = agents.slice(0, maxItems);
	const remaining = agents.length - listed.length;
	return {
		text: listed.map((a) => `${a.name} (${a.source}): ${a.description}`).join("; "),
		remaining,
	};
}

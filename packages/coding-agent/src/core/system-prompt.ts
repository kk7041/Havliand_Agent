/**
 * System prompt construction and project context loading
 */

import { getDocsPath, getExamplesPath, getReadmePath } from "../config.ts";
import { formatSkillsForPrompt, type Skill } from "./skills.ts";

export interface BuildSystemPromptOptions {
	/** Custom system prompt (replaces default). */
	customPrompt?: string;
	/** Tools to include in prompt. Default: [read, bash, edit, write] */
	selectedTools?: string[];
	/** Optional one-line tool snippets keyed by tool name. */
	toolSnippets?: Record<string, string>;
	/** Additional guideline bullets appended to the default system prompt guidelines. */
	promptGuidelines?: string[];
	/** Text to append to system prompt. */
	appendSystemPrompt?: string;
	/** Working directory. */
	cwd: string;
	/** Pre-loaded context files. */
	contextFiles?: Array<{ path: string; content: string }>;
	/** Pre-loaded skills. */
	skills?: Skill[];
	/** Pre-formatted available subagent list. */
	availableAgents?: string;
}

function formatSubagentDelegationSection(availableAgents: string | undefined): string {
	if (!availableAgents?.trim()) {
		return "";
	}
	return `

Delegating to subagents (MANDATORY):
- You have a \`subagent\` tool that runs specialized agents in isolated context windows.
- Available agents: ${availableAgents}
- You are the single hub. Research agents (such as OG) and execution agents (such as Angel) are peers: they NEVER talk to each other and both report only to you. You are the only one who reviews work and controls the loop.
- You MUST delegate research, investigation, fact-finding, web/documentation lookup, and root-cause analysis to a research agent such as OG. Do NOT do this yourself with your own tools.
- You MUST delegate implementation, code edits, and scripted changes to an execution agent such as Angel. Do NOT do this yourself with your own tools.
- Before starting any multi-step research or implementation, your FIRST action must be a \`subagent\` call, not a direct \`bash\`/\`grep\`/\`read\`/web request.
- Standard loop: (1) clarify the requirement; (2) delegate investigation to a research agent, which returns its report only to you; (3) read the report and write the plan yourself; (4) hand that plan to an execution agent — pass your own plan and instructions, NOT the research agent's raw findings; (5) when execution returns, review it yourself; (6) if you find problems, send it back to the same execution agent to fix, and repeat review→fix until you are satisfied. Only then is the loop done.
- NEVER forward a research agent's findings directly to an execution agent. Research output exists to inform the plan YOU write; the execution agent acts on your plan alone.
- The ONLY work you may do directly: at most two quick lookups per turn to decide what to delegate, and validating/synthesizing subagent results after a \`subagent\` call. Reading files to understand a problem is research — delegate it, even when the user names the file.
- The harness enforces this: once the per-turn lookup allowance is used, direct exploration tools (read/grep/find/ls and read-only bash) are blocked until you make a \`subagent\` call.
- Your role is orchestration and final validation: decide the plan, delegate the work, review the results, and drive the fix loop.`;
}

/** Build the system prompt with tools, guidelines, and context */
export function buildSystemPrompt(options: BuildSystemPromptOptions): string {
	const {
		customPrompt,
		selectedTools,
		toolSnippets,
		promptGuidelines,
		appendSystemPrompt,
		cwd,
		contextFiles: providedContextFiles,
		skills: providedSkills,
		availableAgents,
	} = options;
	const promptCwd = cwd.replace(/\\/g, "/");

	const appendSection = appendSystemPrompt ? `\n\n${appendSystemPrompt}` : "";

	const contextFiles = providedContextFiles ?? [];
	const skills = providedSkills ?? [];

	if (customPrompt) {
		let prompt = customPrompt;

		if (appendSection) {
			prompt += appendSection;
		}

		// Append project context files
		if (contextFiles.length > 0) {
			prompt += "\n\n<project_context>\n\n";
			prompt += "Project-specific instructions and guidelines:\n\n";
			for (const { path: filePath, content } of contextFiles) {
				prompt += `<project_instructions path="${filePath}">\n${content}\n</project_instructions>\n\n`;
			}
			prompt += "</project_context>\n";
		}

		// Append skills section (only if read tool is available)
		const customPromptHasRead = !selectedTools || selectedTools.includes("read");
		if (customPromptHasRead && skills.length > 0) {
			prompt += formatSkillsForPrompt(skills);
		}

		if (selectedTools?.includes("subagent")) {
			prompt += formatSubagentDelegationSection(availableAgents);
		}

		prompt += `\nCurrent working directory: ${promptCwd}`;

		return prompt;
	}

	// Get absolute paths to documentation and examples
	const readmePath = getReadmePath();
	const docsPath = getDocsPath();
	const examplesPath = getExamplesPath();

	// Build tools list based on selected tools.
	// A tool appears in Available tools only when the caller provides a one-line snippet.
	const tools = selectedTools || ["read", "bash", "edit", "write"];
	const visibleTools = tools.filter((name) => !!toolSnippets?.[name]);
	const toolsList =
		visibleTools.length > 0 ? visibleTools.map((name) => `- ${name}: ${toolSnippets![name]}`).join("\n") : "(none)";

	// Build guidelines based on which tools are actually available
	const guidelinesList: string[] = [];
	const guidelinesSet = new Set<string>();
	const addGuideline = (guideline: string): void => {
		if (guidelinesSet.has(guideline)) {
			return;
		}
		guidelinesSet.add(guideline);
		guidelinesList.push(guideline);
	};

	const hasBash = tools.includes("bash");
	const hasGrep = tools.includes("grep");
	const hasFind = tools.includes("find");
	const hasLs = tools.includes("ls");
	const hasRead = tools.includes("read");
	const hasSubagent = tools.includes("subagent");

	// File exploration guidelines
	if (hasBash && !hasGrep && !hasFind && !hasLs) {
		addGuideline("Use bash for file operations like ls, rg, find");
	}

	for (const guideline of promptGuidelines ?? []) {
		const normalized = guideline.trim();
		if (normalized.length > 0) {
			addGuideline(normalized);
		}
	}

	// Always include these
	addGuideline("Be concise in your responses");
	addGuideline("Show file paths clearly when working with files");

	const guidelines = guidelinesList.map((g) => `- ${g}`).join("\n");

	const delegationSection = hasSubagent ? formatSubagentDelegationSection(availableAgents) : "";

	// When delegation is mandatory, the opener must not invite direct work —
	// "you help users by reading files and executing commands" contradicts it.
	const opener = delegationSection
		? `You are the main brain of havliand_agent, a coding agent harness. You orchestrate work: you delegate research and implementation to subagents, then validate and synthesize their results. Your own tools exist for orchestration and final validation, not for doing the work yourself.`
		: `You are an expert coding assistant operating inside havliand_agent, a coding agent harness. You help users by reading files, executing commands, editing code, and writing new files.`;

	let prompt = `${opener}${delegationSection}

Available tools:
${toolsList}

In addition to the tools above, you may have access to other custom tools depending on the project.

Guidelines:
${guidelines}

havliand_agent documentation (read only when the user asks about havliand_agent itself, its SDK, extensions, themes, skills, or TUI):
- Main documentation: ${readmePath}
- Additional docs: ${docsPath}
- Examples: ${examplesPath} (extensions, custom tools, SDK)
- When reading havliand_agent docs or examples, resolve docs/... under Additional docs and examples/... under Examples, not the current working directory
- When asked about: extensions (docs/extensions.md, examples/extensions/), themes (docs/themes.md), skills (docs/skills.md), prompt templates (docs/prompt-templates.md), TUI components (docs/tui.md), keybindings (docs/keybindings.md), SDK integrations (docs/sdk.md), custom providers (docs/custom-provider.md), adding models (docs/models.md), HavliandAgent packages (docs/packages.md)
- When working on havliand_agent topics, read the docs and examples, and follow .md cross-references before implementing
- Always read HavliandAgent .md files completely and follow links to related docs (e.g., tui.md for TUI API details)`;

	if (appendSection) {
		prompt += appendSection;
	}

	// Append project context files
	if (contextFiles.length > 0) {
		prompt += "\n\n<project_context>\n\n";
		prompt += "Project-specific instructions and guidelines:\n\n";
		for (const { path: filePath, content } of contextFiles) {
			prompt += `<project_instructions path="${filePath}">\n${content}\n</project_instructions>\n\n`;
		}
		prompt += "</project_context>\n";
	}

	// Append skills section (only if read tool is available)
	if (hasRead && skills.length > 0) {
		prompt += formatSkillsForPrompt(skills);
	}

	prompt += `\nCurrent working directory: ${promptCwd}`;

	return prompt;
}

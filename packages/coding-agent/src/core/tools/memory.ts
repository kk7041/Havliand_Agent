import { createHash } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { Text } from "@havliand_agent/tui";
import { type Static, Type } from "typebox";
import { stringify } from "yaml";
import { getAgentDir } from "../../config.ts";
import type { Theme } from "../../modes/interactive/theme/theme.ts";
import { parseFrontmatter } from "../../utils/frontmatter.ts";
import type { ToolDefinition, ToolRenderResultOptions } from "../extensions/types.ts";
import { withFileMutationQueue } from "./file-mutation-queue.ts";
import { str, toolHeader } from "./render-utils.ts";

const memoryWriteSchema = Type.Object({
	name: Type.String({ description: "Stable memory name" }),
	description: Type.String({ description: "Short index description" }),
	content: Type.String({ description: "Memory body" }),
	type: Type.Optional(Type.String({ description: "Memory type" })),
	scope: Type.Optional(Type.String({ description: "user or project. Default user" })),
});

const memorySearchSchema = Type.Object({
	query: Type.Optional(Type.String({ description: "Text to search in memory names and descriptions" })),
	scope: Type.Optional(Type.String({ description: "user, project, or both. Default both" })),
	limit: Type.Optional(Type.Number({ description: "Maximum memories to return" })),
});

const memoryReadSchema = Type.Object({
	name: Type.String({ description: "Memory name" }),
	scope: Type.Optional(Type.String({ description: "user, project, or both. Default both" })),
});

const memoryDeleteSchema = Type.Object({
	name: Type.String({ description: "Memory name" }),
	scope: Type.Optional(Type.String({ description: "user or project. Default user" })),
});

type MemoryScope = "user" | "project";

interface MemoryIndexEntry {
	name: string;
	description: string;
	type?: string;
	scope: MemoryScope;
	filePath: string;
}

export interface MemoryToolDetails {
	memories?: MemoryIndexEntry[];
	memory?: MemoryIndexEntry & { content: string };
}

function projectMemoryRoot(cwd: string): string {
	return join(cwd, ".havliand_agent", "memory");
}

function userMemoryRoot(): string {
	return join(getAgentDir(), "memory");
}

function memoryRoot(scope: MemoryScope, cwd: string): string {
	return scope === "project" ? projectMemoryRoot(cwd) : userMemoryRoot();
}

function safeName(name: string): string {
	const trimmed = name.trim();
	const slug = trimmed
		.toLowerCase()
		.replace(/[^a-z0-9._-]+/g, "-")
		.replace(/^-+|-+$/g, "");
	return slug || createHash("sha256").update(trimmed).digest("hex").slice(0, 12);
}

function normalizeScope(value: unknown, fallback: MemoryScope = "user"): MemoryScope {
	return value === "project" ? "project" : value === "user" ? "user" : fallback;
}

function selectedScopes(value: unknown): MemoryScope[] {
	if (value === "user") return ["user"];
	if (value === "project") return ["project"];
	return ["user", "project"];
}

function memoryFilePath(cwd: string, scope: MemoryScope, name: string): string {
	return join(memoryRoot(scope, cwd), `${safeName(name)}.md`);
}

async function readMemoryFile(
	filePath: string,
	scope: MemoryScope,
): Promise<(MemoryIndexEntry & { content: string }) | null> {
	try {
		const raw = await readFile(filePath, "utf-8");
		const parsed = parseFrontmatter<{ name?: unknown; description?: unknown; type?: unknown }>(raw);
		const name = typeof parsed.frontmatter.name === "string" ? parsed.frontmatter.name.trim() : "";
		const description =
			typeof parsed.frontmatter.description === "string" ? parsed.frontmatter.description.trim() : "";
		if (!name || !description) return null;
		const type = typeof parsed.frontmatter.type === "string" ? parsed.frontmatter.type.trim() : undefined;
		return { name, description, type, scope, filePath, content: parsed.body.trim() };
	} catch {
		return null;
	}
}

async function listMemories(
	cwd: string,
	scopes: MemoryScope[],
): Promise<Array<MemoryIndexEntry & { content: string }>> {
	const memories: Array<MemoryIndexEntry & { content: string }> = [];
	for (const scope of scopes) {
		const root = memoryRoot(scope, cwd);
		if (!existsSync(root)) continue;
		const entries = await readdir(root, { withFileTypes: true });
		for (const entry of entries) {
			if (!entry.isFile() || !entry.name.endsWith(".md") || entry.name === "MEMORY.md") continue;
			const memory = await readMemoryFile(join(root, entry.name), scope);
			if (memory) memories.push(memory);
		}
	}
	return memories;
}

async function writeIndex(cwd: string, scope: MemoryScope): Promise<void> {
	const root = memoryRoot(scope, cwd);
	mkdirSync(root, { recursive: true });
	const memories = await listMemories(cwd, [scope]);
	const lines = memories
		.sort((a, b) => a.name.localeCompare(b.name))
		.map((memory) => `- [[${memory.name}]] - ${memory.description}`);
	await writeFile(join(root, "MEMORY.md"), `${lines.join("\n")}${lines.length > 0 ? "\n" : ""}`, "utf-8");
}

function formatMemoryIndex(memories: MemoryIndexEntry[]): string {
	if (memories.length === 0) return "No memories.";
	return memories
		.map((memory, index) => `${index + 1}. ${memory.name} (${memory.scope}) - ${memory.description}`)
		.join("\n");
}

function renderMemoryCall(title: string, args: Record<string, unknown>, theme: Theme, previous?: Text): Text {
	const text = previous ?? new Text("", 0, 0);
	text.setText(`${toolHeader(title, theme)} ${theme.fg("accent", str(args.name) ?? str(args.query) ?? "")}`);
	return text;
}

function renderMemoryResult(
	result: { content: Array<{ type: string; text?: string }> },
	options: ToolRenderResultOptions,
	theme: Theme,
	previous?: Text,
): Text {
	const text = previous ?? new Text("", 0, 0);
	const output = result.content
		.filter((part) => part.type === "text")
		.map((part) => part.text ?? "")
		.join("\n");
	const lines = output.split("\n");
	const shown = options.expanded ? lines : lines.slice(0, 20);
	const remaining = lines.length - shown.length;
	let rendered = `\n${shown.map((line) => theme.fg("toolOutput", line)).join("\n")}`;
	if (remaining > 0) rendered += theme.fg("muted", `\n... (${remaining} more lines)`);
	text.setText(rendered);
	return text;
}

export function createMemoryWriteToolDefinition(
	cwd: string,
): ToolDefinition<typeof memoryWriteSchema, MemoryToolDetails> {
	return {
		name: "memory_write",
		label: "memory_write",
		description: "Write or update a persistent memory file.",
		promptSnippet: "Write persistent memory",
		parameters: memoryWriteSchema,
		async execute(_toolCallId, params) {
			const scope = normalizeScope(params.scope);
			const filePath = memoryFilePath(cwd, scope, params.name);
			const type = params.type?.trim();
			await withFileMutationQueue(filePath, async () => {
				mkdirSync(dirname(filePath), { recursive: true });
				const frontmatter: Record<string, string> = {
					name: params.name.trim(),
					description: params.description.trim(),
				};
				if (type) frontmatter.type = type;
				await writeFile(
					filePath,
					`---\n${stringify(frontmatter).trimEnd()}\n---\n${params.content.trim()}\n`,
					"utf-8",
				);
			});
			await writeIndex(cwd, scope);
			const memory = await readMemoryFile(filePath, scope);
			return {
				content: [{ type: "text", text: memory ? `Wrote memory ${memory.name} (${scope})` : "Wrote memory." }],
				details: { memory: memory ?? undefined },
			};
		},
		renderCall(args, theme, context) {
			return renderMemoryCall("MemoryWrite", args, theme, context.lastComponent as Text | undefined);
		},
		renderResult(result, options, theme, context) {
			return renderMemoryResult(result as any, options, theme, context.lastComponent as Text | undefined);
		},
	};
}

export function createMemorySearchToolDefinition(
	cwd: string,
): ToolDefinition<typeof memorySearchSchema, MemoryToolDetails> {
	return {
		name: "memory_search",
		label: "memory_search",
		description: "Search persistent memory indexes without loading every memory body.",
		promptSnippet: "Search persistent memory index",
		parameters: memorySearchSchema,
		async execute(_toolCallId, params) {
			const query = params.query?.trim().toLowerCase();
			const limit = Math.max(1, Math.min(params.limit ?? 50, 100));
			let memories = await listMemories(cwd, selectedScopes(params.scope));
			if (query) {
				memories = memories.filter(
					(memory) =>
						memory.name.toLowerCase().includes(query) ||
						memory.description.toLowerCase().includes(query) ||
						memory.type?.toLowerCase().includes(query),
				);
			}
			const index = memories.slice(0, limit).map(({ content: _content, ...memory }) => memory);
			return {
				content: [{ type: "text", text: formatMemoryIndex(index) }],
				details: { memories: index },
			};
		},
		renderCall(args, theme, context) {
			return renderMemoryCall("MemorySearch", args, theme, context.lastComponent as Text | undefined);
		},
		renderResult(result, options, theme, context) {
			return renderMemoryResult(result as any, options, theme, context.lastComponent as Text | undefined);
		},
	};
}

export function createMemoryReadToolDefinition(
	cwd: string,
): ToolDefinition<typeof memoryReadSchema, MemoryToolDetails> {
	return {
		name: "memory_read",
		label: "memory_read",
		description: "Read one persistent memory body by name.",
		promptSnippet: "Read persistent memory",
		parameters: memoryReadSchema,
		async execute(_toolCallId, params) {
			for (const scope of selectedScopes(params.scope)) {
				const memory = await readMemoryFile(memoryFilePath(cwd, scope, params.name), scope);
				if (memory) {
					return {
						content: [{ type: "text", text: `# ${memory.name}\n\n${memory.content}` }],
						details: { memory },
					};
				}
			}
			throw new Error(`Memory not found: ${params.name}`);
		},
		renderCall(args, theme, context) {
			return renderMemoryCall("MemoryRead", args, theme, context.lastComponent as Text | undefined);
		},
		renderResult(result, options, theme, context) {
			return renderMemoryResult(result as any, options, theme, context.lastComponent as Text | undefined);
		},
	};
}

export function createMemoryDeleteToolDefinition(
	cwd: string,
): ToolDefinition<typeof memoryDeleteSchema, MemoryToolDetails> {
	return {
		name: "memory_delete",
		label: "memory_delete",
		description: "Delete a persistent memory by name.",
		promptSnippet: "Delete persistent memory",
		parameters: memoryDeleteSchema,
		async execute(_toolCallId, params) {
			const scope = normalizeScope(params.scope);
			const filePath = memoryFilePath(cwd, scope, params.name);
			await rm(filePath, { force: true });
			await writeIndex(cwd, scope);
			return {
				content: [{ type: "text", text: `Deleted memory ${params.name} (${scope})` }],
				details: {},
			};
		},
		renderCall(args, theme, context) {
			return renderMemoryCall("MemoryDelete", args, theme, context.lastComponent as Text | undefined);
		},
		renderResult(result, options, theme, context) {
			return renderMemoryResult(result as any, options, theme, context.lastComponent as Text | undefined);
		},
	};
}

export type MemoryWriteInput = Static<typeof memoryWriteSchema>;
export type MemorySearchInput = Static<typeof memorySearchSchema>;
export type MemoryReadInput = Static<typeof memoryReadSchema>;
export type MemoryDeleteInput = Static<typeof memoryDeleteSchema>;

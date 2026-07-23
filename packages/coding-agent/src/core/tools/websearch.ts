import type { AgentTool } from "@havliand_agent/agent-core";
import { Text } from "@havliand_agent/tui";
import { type Static, Type } from "typebox";
import type { Theme } from "../../modes/interactive/theme/theme.ts";
import type { ToolDefinition, ToolRenderResultOptions } from "../extensions/types.ts";
import { str, toolHeader } from "./render-utils.ts";
import { wrapToolDefinition } from "./tool-definition-wrapper.ts";

const webSearchSchema = Type.Object({
	query: Type.String({ description: "Search query" }),
	limit: Type.Optional(Type.Number({ description: "Maximum results to return (default: 5)" })),
	site: Type.Optional(Type.String({ description: "Optional site/domain filter, e.g. example.com" })),
});

export type WebSearchToolInput = Static<typeof webSearchSchema>;

export interface WebSearchResult {
	title: string;
	url: string;
	snippet?: string;
}

export interface WebSearchToolDetails {
	results: WebSearchResult[];
}

function decodeHtml(value: string): string {
	return value
		.replace(/&amp;/g, "&")
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
		.replace(/&#([0-9]+);/g, (_, num: string) => String.fromCodePoint(Number.parseInt(num, 10)));
}

function stripTags(value: string): string {
	return decodeHtml(
		value
			.replace(/<[^>]*>/g, " ")
			.replace(/\s+/g, " ")
			.trim(),
	);
}

function normalizeDuckDuckGoUrl(url: string): string {
	try {
		const parsed = new URL(url, "https://duckduckgo.com");
		const uddg = parsed.searchParams.get("uddg");
		if (uddg) {
			return decodeURIComponent(uddg);
		}
		return parsed.toString();
	} catch {
		return url;
	}
}

async function performSearch(query: string, limit: number, site?: string): Promise<WebSearchResult[]> {
	const searchTerms = site ? `${query} site:${site}` : query;
	const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(searchTerms)}&kl=us-en`;
	const response = await fetch(url, {
		headers: {
			"user-agent":
				"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
			"accept-language": "en-US,en;q=0.9",
		},
	});
	if (!response.ok) {
		throw new Error(`Search request failed with HTTP ${response.status}`);
	}

	const html = await response.text();
	const results: WebSearchResult[] = [];
	const blockRegex = /<div class="result[^"]*">([\s\S]*?)<\/div>\s*<\/div>/g;
	for (const match of html.matchAll(blockRegex)) {
		const block = match[1] ?? "";
		const linkMatch = block.match(/<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
		if (!linkMatch) continue;
		const title = stripTags(linkMatch[2] ?? "");
		const urlValue = normalizeDuckDuckGoUrl(linkMatch[1] ?? "");
		const snippetMatch = block.match(/<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/);
		const snippet = snippetMatch ? stripTags(snippetMatch[1] ?? "") : undefined;
		if (!title || !urlValue) continue;
		results.push({ title, url: urlValue, snippet });
		if (results.length >= limit) break;
	}
	return results;
}

function formatResults(results: WebSearchResult[]): string {
	if (results.length === 0) {
		return "No web search results found.";
	}
	return results
		.map((result, index) => {
			const lines = [`${index + 1}. ${result.title}`, `   ${result.url}`];
			if (result.snippet) lines.push(`   ${result.snippet}`);
			return lines.join("\n");
		})
		.join("\n\n");
}

function formatWebSearchCall(
	args: { query?: string; limit?: number; site?: string } | undefined,
	theme: Theme,
): string {
	const query = str(args?.query) ?? "";
	const site = str(args?.site);
	let text = `${toolHeader("WebSearch", theme)} ${theme.fg("accent", query)}`;
	if (site) {
		text += theme.fg("muted", ` site:${site}`);
	}
	if (args?.limit !== undefined) {
		text += theme.fg("toolOutput", ` (limit ${args.limit})`);
	}
	return text;
}

function formatWebSearchResult(
	result: { content: Array<{ type: string; text?: string }>; details?: WebSearchToolDetails },
	options: ToolRenderResultOptions,
	theme: Theme,
): string {
	const output = result.content
		.filter((part) => part.type === "text")
		.map((part) => part.text ?? "")
		.join("\n");
	if (!output) return "";
	const lines = output.split("\n");
	const displayLines = options.expanded ? lines : lines.slice(0, 15);
	const remaining = lines.length - displayLines.length;
	let text = `\n${displayLines.map((line) => theme.fg("toolOutput", line)).join("\n")}`;
	if (remaining > 0) {
		text += theme.fg("muted", `\n... (${remaining} more lines)`);
	}
	return text;
}

export function createWebSearchToolDefinition(
	_cwd: string,
): ToolDefinition<typeof webSearchSchema, WebSearchToolDetails> {
	return {
		name: "websearch",
		label: "websearch",
		description: "Search the web for current facts, documentation, and references.",
		promptSnippet: "Search the web for current facts and documentation",
		parameters: webSearchSchema,
		async execute(_toolCallId, { query, limit, site }: WebSearchToolInput) {
			const effectiveLimit = Math.max(1, Math.min(limit ?? 5, 10));
			const results = await performSearch(query, effectiveLimit, site);
			return {
				content: [{ type: "text", text: formatResults(results) }],
				details: { results },
			};
		},
		renderCall(args, theme, context) {
			const text = (context.lastComponent as Text | undefined) ?? new Text("", 0, 0);
			text.setText(formatWebSearchCall(args, theme));
			return text;
		},
		renderResult(result, options, theme, context) {
			const text = (context.lastComponent as Text | undefined) ?? new Text("", 0, 0);
			text.setText(formatWebSearchResult(result as any, options, theme));
			return text;
		},
	};
}

export function createWebSearchTool(cwd: string): AgentTool<any, WebSearchToolDetails> {
	return wrapToolDefinition(createWebSearchToolDefinition(cwd));
}

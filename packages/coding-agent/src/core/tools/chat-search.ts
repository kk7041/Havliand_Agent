import { Text } from "@havliand_agent/tui";
import { type Static, Type } from "typebox";
import type { Theme } from "../../modes/interactive/theme/theme.ts";
import { type ChatSearchHit, searchChatMessages } from "../chat-storage.ts";
import type { ToolDefinition, ToolRenderResultOptions } from "../extensions/types.ts";
import { str, toolHeader } from "./render-utils.ts";

const chatSearchSchema = Type.Object({
	query: Type.String({ description: "Search query" }),
	cwd: Type.Optional(Type.String({ description: "Exact cwd to search" })),
	sessionId: Type.Optional(Type.String({ description: "Session id to search" })),
	since: Type.Optional(Type.String({ description: "Only messages at or after this timestamp" })),
	until: Type.Optional(Type.String({ description: "Only messages at or before this timestamp" })),
	role: Type.Optional(Type.String({ description: "Message role to search" })),
	limit: Type.Optional(Type.Number({ description: "Maximum hits to return" })),
});

export interface ChatSearchToolDetails {
	hits: ChatSearchHit[];
}

function summarizeHit(hit: ChatSearchHit): string {
	const text = hit.text.length > 240 ? `${hit.text.slice(0, 240)}...` : hit.text;
	return `${hit.sessionId}/${hit.entryId} ${hit.role} ${hit.timestamp}\n${text}`;
}

function formatHits(hits: ChatSearchHit[]): string {
	if (hits.length === 0) return "No chat matches.";
	return hits.map((hit, index) => `${index + 1}. ${summarizeHit(hit)}`).join("\n\n");
}

function renderChatSearchCall(args: Record<string, unknown>, theme: Theme, previous?: Text): Text {
	const text = previous ?? new Text("", 0, 0);
	text.setText(`${toolHeader("ChatSearch", theme)} ${theme.fg("accent", str(args.query) ?? "")}`);
	return text;
}

function renderChatSearchResult(
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
	const shown = options.expanded ? lines : lines.slice(0, 18);
	const remaining = lines.length - shown.length;
	let rendered = `\n${shown.map((line) => theme.fg("toolOutput", line)).join("\n")}`;
	if (remaining > 0) rendered += theme.fg("muted", `\n... (${remaining} more lines)`);
	text.setText(rendered);
	return text;
}

export function createChatSearchToolDefinition(
	_cwd: string,
): ToolDefinition<typeof chatSearchSchema, ChatSearchToolDetails> {
	return {
		name: "chat_search",
		label: "chat_search",
		description: "Search locally mirrored chat history in Postgres.",
		promptSnippet: "Search prior chat history",
		parameters: chatSearchSchema,
		async execute(_toolCallId, params) {
			const hits = await searchChatMessages(params as Static<typeof chatSearchSchema>);
			return {
				content: [{ type: "text", text: formatHits(hits) }],
				details: { hits },
			};
		},
		renderCall(args, theme, context) {
			return renderChatSearchCall(args, theme, context.lastComponent as Text | undefined);
		},
		renderResult(result, options, theme, context) {
			return renderChatSearchResult(result as any, options, theme, context.lastComponent as Text | undefined);
		},
	};
}

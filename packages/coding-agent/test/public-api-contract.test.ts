import { describe, expect, test } from "vitest";
import {
	allToolNames,
	createTool,
	createToolDefinition,
	isBashToolResult,
	isEditToolResult,
	isFindToolResult,
	isGrepToolResult,
	isLsToolResult,
	isReadToolResult,
	isWriteToolResult,
	type ToolResultEvent,
} from "../src/index.ts";

function toolResult(toolName: string): ToolResultEvent {
	return {
		type: "tool_result",
		toolCallId: "tool-1",
		toolName,
		input: {},
		content: [],
		details: undefined,
		isError: false,
	};
}

describe("public API contracts", () => {
	test("exports built-in tool factories for every built-in tool name", () => {
		for (const toolName of allToolNames) {
			expect(createToolDefinition(toolName, process.cwd()).name).toBe(toolName);
			expect(createTool(toolName, process.cwd()).name).toBe(toolName);
		}
	});

	test("exports tool result guards that narrow by tool name", () => {
		expect(isBashToolResult(toolResult("bash"))).toBe(true);
		expect(isReadToolResult(toolResult("read"))).toBe(true);
		expect(isEditToolResult(toolResult("edit"))).toBe(true);
		expect(isWriteToolResult(toolResult("write"))).toBe(true);
		expect(isGrepToolResult(toolResult("grep"))).toBe(true);
		expect(isFindToolResult(toolResult("find"))).toBe(true);
		expect(isLsToolResult(toolResult("ls"))).toBe(true);

		const customResult = toolResult("custom");
		expect(isBashToolResult(customResult)).toBe(false);
		expect(isReadToolResult(customResult)).toBe(false);
		expect(isEditToolResult(customResult)).toBe(false);
		expect(isWriteToolResult(customResult)).toBe(false);
		expect(isGrepToolResult(customResult)).toBe(false);
		expect(isFindToolResult(customResult)).toBe(false);
		expect(isLsToolResult(customResult)).toBe(false);
	});
});

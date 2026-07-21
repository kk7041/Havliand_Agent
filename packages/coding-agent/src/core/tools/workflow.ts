import { Text } from "@havliand_agent/tui";
import { Type } from "typebox";
import type { ToolDefinition } from "../extensions/types.ts";
import {
	formatWorkflowStatus,
	WORKFLOW_STAGES,
	type WorkflowStage,
	type WorkflowStateSnapshot,
	type WorkflowStateStore,
} from "../subagent/workflow-state.ts";

const WorkflowParams = Type.Object({
	stage: Type.Union(
		WORKFLOW_STAGES.map((stage) => Type.Literal(stage)),
		{ description: "Current orchestration workflow stage to report to the UI" },
	),
	note: Type.Optional(Type.String({ description: "Optional short status note for the UI" })),
});

export function createWorkflowToolDefinition(
	workflowState: WorkflowStateStore,
): ToolDefinition<typeof WorkflowParams, WorkflowStateSnapshot> {
	return {
		name: "workflow",
		label: "Workflow",
		description: "Report the current orchestration workflow stage to the UI. This has no side effects.",
		promptSnippet: "Report orchestration workflow stage to the UI",
		parameters: WorkflowParams,
		async execute(_toolCallId, params) {
			const state = workflowState.setStage(params.stage as WorkflowStage, params.note);
			const status = formatWorkflowStatus(state) ?? "wf: idle";
			const text = state.note ? `${status} - ${state.note}` : status;
			return {
				content: [{ type: "text", text }],
				details: state,
			};
		},
		renderCall(args, theme) {
			const stage = typeof args.stage === "string" ? args.stage : "...";
			const note = typeof args.note === "string" && args.note.trim() ? ` ${args.note.trim()}` : "";
			return new Text(
				theme.fg("toolTitle", theme.bold("workflow ")) + theme.fg("accent", stage) + theme.fg("dim", note),
				0,
				0,
			);
		},
		renderResult(result, _options, theme) {
			const text = result.content[0];
			return new Text(theme.fg("dim", text?.type === "text" ? text.text : "(no workflow status)"), 0, 0);
		},
	};
}

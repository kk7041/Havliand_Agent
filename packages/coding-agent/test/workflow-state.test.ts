import { describe, expect, it, vi } from "vitest";
import { formatWorkflowStatus, WorkflowStateStore } from "../src/core/subagent/workflow-state.ts";

describe("WorkflowStateStore", () => {
	it("tracks stage updates and notifies subscribers", () => {
		const store = new WorkflowStateStore();
		const listener = vi.fn();
		const unsubscribe = store.subscribe(listener);

		const state = store.setStage("planning", "drafting plan");

		expect(state).toEqual({ stage: "planning", reworkRound: 0, note: "drafting plan" });
		expect(listener).toHaveBeenCalledWith(state);
		expect(formatWorkflowStatus(state)).toBe("wf: planning");

		unsubscribe();
		store.setStage("reviewing");
		expect(listener).toHaveBeenCalledTimes(1);
	});

	it("increments rework rounds and caps the fourth rework", () => {
		const store = new WorkflowStateStore();

		expect(store.trackSubagentStage("rework").state.reworkRound).toBe(1);
		expect(store.trackSubagentStage("rework").state.reworkRound).toBe(2);
		expect(store.trackSubagentStage("rework").state.reworkRound).toBe(3);

		const capped = store.trackSubagentStage("rework");
		expect(capped.capped).toBe(true);
		expect(capped.state).toEqual({ stage: "reworking", reworkRound: 3 });
		expect(formatWorkflowStatus(capped.state)).toBe("wf: rework 3/3");
	});

	it("resets rework round on new research or execute stage", () => {
		const store = new WorkflowStateStore();

		store.trackSubagentStage("rework");
		expect(store.trackSubagentStage("research").state).toEqual({ stage: "research", reworkRound: 0 });

		store.trackSubagentStage("rework");
		expect(store.trackSubagentStage("execute").state).toEqual({ stage: "executing", reworkRound: 0 });
	});
});

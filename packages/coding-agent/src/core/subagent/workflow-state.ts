export const REWORK_CAP = 3;

export const WORKFLOW_STAGES = [
	"idle",
	"research",
	"planning",
	"awaiting-confirmation",
	"executing",
	"reviewing",
	"reworking",
] as const;

export type WorkflowStage = (typeof WORKFLOW_STAGES)[number];

export const SUBAGENT_WORKFLOW_STAGES = ["research", "execute", "rework"] as const;

export type SubagentWorkflowStage = (typeof SUBAGENT_WORKFLOW_STAGES)[number];

export interface WorkflowStateSnapshot {
	stage: WorkflowStage;
	reworkRound: number;
	note?: string;
}

export type WorkflowStateListener = (state: WorkflowStateSnapshot) => void;

function cloneWorkflowState(state: WorkflowStateSnapshot): WorkflowStateSnapshot {
	return state.note === undefined
		? { stage: state.stage, reworkRound: state.reworkRound }
		: { stage: state.stage, reworkRound: state.reworkRound, note: state.note };
}

function stageFromSubagentStage(stage: SubagentWorkflowStage): WorkflowStage {
	if (stage === "execute") return "executing";
	if (stage === "rework") return "reworking";
	return "research";
}

export function formatWorkflowStatus(state: WorkflowStateSnapshot): string | undefined {
	switch (state.stage) {
		case "idle":
			return undefined;
		case "research":
			return "wf: research (OG)";
		case "planning":
			return "wf: planning";
		case "awaiting-confirmation":
			return "wf: awaiting plan approval";
		case "executing":
			return "wf: execute (Angel)";
		case "reviewing":
			return "wf: review";
		case "reworking":
			return `wf: rework ${state.reworkRound}/${REWORK_CAP}`;
	}
}

export class WorkflowStateStore {
	private state: WorkflowStateSnapshot = { stage: "idle", reworkRound: 0 };
	private listeners = new Set<WorkflowStateListener>();

	getSnapshot(): WorkflowStateSnapshot {
		return cloneWorkflowState(this.state);
	}

	setStage(stage: WorkflowStage, note?: string): WorkflowStateSnapshot {
		this.state = {
			stage,
			reworkRound: this.state.reworkRound,
			...(note === undefined ? {} : { note }),
		};
		this.emit();
		return this.getSnapshot();
	}

	trackSubagentStage(stage: SubagentWorkflowStage, note?: string): { state: WorkflowStateSnapshot; capped: boolean } {
		if (stage === "research" || stage === "execute") {
			this.state = {
				stage: stageFromSubagentStage(stage),
				reworkRound: 0,
				...(note === undefined ? {} : { note }),
			};
			this.emit();
			return { state: this.getSnapshot(), capped: false };
		}

		const nextRound = this.state.reworkRound + 1;
		if (nextRound > REWORK_CAP) {
			const cappedState: WorkflowStateSnapshot = {
				stage: "reworking",
				reworkRound: REWORK_CAP,
				...(note === undefined ? {} : { note }),
			};
			this.state = cappedState;
			this.emit();
			return { state: this.getSnapshot(), capped: true };
		}

		this.state = {
			stage: "reworking",
			reworkRound: nextRound,
			...(note === undefined ? {} : { note }),
		};
		this.emit();
		return { state: this.getSnapshot(), capped: false };
	}

	subscribe(listener: WorkflowStateListener): () => void {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}

	private emit(): void {
		const snapshot = this.getSnapshot();
		for (const listener of this.listeners) {
			listener(snapshot);
		}
	}
}

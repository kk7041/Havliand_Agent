import type { Component } from "@havliand_agent/tui";
import { theme } from "../theme/theme.ts";
import { DeepAgentPanel } from "./deepagent-panel.ts";

export interface DeepAgentStartupOptions {
	appName: string;
	version: string;
	compactInstructions: string[];
	expandedInstructions: string[];
	onboarding: string;
	modelScope?: string;
}

export class DeepAgentStartupComponent implements Component {
	private expanded: boolean;
	private readonly options: DeepAgentStartupOptions;

	constructor(options: DeepAgentStartupOptions, expanded: boolean) {
		this.options = options;
		this.expanded = expanded;
	}

	setExpanded(expanded: boolean): void {
		this.expanded = expanded;
	}

	invalidate(): void {
		// No cached render state.
	}

	render(width: number): string[] {
		const panel = this.expanded
			? new DeepAgentPanel({
					title: `${this.options.appName} v${this.options.version}`,
					subtitle: "Interactive workspace",
					sections: [
						{
							title: "Status",
							rows: [
								`${theme.fg("success", "●")} Ready  ${theme.fg("dim", "agent workspace online")}`,
								this.options.modelScope
									? `${theme.fg("dim", "models")} ${this.options.modelScope}`
									: `${theme.fg("dim", "mode")} interactive`,
							],
						},
						{
							title: "Shortcuts",
							rows: this.options.expandedInstructions.map((shortcut) => `${theme.fg("dim", "•")} ${shortcut}`),
						},
						{
							title: "Workspace",
							rows: [theme.fg("dim", this.options.onboarding)],
						},
					],
					paddingX: 2,
				})
			: new DeepAgentPanel({
					title: `${this.options.appName} v${this.options.version}`,
					subtitle: `Press ${theme.fg("accent", "ctrl+o")} to expand shortcuts and resources`,
					rows: [
						`${theme.fg("success", "●")} Ready  ${theme.fg("dim", "agent workspace online")}`,
						this.options.compactInstructions.join(theme.fg("dim", "  ·  ")),
						theme.fg("dim", this.options.onboarding),
					],
					paddingX: 2,
				});
		return panel.render(width);
	}
}

import { type Component, truncateToWidth, visibleWidth } from "@havliand_agent/tui";
import { theme } from "../theme/theme.ts";

export interface DeepAgentPanelSection {
	title: string;
	rows: string[];
}

export interface DeepAgentPanelOptions {
	title: string;
	subtitle?: string;
	sections?: DeepAgentPanelSection[];
	rows?: string[];
	paddingX?: number;
}

function padToWidth(text: string, width: number): string {
	return text + " ".repeat(Math.max(0, width - visibleWidth(text)));
}

function borderLine(left: string, fill: string, right: string, width: number): string {
	if (width <= 1) return theme.fg("borderMuted", fill.slice(0, 1));
	return theme.fg("borderMuted", left + fill.repeat(Math.max(0, width - 2)) + right);
}

export class DeepAgentPanel implements Component {
	private options: DeepAgentPanelOptions;

	constructor(options: DeepAgentPanelOptions) {
		this.options = options;
	}

	setOptions(options: DeepAgentPanelOptions): void {
		this.options = options;
	}

	invalidate(): void {
		// No cached render state.
	}

	render(width: number): string[] {
		if (width < 4) return [];

		const innerWidth = Math.max(1, width - 2);
		const paddingX = this.options.paddingX ?? 2;
		const contentWidth = Math.max(1, innerWidth - paddingX * 2);
		const lines: string[] = [];
		const titleWidth = Math.max(1, width - 2);
		const topTitle = truncateToWidth(` ${this.options.title} `, titleWidth, theme.fg("dim", "..."));
		const topFillWidth = Math.max(0, width - visibleWidth(topTitle) - 2);
		lines.push(
			theme.fg("borderMuted", "╭") +
				theme.bold(theme.fg("accent", topTitle)) +
				theme.fg("borderMuted", `${"─".repeat(topFillWidth)}╮`),
		);
		if (this.options.subtitle) {
			lines.push(this.contentLine(theme.fg("dim", this.options.subtitle), innerWidth, paddingX, contentWidth));
			lines.push(borderLine("├", "─", "┤", width));
		}

		for (const row of this.options.rows ?? []) {
			lines.push(this.contentLine(row, innerWidth, paddingX, contentWidth));
		}

		const sections = this.options.sections ?? [];
		for (let index = 0; index < sections.length; index++) {
			if ((this.options.rows?.length ?? 0) > 0 || index > 0) {
				lines.push(this.contentLine("", innerWidth, paddingX, contentWidth));
			}
			const section = sections[index]!;
			lines.push(this.contentLine(theme.fg("mdHeading", section.title), innerWidth, paddingX, contentWidth));
			for (const row of section.rows) {
				lines.push(this.contentLine(row, innerWidth, paddingX, contentWidth));
			}
		}

		lines.push(borderLine("╰", "─", "╯", width));
		return lines;
	}

	private contentLine(row: string, innerWidth: number, paddingX: number, contentWidth: number): string {
		const truncated = truncateToWidth(row, contentWidth, theme.fg("dim", "..."));
		const paddedContent = padToWidth(truncated, contentWidth);
		const leftPad = " ".repeat(paddingX);
		const rightPad = " ".repeat(Math.max(0, innerWidth - paddingX - contentWidth));
		return theme.fg("borderMuted", "│") + leftPad + paddedContent + rightPad + theme.fg("borderMuted", "│");
	}
}

export class DeepAgentExpandablePanel implements Component {
	private expanded: boolean;
	private readonly collapsed: DeepAgentPanelOptions;
	private readonly expandedOptions: DeepAgentPanelOptions;

	constructor(collapsed: DeepAgentPanelOptions, expandedOptions: DeepAgentPanelOptions, expanded: boolean) {
		this.collapsed = collapsed;
		this.expandedOptions = expandedOptions;
		this.expanded = expanded;
	}

	setExpanded(expanded: boolean): void {
		this.expanded = expanded;
	}

	invalidate(): void {
		// No cached render state.
	}

	render(width: number): string[] {
		return new DeepAgentPanel(this.expanded ? this.expandedOptions : this.collapsed).render(width);
	}
}

import type { Component } from "../tui.ts";
import { visibleWidth } from "../utils.ts";

export interface ProgressTheme {
	fill?: (text: string) => string;
	track?: (text: string) => string;
	label?: (text: string) => string;
	meta?: (text: string) => string;
}

export interface ProgressCount {
	done: number;
	total: number;
}

export interface ProgressOptions {
	value: number;
	label?: string;
	count?: ProgressCount;
	width?: number;
	showPercent?: boolean;
	theme?: ProgressTheme;
}

const PARTIAL_BLOCKS = ["", "▏", "▎", "▍", "▌", "▋", "▊", "▉"];
const FULL_BLOCK = "█";
const TRACK_BLOCK = "░";
const MIN_BAR_WIDTH = 4;

function clampValue(value: number): number {
	if (!Number.isFinite(value)) return 0;
	return Math.max(0, Math.min(1, value));
}

function clampCount(value: number): number {
	if (!Number.isFinite(value)) return 0;
	return Math.max(0, Math.floor(value));
}

function padToWidth(text: string, width: number): string {
	const padding = Math.max(0, width - visibleWidth(text));
	return text + " ".repeat(padding);
}

export class Progress implements Component {
	private value: number;
	private label: string | undefined;
	private count: ProgressCount | undefined;
	private width: number | undefined;
	private showPercent: boolean;
	private theme: ProgressTheme;
	private cachedKey: string | undefined;
	private cachedLines: string[] | undefined;

	constructor(options: ProgressOptions) {
		this.value = clampValue(options.value);
		this.label = options.label;
		this.count = options.count;
		this.width = options.width;
		this.showPercent = options.showPercent ?? true;
		this.theme = options.theme ?? {};
	}

	setValue(value: number, count?: ProgressCount): void {
		this.value = clampValue(value);
		this.count = count;
		this.invalidate();
	}

	setLabel(label: string | undefined): void {
		this.label = label;
		this.invalidate();
	}

	setWidth(width: number | undefined): void {
		this.width = width;
		this.invalidate();
	}

	setShowPercent(showPercent: boolean): void {
		this.showPercent = showPercent;
		this.invalidate();
	}

	setTheme(theme: ProgressTheme): void {
		this.theme = theme;
		this.invalidate();
	}

	invalidate(): void {
		this.cachedKey = undefined;
		this.cachedLines = undefined;
	}

	render(width: number): string[] {
		const key = JSON.stringify({
			value: this.value,
			label: this.label,
			count: this.count,
			width: this.width,
			showPercent: this.showPercent,
			renderWidth: width,
			themeSample: [
				this.theme.fill?.("x"),
				this.theme.track?.("x"),
				this.theme.label?.("x"),
				this.theme.meta?.("x"),
			],
		});
		if (this.cachedKey === key && this.cachedLines) return this.cachedLines;

		const meta = this.renderMeta();
		const prefix = this.label ? `${this.theme.label?.(this.label) ?? this.label} ` : "";
		const fixedWidth = visibleWidth(prefix) + visibleWidth(meta);
		const availableBarWidth = Math.max(MIN_BAR_WIDTH, width - fixedWidth);
		const requestedWidth = this.width ?? availableBarWidth;
		const barWidth = Math.max(MIN_BAR_WIDTH, Math.min(requestedWidth, availableBarWidth));
		const bar = this.renderBar(barWidth);
		const line = padToWidth(`${prefix}${bar}${meta}`, width);

		this.cachedKey = key;
		this.cachedLines = [line];
		return this.cachedLines;
	}

	private renderMeta(): string {
		const parts: string[] = [];
		if (this.showPercent) {
			parts.push(`${Math.round(this.value * 100)}%`);
		}
		if (this.count) {
			const done = clampCount(this.count.done);
			const total = clampCount(this.count.total);
			parts.push(`${done}/${total}`);
		}
		if (parts.length === 0) return "";
		const text = ` ${parts.join(" ")}`;
		return this.theme.meta?.(text) ?? text;
	}

	private renderBar(width: number): string {
		const scaled = this.value * width;
		const fullWidth = Math.floor(scaled);
		const partialWidth = Math.floor((scaled - fullWidth) * PARTIAL_BLOCKS.length);
		const hasPartial = partialWidth > 0 && fullWidth < width;
		const trackWidth = Math.max(0, width - fullWidth - (hasPartial ? 1 : 0));
		const fill = FULL_BLOCK.repeat(fullWidth) + (hasPartial ? PARTIAL_BLOCKS[partialWidth] : "");
		const track = TRACK_BLOCK.repeat(trackWidth);
		return `${this.theme.fill?.(fill) ?? fill}${this.theme.track?.(track) ?? track}`;
	}
}

import { Container, type MarkdownTheme, Text } from "@havliand_agent/tui";
import { getMarkdownTheme, theme } from "../theme/theme.ts";

const OSC133_ZONE_START = "\x1b]133;A\x07";
const OSC133_ZONE_END = "\x1b]133;B\x07";
const OSC133_ZONE_FINAL = "\x1b]133;C\x07";

/**
 * Component that renders a user message
 */
export class UserMessageComponent extends Container {
	private text: string;
	private outputPad: number;

	constructor(text: string, markdownTheme: MarkdownTheme = getMarkdownTheme(), outputPad = 1) {
		super();
		this.text = text;
		void markdownTheme;
		this.outputPad = outputPad;
		this.rebuild();
	}

	setOutputPad(padding: number): void {
		this.outputPad = padding;
		this.rebuild();
	}

	private rebuild(): void {
		this.clear();
		this.addChild(new Text(this.renderUserText(), this.outputPad, 0));
	}

	private renderUserText(): string {
		const lines = this.text.split("\n");
		const multiline = lines.length > 1;
		const prefix = theme.bold(theme.fg("accent", "❯ "));
		const continuationPrefix = multiline ? theme.fg("accent", "│ ") : "  ";
		return lines
			.map(
				(line, index) =>
					`${index === 0 ? prefix : continuationPrefix}${this.highlightInputLine(line, index === 0)}`,
			)
			.join("\n");
	}

	private highlightInputLine(line: string, isFirstLine: boolean): string {
		if (isFirstLine && line.startsWith("!")) {
			return theme.fg("bashMode", line);
		}
		if (isFirstLine && line.startsWith("/")) {
			const [command = "", ...rest] = line.split(" ");
			const suffix = rest.length > 0 ? ` ${rest.join(" ")}` : "";
			return `${theme.fg("accent", command)}${theme.fg("userMessageText", suffix)}`;
		}
		return line
			.split(/(\s+)/u)
			.map((part) =>
				part.startsWith("@") && part.length > 1 ? theme.fg("accent", part) : theme.fg("userMessageText", part),
			)
			.join("");
	}

	override render(width: number): string[] {
		const lines = super.render(width);
		if (lines.length === 0) {
			return lines;
		}

		lines[0] = OSC133_ZONE_START + lines[0];
		if (lines.length === 1) {
			lines.push(OSC133_ZONE_END + OSC133_ZONE_FINAL);
		} else {
			lines[lines.length - 1] = OSC133_ZONE_END + OSC133_ZONE_FINAL + lines[lines.length - 1];
		}
		return lines;
	}
}

import { isAbsolute, relative, resolve, sep } from "node:path";
import { type Component, truncateToWidth } from "@havliand_agent/tui";
import type { AgentSession } from "../../../core/agent-session.ts";
import { areExperimentalFeaturesEnabled } from "../../../core/experimental.ts";
import type { ReadonlyFooterDataProvider } from "../../../core/footer-data-provider.ts";
import { theme } from "../theme/theme.ts";

/**
 * Sanitize text for display in a single-line status.
 * Removes newlines, tabs, carriage returns, and other control characters.
 */
function sanitizeStatusText(text: string): string {
	// Replace newlines, tabs, carriage returns with space, then collapse multiple spaces
	return text
		.replace(/[\r\n\t]/g, " ")
		.replace(/ +/g, " ")
		.trim();
}

/**
 * Format token counts for compact footer display.
 */
export function formatTokens(count: number): string {
	if (count < 1000) return count.toString();
	if (count < 10000) return `${(count / 1000).toFixed(1)}k`;
	if (count < 1000000) return `${Math.round(count / 1000)}k`;
	if (count < 10000000) return `${(count / 1000000).toFixed(1)}M`;
	return `${Math.round(count / 1000000)}M`;
}

export function formatCwdForFooter(cwd: string, home: string | undefined): string {
	if (!home) return cwd;

	const resolvedCwd = resolve(cwd);
	const resolvedHome = resolve(home);
	const relativeToHome = relative(resolvedHome, resolvedCwd);
	const isInsideHome =
		relativeToHome === "" ||
		(relativeToHome !== ".." && !relativeToHome.startsWith(`..${sep}`) && !isAbsolute(relativeToHome));

	if (!isInsideHome) return cwd;
	return relativeToHome === "" ? "~" : `~${sep}${relativeToHome}`;
}

/**
 * Footer component that shows pwd, token stats, and context usage.
 * Computes token/context stats from session, gets git branch and extension statuses from provider.
 */
export class FooterComponent implements Component {
	private autoCompactEnabled = true;
	private session: AgentSession;
	private footerData: ReadonlyFooterDataProvider;
	private inputText = "";
	private tick = 0;

	constructor(session: AgentSession, footerData: ReadonlyFooterDataProvider) {
		this.session = session;
		this.footerData = footerData;
	}

	setSession(session: AgentSession): void {
		this.session = session;
	}

	setAutoCompactEnabled(enabled: boolean): void {
		this.autoCompactEnabled = enabled;
	}

	setInputText(text: string): void {
		this.inputText = text;
	}

	/**
	 * No-op: git branch caching now handled by provider.
	 * Kept for compatibility with existing call sites in interactive-mode.
	 */
	invalidate(): void {
		// No-op: git branch is cached/invalidated by provider
	}

	/**
	 * Clean up resources.
	 * Git watcher cleanup now handled by provider.
	 */
	dispose(): void {
		// Git watcher cleanup handled by provider
	}

	render(width: number): string[] {
		const state = this.session.state;

		// Calculate cumulative usage from ALL session entries (not just post-compaction messages)
		let totalInput = 0;
		let totalOutput = 0;
		let totalCacheRead = 0;
		let totalCacheWrite = 0;
		let totalCost = 0;
		let latestCacheHitRate: number | undefined;

		for (const entry of this.session.sessionManager.getEntries()) {
			if (entry.type === "message" && entry.message.role === "assistant") {
				totalInput += entry.message.usage.input;
				totalOutput += entry.message.usage.output;
				totalCacheRead += entry.message.usage.cacheRead;
				totalCacheWrite += entry.message.usage.cacheWrite;
				totalCost += entry.message.usage.cost.total;

				const latestPromptTokens =
					entry.message.usage.input + entry.message.usage.cacheRead + entry.message.usage.cacheWrite;
				latestCacheHitRate =
					latestPromptTokens > 0 ? (entry.message.usage.cacheRead / latestPromptTokens) * 100 : undefined;
			}
		}

		// Calculate context usage from session (handles compaction correctly).
		// After compaction, tokens are unknown until the next LLM response.
		const contextUsage = this.session.getContextUsage();
		const contextWindow = contextUsage?.contextWindow ?? state.model?.contextWindow ?? 0;
		const contextPercentValue = contextUsage?.percent ?? 0;
		const contextPercent = contextUsage?.percent !== null ? contextPercentValue.toFixed(1) : "?";

		// Replace home directory with ~
		let pwd = formatCwdForFooter(this.session.sessionManager.getCwd(), process.env.HOME || process.env.USERPROFILE);

		// Add git branch if available
		const branch = this.footerData.getGitBranch();
		if (branch) {
			pwd = `${pwd} (${branch})`;
		}

		// Add session name if set
		const sessionName = this.session.sessionManager.getSessionName();
		if (sessionName) {
			pwd = `${pwd} • ${sessionName}`;
		}

		// Build status line
		const statsParts = [];
		const modelName = state.model?.id || "no-model";
		const providerName = state.model?.provider;
		const modelDisplay =
			providerName && this.footerData.getAvailableProviderCount() > 1 ? `${providerName}/${modelName}` : modelName;
		statsParts.push(modelDisplay);
		if (totalInput) statsParts.push(`↑${formatTokens(totalInput)}`);
		if (totalOutput) statsParts.push(`↓${formatTokens(totalOutput)}`);
		if (totalCacheRead) statsParts.push(`R${formatTokens(totalCacheRead)}`);
		if (totalCacheWrite) statsParts.push(`W${formatTokens(totalCacheWrite)}`);
		if ((totalCacheRead > 0 || totalCacheWrite > 0) && latestCacheHitRate !== undefined) {
			statsParts.push(`CH${latestCacheHitRate.toFixed(1)}%`);
		}
		// Show cost with "(sub)" indicator if using OAuth subscription
		const usingSubscription = state.model ? this.session.modelRuntime.isUsingOAuth(state.model.provider) : false;
		if (totalCost || usingSubscription) {
			const costStr = `$${totalCost.toFixed(3)}${usingSubscription ? " (sub)" : ""}`;
			statsParts.push(costStr);
		}

		// Colorize context percentage based on usage
		let contextPercentStr: string;
		const autoIndicator = this.autoCompactEnabled ? " (auto)" : "";
		const contextPercentDisplay =
			contextPercent === "?"
				? `?/${formatTokens(contextWindow)}${autoIndicator}`
				: `${contextPercent}%/${formatTokens(contextWindow)}${autoIndicator}`;
		if (contextPercentValue > 90) {
			contextPercentStr = theme.fg("error", contextPercentDisplay);
		} else if (contextPercentValue > 70) {
			contextPercentStr = theme.fg("warning", contextPercentDisplay);
		} else {
			contextPercentStr = contextPercentDisplay;
		}
		statsParts.push(contextPercentStr);
		if (areExperimentalFeaturesEnabled()) {
			statsParts.push(`${theme.fg("dim", "•")} ${theme.bold(theme.fg("warning", "xp"))}`);
		}
		if (this.session.isCompacting) {
			statsParts.push(theme.fg("warning", "[compacting]"));
		} else if (this.session.isStreaming) {
			statsParts.push(theme.fg("accent", "[streaming]"));
		} else if (this.session.isBashRunning) {
			statsParts.push(theme.fg("bashMode", "[bash]"));
		}

		let statsLine = statsParts.join(theme.fg("dim", " │ "));

		if (statsLine && state.model?.reasoning) {
			const thinkingLevel = state.thinkingLevel || "off";
			statsLine +=
				theme.fg("dim", " │ ") +
				(thinkingLevel === "off" ? theme.fg("dim", "thinking off") : theme.fg("accent", thinkingLevel));
		}

		const pwdLine = truncateToWidth(theme.fg("dim", pwd), width, theme.fg("dim", "..."));
		const lines = [
			truncateToWidth(theme.fg("dim", ` ${statsLine}`), width, theme.fg("dim", "...")),
			truncateToWidth(theme.fg("dim", ` ${this.getHintText(pwdLine)}`), width, theme.fg("dim", "...")),
		];

		// Add extension statuses on a single line, sorted by key alphabetically
		const extensionStatuses = this.footerData.getExtensionStatuses();
		if (extensionStatuses.size > 0) {
			const sortedStatuses = Array.from(extensionStatuses.entries())
				.sort(([a], [b]) => a.localeCompare(b))
				.map(([, text]) => sanitizeStatusText(text));
			const statusLine = sortedStatuses.join(" ");
			// Truncate to terminal width with dim ellipsis for consistency with footer style
			lines.push(truncateToWidth(statusLine, width, theme.fg("dim", "...")));
		}

		return lines;
	}

	private getHintText(pwdLine: string): string {
		this.tick++;
		const text = this.inputText;
		if (this.session.isStreaming || this.session.isCompacting) {
			return "Esc to interrupt";
		}
		if (this.session.isBashRunning) {
			return "bash running";
		}
		if (text.startsWith("!")) {
			return "shell mode activated";
		}
		if (text.startsWith("/")) {
			return "Tab to complete · Enter to run";
		}
		if (/(^|\s)@[^\s]*$/u.test(text)) {
			return "Tab to insert file path";
		}
		if (text.trim()) {
			return "Enter to send · Shift+Enter for newline";
		}

		const tips = [
			"/ for commands · @ for files · ! for bash",
			"/settings to configure UI",
			"/model to switch models",
		];
		return `${pwdLine.replace(/\x1b\[[0-9;]*m/g, "")} · ${tips[Math.floor(this.tick / 120) % tips.length]}`;
	}
}

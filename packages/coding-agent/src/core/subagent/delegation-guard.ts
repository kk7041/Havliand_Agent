/**
 * Turn-scoped enforcement of the mandatory-delegation policy.
 *
 * The orchestrator session gets a small per-turn allowance of direct exploration
 * tool calls (enough to decide what to delegate). Once the allowance is used,
 * exploration tools are blocked until a `subagent` call happens in the same turn,
 * after which exploration is unrestricted so results can be validated.
 *
 * The guard only applies to top-level orchestrator sessions. Spawned subagent
 * child sessions are marked explicitly so they are unaffected even if they load
 * the `subagent` tool.
 */

const EXPLORATION_TOOLS = new Set(["read", "grep", "find", "ls"]);

/**
 * Bash counts as exploration only when the command starts with a read-only
 * inspection binary (optionally after a `cd <dir> &&`/`;` prefix). Anything
 * else (builds, tests, git, scripts) is not gated.
 */
const EXPLORATORY_BASH_PATTERN =
	/^\s*(?:cd\s+\S+\s*(?:&&|;)\s*)?(?:cat|rg|grep|egrep|fgrep|find|fd|ls|head|tail|tree|wc|stat|file|du)\b/;

/** Set to 0/off/false/disabled to turn the guard off. */
export const DELEGATION_GUARD_ENV_FLAG = "HAVLIAND_DELEGATION_GUARD";

/** Set to 1/true/on/yes in spawned child sessions. */
export const SUBAGENT_PROCESS_ENV_FLAG = "HAVLIAND_IS_SUBAGENT";

/** Current subagent nesting depth. Top-level orchestrator sessions have depth 0. */
export const SUBAGENT_DEPTH_ENV_FLAG = "HAVLIAND_SUBAGENT_DEPTH";

/** Maximum subagent nesting depth. Default 1 allows top-level -> subagent only. */
export const MAX_SUBAGENT_DEPTH_ENV_FLAG = "HAVLIAND_MAX_SUBAGENT_DEPTH";

export const DEFAULT_EXPLORATION_ALLOWANCE = 2;
export const DEFAULT_MAX_SUBAGENT_DEPTH = 1;

export function isDelegationGuardDisabledByEnv(env: NodeJS.ProcessEnv = process.env): boolean {
	const value = env[DELEGATION_GUARD_ENV_FLAG]?.trim().toLowerCase();
	return value === "0" || value === "off" || value === "false" || value === "disabled";
}

export function isSubagentProcess(env: NodeJS.ProcessEnv = process.env): boolean {
	const value = env[SUBAGENT_PROCESS_ENV_FLAG]?.trim().toLowerCase();
	return value === "1" || value === "true" || value === "on" || value === "yes";
}

function nonNegativeIntegerEnvValue(value: string | undefined, fallback: number): number {
	if (value === undefined) return fallback;
	const parsed = Number(value.trim());
	if (!Number.isFinite(parsed) || parsed < 0) return fallback;
	return Math.floor(parsed);
}

export function getSubagentDepth(env: NodeJS.ProcessEnv = process.env): number {
	return nonNegativeIntegerEnvValue(env[SUBAGENT_DEPTH_ENV_FLAG], 0);
}

export function getMaxSubagentDepth(env: NodeJS.ProcessEnv = process.env): number {
	return nonNegativeIntegerEnvValue(env[MAX_SUBAGENT_DEPTH_ENV_FLAG], DEFAULT_MAX_SUBAGENT_DEPTH);
}

export function canSpawnSubagent(env: NodeJS.ProcessEnv = process.env): boolean {
	return getSubagentDepth(env) < getMaxSubagentDepth(env);
}

export function isDelegationGuardDisabledForProcess(env: NodeJS.ProcessEnv = process.env): boolean {
	return isSubagentProcess(env) || isDelegationGuardDisabledByEnv(env);
}

export interface DelegationGuardOptions {
	/** Direct exploration calls allowed per turn before delegation is required. Default: 2. */
	maxExplorationCallsPerTurn?: number;
}

export class DelegationGuard {
	private _explorationCalls = 0;
	private _subagentCalledThisTurn = false;
	private readonly _maxExplorationCallsPerTurn: number;

	constructor(options: DelegationGuardOptions = {}) {
		this._maxExplorationCallsPerTurn = options.maxExplorationCallsPerTurn ?? DEFAULT_EXPLORATION_ALLOWANCE;
	}

	/** Call when a new user turn starts (prompt, steer, or follow-up). */
	resetTurn(): void {
		this._explorationCalls = 0;
		this._subagentCalledThisTurn = false;
	}

	/**
	 * Check a tool call against the delegation policy.
	 * Returns a block reason when the call must be rejected, undefined when allowed.
	 */
	check(toolName: string, args: unknown): string | undefined {
		if (toolName === "subagent") {
			this._subagentCalledThisTurn = true;
			return undefined;
		}
		if (this._subagentCalledThisTurn) {
			return undefined;
		}
		if (!isExplorationCall(toolName, args)) {
			return undefined;
		}
		this._explorationCalls += 1;
		if (this._explorationCalls <= this._maxExplorationCallsPerTurn) {
			return undefined;
		}
		return (
			`Delegation required: the direct-exploration allowance for this turn ` +
			`(${this._maxExplorationCallsPerTurn} calls) is used up. ` +
			`Delegate research, investigation, and fact-finding to a research subagent (e.g. OG) ` +
			`and implementation to an execution subagent (e.g. Angel) via the \`subagent\` tool. ` +
			`Direct exploration unlocks again after a \`subagent\` call this turn, for validating results.`
		);
	}
}

export function isExplorationCall(toolName: string, args: unknown): boolean {
	if (EXPLORATION_TOOLS.has(toolName)) {
		return true;
	}
	if (toolName !== "bash") {
		return false;
	}
	const command = (args as { command?: unknown } | undefined)?.command;
	return typeof command === "string" && EXPLORATORY_BASH_PATTERN.test(command);
}

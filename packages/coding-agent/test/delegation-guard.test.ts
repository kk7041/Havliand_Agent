import { describe, expect, test } from "vitest";
import {
	DEFAULT_EXPLORATION_ALLOWANCE,
	DelegationGuard,
	isDelegationGuardDisabledByEnv,
	isDelegationGuardDisabledForProcess,
	isExplorationCall,
	isSubagentProcess,
} from "../src/core/subagent/delegation-guard.ts";

describe("DelegationGuard", () => {
	test("allows exploration up to the per-turn allowance, then blocks", () => {
		const guard = new DelegationGuard();
		for (let i = 0; i < DEFAULT_EXPLORATION_ALLOWANCE; i++) {
			expect(guard.check("read", { path: "a.ts" })).toBeUndefined();
		}
		const reason = guard.check("read", { path: "b.ts" });
		expect(reason).toContain("Delegation required");
		expect(reason).toContain("subagent");
	});

	test("subagent call unlocks exploration for the rest of the turn", () => {
		const guard = new DelegationGuard({ maxExplorationCallsPerTurn: 1 });
		expect(guard.check("read", { path: "a.ts" })).toBeUndefined();
		expect(guard.check("read", { path: "b.ts" })).toContain("Delegation required");
		expect(guard.check("subagent", { agent: "OG", task: "investigate" })).toBeUndefined();
		expect(guard.check("read", { path: "c.ts" })).toBeUndefined();
		expect(guard.check("bash", { command: "rg foo src/" })).toBeUndefined();
	});

	test("resetTurn restores the allowance and re-arms the guard", () => {
		const guard = new DelegationGuard({ maxExplorationCallsPerTurn: 1 });
		expect(guard.check("subagent", { agent: "OG", task: "x" })).toBeUndefined();
		guard.resetTurn();
		expect(guard.check("grep", { pattern: "x" })).toBeUndefined();
		expect(guard.check("grep", { pattern: "y" })).toContain("Delegation required");
	});

	test("non-exploration tools are never gated", () => {
		const guard = new DelegationGuard({ maxExplorationCallsPerTurn: 0 });
		expect(guard.check("edit", {})).toBeUndefined();
		expect(guard.check("write", {})).toBeUndefined();
		expect(guard.check("bash", { command: "npm test" })).toBeUndefined();
		expect(guard.check("bash", { command: "git commit -m x" })).toBeUndefined();
	});

	test("exploratory bash counts against the allowance", () => {
		const guard = new DelegationGuard({ maxExplorationCallsPerTurn: 1 });
		expect(guard.check("bash", { command: "cat src/index.ts" })).toBeUndefined();
		expect(guard.check("bash", { command: "rg TODO src/" })).toContain("Delegation required");
	});
});

describe("isExplorationCall", () => {
	test("classifies exploration tools", () => {
		expect(isExplorationCall("read", {})).toBe(true);
		expect(isExplorationCall("grep", {})).toBe(true);
		expect(isExplorationCall("find", {})).toBe(true);
		expect(isExplorationCall("ls", {})).toBe(true);
		expect(isExplorationCall("edit", {})).toBe(false);
		expect(isExplorationCall("write", {})).toBe(false);
		expect(isExplorationCall("subagent", {})).toBe(false);
	});

	test("classifies bash commands by leading binary", () => {
		expect(isExplorationCall("bash", { command: "ls -la src" })).toBe(true);
		expect(isExplorationCall("bash", { command: "head -50 file.ts" })).toBe(true);
		expect(isExplorationCall("bash", { command: "cd pkg && grep -rn foo ." })).toBe(true);
		expect(isExplorationCall("bash", { command: "npm run build" })).toBe(false);
		expect(isExplorationCall("bash", { command: "git status" })).toBe(false);
		expect(isExplorationCall("bash", { command: "node script.js" })).toBe(false);
		expect(isExplorationCall("bash", {})).toBe(false);
	});
});

describe("isDelegationGuardDisabledByEnv", () => {
	test("disabled only for explicit off values", () => {
		expect(isDelegationGuardDisabledByEnv({})).toBe(false);
		expect(isDelegationGuardDisabledByEnv({ HAVLIAND_DELEGATION_GUARD: "on" })).toBe(false);
		expect(isDelegationGuardDisabledByEnv({ HAVLIAND_DELEGATION_GUARD: "off" })).toBe(true);
		expect(isDelegationGuardDisabledByEnv({ HAVLIAND_DELEGATION_GUARD: "0" })).toBe(true);
		expect(isDelegationGuardDisabledByEnv({ HAVLIAND_DELEGATION_GUARD: "false" })).toBe(true);
		expect(isDelegationGuardDisabledByEnv({ HAVLIAND_DELEGATION_GUARD: "disabled" })).toBe(true);
	});
});

describe("isSubagentProcess", () => {
	test("detects only explicit child process markers", () => {
		expect(isSubagentProcess({})).toBe(false);
		expect(isSubagentProcess({ HAVLIAND_IS_SUBAGENT: "0" })).toBe(false);
		expect(isSubagentProcess({ HAVLIAND_IS_SUBAGENT: "1" })).toBe(true);
		expect(isSubagentProcess({ HAVLIAND_IS_SUBAGENT: "true" })).toBe(true);
		expect(isSubagentProcess({ HAVLIAND_IS_SUBAGENT: "on" })).toBe(true);
		expect(isSubagentProcess({ HAVLIAND_IS_SUBAGENT: "yes" })).toBe(true);
	});
});

describe("isDelegationGuardDisabledForProcess", () => {
	test("disables the guard inside marked subagent child processes", () => {
		expect(
			isDelegationGuardDisabledForProcess({
				HAVLIAND_DELEGATION_GUARD: "on",
				HAVLIAND_IS_SUBAGENT: "1",
			}),
		).toBe(true);
	});
});

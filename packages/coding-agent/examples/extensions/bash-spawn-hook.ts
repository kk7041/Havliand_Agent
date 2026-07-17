/**
 * Bash Spawn Hook Example
 *
 * Adjusts command, cwd, and env before execution.
 *
 * Usage:
 *   havliand_agent -e ./bash-spawn-hook.ts
 */

import type { ExtensionAPI } from "@havliand_agent/coding-agent";
import { createBashTool } from "@havliand_agent/coding-agent";

export default function (havliand_agent: ExtensionAPI) {
	const cwd = process.cwd();

	const bashTool = createBashTool(cwd, {
		spawnHook: ({ command, cwd, env }) => ({
			command: `source ~/.profile\n${command}`,
			cwd,
			env: { ...env, HAVLIAND_AGENT_SPAWN_HOOK: "1" },
		}),
	});

	havliand_agent.registerTool({
		...bashTool,
		execute: async (id, params, signal, onUpdate, _ctx) => {
			return bashTool.execute(id, params, signal, onUpdate);
		},
	});
}

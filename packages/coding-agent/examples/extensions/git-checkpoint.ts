/**
 * Git Checkpoint Extension
 *
 * Creates git stash checkpoints at each turn so /fork can restore code state.
 * When forking, offers to restore code to that point in history.
 */

import type { ExtensionAPI } from "@havliand_agent/coding-agent";

export default function (havliand_agent: ExtensionAPI) {
	const checkpoints = new Map<string, string>();
	let currentEntryId: string | undefined;

	// Track the current entry ID when user messages are saved
	havliand_agent.on("tool_result", async (_event, ctx) => {
		const leaf = ctx.sessionManager.getLeafEntry();
		if (leaf) currentEntryId = leaf.id;
	});

	havliand_agent.on("turn_start", async () => {
		// Create a git stash entry before LLM makes changes
		const { stdout } = await havliand_agent.exec("git", ["stash", "create"]);
		const ref = stdout.trim();
		if (ref && currentEntryId) {
			checkpoints.set(currentEntryId, ref);
		}
	});

	havliand_agent.on("session_before_fork", async (event, ctx) => {
		const ref = checkpoints.get(event.entryId);
		if (!ref) return;

		if (!ctx.hasUI) {
			// In non-interactive mode, don't restore automatically
			return;
		}

		const choice = await ctx.ui.select("Restore code state?", [
			"Yes, restore code to that point",
			"No, keep current code",
		]);

		if (choice?.startsWith("Yes")) {
			await havliand_agent.exec("git", ["stash", "apply", ref]);
			ctx.ui.notify("Code restored to checkpoint", "info");
		}
	});

	havliand_agent.on("agent_end", async () => {
		// Clear checkpoints after agent completes
		checkpoints.clear();
	});
}

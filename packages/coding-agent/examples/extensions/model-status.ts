/**
 * Model status extension - shows model changes in the status bar.
 *
 * Demonstrates the `model_select` hook which fires when the model changes
 * via /model command, Ctrl+P cycling, or session restore.
 *
 * Usage: havliand_agent -e ./model-status.ts
 */

import type { ExtensionAPI } from "@havliand_agent/coding-agent";

export default function (havliand_agent: ExtensionAPI) {
	havliand_agent.on("model_select", async (event, ctx) => {
		const { model, previousModel, source } = event;

		// Format model identifiers
		const next = `${model.provider}/${model.id}`;
		const prev = previousModel ? `${previousModel.provider}/${previousModel.id}` : "none";

		// Show notification on change
		if (source !== "restore") {
			ctx.ui.notify(`Model: ${next}`, "info");
		}

		// Update status bar with current model
		ctx.ui.setStatus("model", `🤖 ${model.id}`);

		// Log change details (visible in debug output)
		console.log(`[model_select] ${prev} → ${next} (${source})`);
	});
}

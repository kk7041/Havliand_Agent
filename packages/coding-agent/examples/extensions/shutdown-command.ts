/**
 * Shutdown Command Extension
 *
 * Adds a /quit command that allows extensions to trigger clean shutdown.
 * Demonstrates how extensions can use ctx.shutdown() to exit havliand_agent cleanly.
 */

import type { ExtensionAPI } from "@havliand_agent/coding-agent";
import { Type } from "typebox";

export default function (havliand_agent: ExtensionAPI) {
	// Register a /quit command that cleanly exits havliand_agent
	havliand_agent.registerCommand("quit", {
		description: "Exit havliand_agent cleanly",
		handler: async (_args, ctx) => {
			ctx.shutdown();
		},
	});

	// You can also create a tool that shuts down after completing work
	havliand_agent.registerTool({
		name: "finish_and_exit",
		label: "Finish and Exit",
		description: "Complete a task and exit havliand_agent",
		parameters: Type.Object({}),
		async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
			// Do any final work here...
			// Request graceful shutdown (deferred until agent is idle)
			ctx.shutdown();

			// This return is sent to the LLM before shutdown occurs
			return {
				content: [{ type: "text", text: "Shutdown requested. Exiting after this response." }],
				details: {},
			};
		},
	});

	// You could also create a more complex tool with parameters
	havliand_agent.registerTool({
		name: "deploy_and_exit",
		label: "Deploy and Exit",
		description: "Deploy the application and exit havliand_agent",
		parameters: Type.Object({
			environment: Type.String({ description: "Target environment (e.g., production, staging)" }),
		}),
		async execute(_toolCallId, params, _signal, onUpdate, ctx) {
			onUpdate?.({ content: [{ type: "text", text: `Deploying to ${params.environment}...` }], details: {} });

			// Example deployment logic
			// const result = await havliand_agent.exec("npm", ["run", "deploy", params.environment], { signal });

			// On success, request graceful shutdown
			onUpdate?.({ content: [{ type: "text", text: "Deployment complete, exiting..." }], details: {} });
			ctx.shutdown();

			return {
				content: [{ type: "text", text: "Done! Shutdown requested." }],
				details: { environment: params.environment },
			};
		},
	});
}

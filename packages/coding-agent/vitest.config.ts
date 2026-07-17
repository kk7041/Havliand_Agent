import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const aiSrcIndex = fileURLToPath(new URL("../ai/src/index.ts", import.meta.url));
const aiSrcCompat = fileURLToPath(new URL("../ai/src/compat.ts", import.meta.url));
const aiSrcOAuth = fileURLToPath(new URL("../ai/src/oauth.ts", import.meta.url));
const aiSrcProviders = fileURLToPath(new URL("../ai/src/providers", import.meta.url));
const agentSrcIndex = fileURLToPath(new URL("../agent/src/index.ts", import.meta.url));
const tuiSrcIndex = fileURLToPath(new URL("../tui/src/index.ts", import.meta.url));

export default defineConfig({
	test: {
		globals: true,
		environment: "node",
		testTimeout: 30000,
		reporters: process.env.GITHUB_ACTIONS ? ["dot", "github-actions"] : ["dot"],
		silent: "passed-only",
		server: {
			deps: {
				external: [/@silvia-odwyer\/photon-node/],
			},
		},
	},
	resolve: {
		alias: [
			{ find: /^@earendil@havliand_agent-agent/ai$/, replacement: aiSrcIndex },
			{ find: /^@earendil@havliand_agent-agent/ai\/compat$/, replacement: aiSrcCompat },
			{ find: /^@earendil@havliand_agent-agent/ai\/oauth$/, replacement: aiSrcOAuth },
			{ find: /^@earendil@havliand_agent-agent/ai\/providers\/(.+)$/, replacement: `${aiSrcProviders}/$1.ts` },
			{ find: /^@earendil@havliand_agent-agent/agent-core$/, replacement: agentSrcIndex },
			{ find: /^@earendil@havliand_agent-agent/tui$/, replacement: tuiSrcIndex },
			{ find: /^@havliand_agent/ai$/, replacement: aiSrcIndex },
			{ find: /^@havliand_agent/ai\/oauth$/, replacement: aiSrcOAuth },
			{ find: /^@havliand_agent/agent-core$/, replacement: agentSrcIndex },
			{ find: /^@havliand_agent/tui$/, replacement: tuiSrcIndex },
		],
	},
});

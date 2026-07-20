import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
	type StartupModelSetupConfig,
	shouldOfferStartupModelSetup,
	writeStartupModelConfig,
} from "../src/cli/model-setup.ts";
import type { ModelRuntime } from "../src/core/model-runtime.ts";

function tempAgentDir(): string {
	return join(tmpdir(), `havliand_agent-model-setup-${Date.now()}-${Math.random().toString(36).slice(2)}`);
}

function modelRuntimeWithAvailable(count: number): ModelRuntime {
	return {
		getAvailable: async () => Array.from({ length: count }, (_, index) => ({ id: `model-${index}` })),
	} as unknown as ModelRuntime;
}

const setupConfig: StartupModelSetupConfig = {
	providerId: "relay",
	baseUrl: "https://relay.example/v1",
	apiKey: "test-key",
	modelId: "gpt-custom",
};

describe("startup model setup", () => {
	it("writes models.json and settings.json while preserving existing fields", async () => {
		const agentDir = tempAgentDir();
		await mkdir(agentDir, { recursive: true });
		await writeFile(
			join(agentDir, "models.json"),
			`${JSON.stringify({
				providers: {
					ollama: {
						baseUrl: "http://localhost:11434/v1",
						api: "openai-completions",
						apiKey: "ollama",
						models: [{ id: "llama" }],
					},
				},
			})}\n`,
			"utf-8",
		);
		await writeFile(join(agentDir, "settings.json"), `${JSON.stringify({ theme: "dark" })}\n`, "utf-8");

		await writeStartupModelConfig(agentDir, setupConfig);

		const modelsJson = JSON.parse(await readFile(join(agentDir, "models.json"), "utf-8")) as {
			providers: Record<string, unknown>;
		};
		expect(modelsJson.providers.ollama).toBeDefined();
		expect(modelsJson.providers.relay).toEqual({
			name: "relay",
			baseUrl: "https://relay.example/v1",
			api: "openai-completions",
			apiKey: "test-key",
			models: [{ id: "gpt-custom", reasoning: true }],
		});

		const settingsJson = JSON.parse(await readFile(join(agentDir, "settings.json"), "utf-8")) as Record<
			string,
			unknown
		>;
		expect(settingsJson).toMatchObject({
			theme: "dark",
			defaultProvider: "relay",
			defaultModel: "gpt-custom",
		});
		expect((await stat(join(agentDir, "models.json"))).mode & 0o777).toBe(0o600);
	});

	it("offers setup only for interactive startup without configured models or CLI auth", async () => {
		await expect(
			shouldOfferStartupModelSetup({
				appMode: "interactive",
				hasCliModel: false,
				hasCliApiKey: false,
				isRuntimeMetadataCommand: false,
				modelRuntime: modelRuntimeWithAvailable(0),
			}),
		).resolves.toBe(true);

		await expect(
			shouldOfferStartupModelSetup({
				appMode: "interactive",
				hasCliModel: true,
				hasCliApiKey: false,
				isRuntimeMetadataCommand: false,
				modelRuntime: modelRuntimeWithAvailable(0),
			}),
		).resolves.toBe(false);

		await expect(
			shouldOfferStartupModelSetup({
				appMode: "print",
				hasCliModel: false,
				hasCliApiKey: false,
				isRuntimeMetadataCommand: false,
				modelRuntime: modelRuntimeWithAvailable(0),
			}),
		).resolves.toBe(false);

		await expect(
			shouldOfferStartupModelSetup({
				appMode: "interactive",
				hasCliModel: false,
				hasCliApiKey: false,
				isRuntimeMetadataCommand: false,
				modelRuntime: modelRuntimeWithAvailable(1),
			}),
		).resolves.toBe(false);
	});
});

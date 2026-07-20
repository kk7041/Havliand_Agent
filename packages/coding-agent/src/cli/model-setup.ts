import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline";
import { Writable } from "node:stream";
import chalk from "chalk";
import type { ModelRuntime } from "../core/model-runtime.ts";
import type { SettingsManager } from "../core/settings-manager.ts";

const DEFAULT_PROVIDER_ID = "custom";
const VALIDATION_PROMPT = "Reply with exactly: ok";

interface JsonObject {
	[key: string]: unknown;
}

export interface StartupModelSetupConfig {
	providerId: string;
	baseUrl: string;
	apiKey: string;
	modelId: string;
}

function isRecord(value: unknown): value is JsonObject {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cleanBaseUrl(value: string): string {
	return value.trim().replace(/\/+$/u, "");
}

function normalizeProviderId(value: string): string {
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : DEFAULT_PROVIDER_ID;
}

function normalizeModelId(value: string): string {
	return value.trim();
}

async function readJsonObject(path: string): Promise<JsonObject> {
	try {
		const content = await readFile(path, "utf-8");
		const parsed: unknown = JSON.parse(content);
		return isRecord(parsed) ? parsed : {};
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
		throw error;
	}
}

export async function writeStartupModelConfig(agentDir: string, config: StartupModelSetupConfig): Promise<void> {
	const modelsPath = join(agentDir, "models.json");
	const modelsJson = await readJsonObject(modelsPath);
	const providers = isRecord(modelsJson.providers) ? { ...modelsJson.providers } : {};
	providers[config.providerId] = {
		name: config.providerId,
		baseUrl: config.baseUrl,
		api: "openai-completions",
		apiKey: config.apiKey,
		models: [
			{
				id: config.modelId,
				reasoning: true,
			},
		],
	};

	await mkdir(dirname(modelsPath), { recursive: true });
	await writeFile(modelsPath, `${JSON.stringify({ ...modelsJson, providers }, null, 2)}\n`, "utf-8");
	await chmod(modelsPath, 0o600);

	const settingsPath = join(agentDir, "settings.json");
	const settingsJson = await readJsonObject(settingsPath);
	await writeFile(
		settingsPath,
		`${JSON.stringify(
			{
				...settingsJson,
				defaultProvider: config.providerId,
				defaultModel: config.modelId,
			},
			null,
			2,
		)}\n`,
		"utf-8",
	);
}

async function promptLine(message: string): Promise<string | undefined> {
	const rl = createInterface({
		input: process.stdin,
		output: process.stdout,
	});
	return new Promise((resolve) => {
		rl.question(message, (answer) => {
			rl.close();
			const trimmed = answer.trim();
			resolve(trimmed.length > 0 ? trimmed : undefined);
		});
	});
}

async function promptSecret(message: string): Promise<string | undefined> {
	process.stdout.write(message);
	const mutedOutput = new Writable({
		write(_chunk, _encoding, callback) {
			callback();
		},
	});
	const rl = createInterface({
		input: process.stdin,
		output: mutedOutput,
		terminal: true,
	});
	return new Promise((resolve) => {
		rl.question("", (answer) => {
			rl.close();
			process.stdout.write("\n");
			const trimmed = answer.trim();
			resolve(trimmed.length > 0 ? trimmed : undefined);
		});
	});
}

async function collectStartupModelConfig(): Promise<StartupModelSetupConfig | undefined> {
	console.log(chalk.bold("Configure a model provider"));
	console.log(chalk.dim("Enter an OpenAI-compatible relay endpoint, API key, and model id."));

	const providerId = normalizeProviderId((await promptLine(`Provider id [${DEFAULT_PROVIDER_ID}]: `)) ?? "");
	const baseUrl = cleanBaseUrl((await promptLine("Base URL: ")) ?? "");
	const apiKey = (await promptSecret("API key: ")) ?? "";
	const modelId = normalizeModelId((await promptLine("Model id: ")) ?? "");

	if (!baseUrl || !apiKey || !modelId) {
		console.log(chalk.yellow("Provider setup skipped: base URL, API key, and model id are required."));
		return undefined;
	}

	return {
		providerId,
		baseUrl,
		apiKey,
		modelId,
	};
}

export async function validateStartupModelConfig(config: StartupModelSetupConfig): Promise<string | undefined> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), 30_000);
	try {
		const response = await fetch(`${config.baseUrl}/chat/completions`, {
			method: "POST",
			headers: {
				"content-type": "application/json",
				authorization: `Bearer ${config.apiKey}`,
			},
			body: JSON.stringify({
				model: config.modelId,
				messages: [{ role: "user", content: VALIDATION_PROMPT }],
				max_tokens: 8,
				stream: false,
			}),
			signal: controller.signal,
		});
		if (!response.ok) {
			const body = await response.text();
			return `HTTP ${response.status}${body ? `: ${body.slice(0, 300)}` : ""}`;
		}
		return undefined;
	} catch (error) {
		return error instanceof Error ? error.message : String(error);
	} finally {
		clearTimeout(timeout);
	}
}

export async function runStartupModelSetup(options: {
	agentDir: string;
	settingsManager: SettingsManager;
}): Promise<boolean> {
	while (true) {
		const config = await collectStartupModelConfig();
		if (!config) return false;

		await writeStartupModelConfig(options.agentDir, config);
		options.settingsManager.setDefaultModelAndProvider(config.providerId, config.modelId);
		await options.settingsManager.flush();

		const validationError = await validateStartupModelConfig(config);
		if (!validationError) {
			console.log(chalk.green(`Configured ${config.providerId}/${config.modelId}.`));
			return true;
		}

		console.error(chalk.yellow(`Validation failed: ${validationError}`));
		const retry = await promptLine("Re-enter provider config? [Y/n] ");
		if (retry?.toLowerCase() === "n" || retry?.toLowerCase() === "no") {
			return true;
		}
	}
}

export async function shouldOfferStartupModelSetup(options: {
	appMode: "interactive" | "print" | "json" | "rpc";
	hasCliModel: boolean;
	hasCliApiKey: boolean;
	isRuntimeMetadataCommand: boolean;
	modelRuntime: ModelRuntime;
}): Promise<boolean> {
	if (options.appMode !== "interactive") return false;
	if (options.hasCliModel || options.hasCliApiKey || options.isRuntimeMetadataCommand) return false;
	return (await options.modelRuntime.getAvailable()).length === 0;
}

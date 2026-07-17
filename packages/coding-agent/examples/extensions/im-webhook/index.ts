import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { ExtensionAPI } from "@havliand_agent/coding-agent";

interface WebhookBody {
	text?: unknown;
	message?: unknown;
	user?: unknown;
	channel?: unknown;
}

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 8787;
const MAX_BODY_BYTES = 64 * 1024;

function readEnvInt(name: string, fallback: number): number {
	const raw = process.env[name];
	if (!raw) return fallback;
	const value = Number.parseInt(raw, 10);
	return Number.isFinite(value) && value > 0 ? value : fallback;
}

function sendJson(response: ServerResponse, statusCode: number, payload: unknown): void {
	const body = JSON.stringify(payload);
	response.writeHead(statusCode, {
		"content-type": "application/json; charset=utf-8",
		"content-length": Buffer.byteLength(body),
	});
	response.end(body);
}

function readBody(request: IncomingMessage): Promise<string> {
	return new Promise((resolve, reject) => {
		let body = "";
		request.setEncoding("utf8");
		request.on("data", (chunk: string) => {
			body += chunk;
			if (Buffer.byteLength(body) > MAX_BODY_BYTES) {
				request.destroy(new Error("Request body too large"));
			}
		});
		request.on("end", () => resolve(body));
		request.on("error", reject);
	});
}

function parseWebhookBody(rawBody: string): WebhookBody {
	if (!rawBody.trim()) return {};
	const parsed = JSON.parse(rawBody) as unknown;
	if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
		throw new Error("Expected JSON object body");
	}
	return parsed as WebhookBody;
}

function getMessageText(body: WebhookBody): string | undefined {
	const rawText = body.text ?? body.message;
	return typeof rawText === "string" && rawText.trim() ? rawText.trim() : undefined;
}

function formatPrompt(body: WebhookBody, text: string): string {
	const user = typeof body.user === "string" && body.user.trim() ? body.user.trim() : "external user";
	const channel = typeof body.channel === "string" && body.channel.trim() ? body.channel.trim() : "webhook";
	return `Message from ${user} via ${channel}:\n\n${text}`;
}

export default function (havliand_agent: ExtensionAPI) {
	let server: Server | undefined;
	let listeningUrl: string | undefined;

	const host = process.env.HAVLIAND_AGENT_IM_WEBHOOK_HOST || DEFAULT_HOST;
	const port = readEnvInt("HAVLIAND_AGENT_IM_WEBHOOK_PORT", DEFAULT_PORT);
	const token = process.env.HAVLIAND_AGENT_IM_WEBHOOK_TOKEN;

	havliand_agent.on("session_start", async (_event, ctx) => {
		if (server) return;

		server = createServer(async (request, response) => {
			try {
				if (request.method === "GET" && request.url === "/health") {
					sendJson(response, 200, { ok: true });
					return;
				}

				if (request.method !== "POST" || request.url !== "/message") {
					sendJson(response, 404, { ok: false, error: "Not found" });
					return;
				}

				if (token && request.headers.authorization !== `Bearer ${token}`) {
					sendJson(response, 401, { ok: false, error: "Unauthorized" });
					return;
				}

				const body = parseWebhookBody(await readBody(request));
				const text = getMessageText(body);
				if (!text) {
					sendJson(response, 400, { ok: false, error: "Missing text" });
					return;
				}

				havliand_agent.sendUserMessage(formatPrompt(body, text), {
					deliverAs: ctx.isIdle() ? undefined : "followUp",
				});
				sendJson(response, 202, { ok: true, queued: !ctx.isIdle() });
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				sendJson(response, 500, { ok: false, error: message });
			}
		});

		server.on("error", (error) => {
			ctx.ui.notify(`IM webhook failed: ${error.message}`, "error");
		});

		await new Promise<void>((resolve) => {
			server?.listen(port, host, resolve);
		});
		listeningUrl = `http://${host}:${port}`;
		ctx.ui.notify(`IM webhook listening on ${listeningUrl}`, "info");
	});

	havliand_agent.on("session_shutdown", async () => {
		const activeServer = server;
		server = undefined;
		listeningUrl = undefined;
		if (!activeServer) return;
		await new Promise<void>((resolve, reject) => {
			activeServer.close((error) => {
				if (error) reject(error);
				else resolve();
			});
		});
	});

	havliand_agent.registerCommand("im-webhook-status", {
		description: "Show IM webhook listener status",
		handler: async (_args, ctx) => {
			ctx.ui.notify(listeningUrl ? `IM webhook listening on ${listeningUrl}` : "IM webhook is not running", "info");
		},
	});
}

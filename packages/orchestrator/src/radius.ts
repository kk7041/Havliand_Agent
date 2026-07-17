import { hostname, platform } from "node:os";
import type { OAuthCredential } from "@havliand_agent/ai";
import { readStoredCredential } from "@havliand_agent/coding-agent";
import { getOrchestratorDir, getSocketPath, VERSION } from "./config.ts";
import { loadMachine, saveMachine } from "./storage.ts";
import type { InstanceRecord, MachineRecord, RadiusRegistration } from "./types.ts";

const DEFAULT_RADIUS_URL = "https://radius.havliand_agent.dev/";
const DEFAULT_ORCHESTRATOR_BASE_PATH = "/v1/";
const NOT_FOUND_RETRY_THRESHOLD = 3;
const HEARTBEAT_BACKOFF_BASE_MS = 1_000;
const HEARTBEAT_BACKOFF_MAX_MS = 30_000;
const RADIUS_PROVIDER = "radius";

interface RegisterMachineResponse extends RadiusRegistration {
	id: string;
}

interface RegisterHavliandAgentResponse extends RadiusRegistration {
	id: string;
}

interface RadiusPresenceCoordinator {
	getLiveInstance(instanceId: string): InstanceRecord | undefined;
	listLiveInstances(): InstanceRecord[];
	updateInstance(instance: InstanceRecord): void;
}

interface HavliandAgentHeartbeatState {
	timer?: NodeJS.Timeout;
	intervalMs: number;
	radiusHavliandAgentId: string;
	consecutiveNotFoundCount: number;
	transientFailureCount: number;
}

class RadiusHttpError extends Error {
	readonly status: number;

	constructor(status: number, message: string) {
		super(message);
		this.name = "RadiusHttpError";
		this.status = status;
	}
}

async function post<T>(path: string, body: unknown): Promise<T> {
	const response = await fetch(new URL(path, getRadiusOrchestratorBaseUrl()), {
		method: "POST",
		headers: {
			Authorization: `Bearer ${getRadiusAccessToken()}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify(body),
	});

	if (!response.ok) {
		throw new RadiusHttpError(response.status, `Radius request failed: ${response.status} ${await response.text()}`);
	}

	return (await response.json()) as T;
}

async function maybePost(path: string, body: unknown): Promise<void> {
	const response = await fetch(new URL(path, getRadiusOrchestratorBaseUrl()), {
		method: "POST",
		headers: {
			Authorization: `Bearer ${getRadiusAccessToken()}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify(body),
	});
	if (!response.ok) {
		throw new RadiusHttpError(response.status, `Radius request failed: ${response.status} ${await response.text()}`);
	}
}

function isNotFoundError(error: unknown): error is RadiusHttpError {
	return error instanceof RadiusHttpError && error.status === 404;
}

function computeBackoffDelayMs(failureCount: number): number {
	const exponentialDelay = Math.min(
		HEARTBEAT_BACKOFF_MAX_MS,
		HEARTBEAT_BACKOFF_BASE_MS * 2 ** Math.max(0, failureCount - 1),
	);
	const jitterMs = Math.floor(Math.random() * Math.max(250, exponentialDelay / 4));
	return Math.min(HEARTBEAT_BACKOFF_MAX_MS, exponentialDelay + jitterMs);
}

function formatRadiusError(error: unknown): string {
	if (error instanceof RadiusHttpError) {
		return `HTTP ${error.status}: ${error.message}`;
	}
	if (error instanceof Error) {
		return error.message;
	}
	return String(error);
}

function logRadiusRetry(scope: string, action: string, delayMs: number, failureCount: number, error: unknown): void {
	console.error(
		`${scope} ${action} failed (attempt ${failureCount}); retrying in ${delayMs}ms: ${formatRadiusError(error)}`,
	);
}

export function getRadiusUrl(): string {
	return process.env.HAVLIAND_AGENT_RADIUS_URL || DEFAULT_RADIUS_URL;
}

export function getRadiusOrchestratorBaseUrl(): string {
	const explicitUrl = process.env.HAVLIAND_AGENT_RADIUS_ORCHESTRATOR_URL;
	if (explicitUrl) {
		return explicitUrl;
	}

	return new URL(DEFAULT_ORCHESTRATOR_BASE_PATH, getRadiusUrl()).toString();
}

function getStoredRadiusCredential(): OAuthCredential | undefined {
	const credential = readStoredCredential(RADIUS_PROVIDER);
	return credential?.type === "oauth" ? credential : undefined;
}

export function getRadiusAccessToken(): string {
	const storedCredential = getStoredRadiusCredential();
	if (typeof storedCredential?.access === "string" && storedCredential.access) {
		return storedCredential.access;
	}

	const apiKey = process.env.RADIUS_API_KEY;
	if (apiKey) {
		return apiKey;
	}

	throw new Error("Radius credentials are required in ~/.havliand_agent/agent/auth.json or RADIUS_API_KEY");
}

export function isRadiusEnabled(): boolean {
	return !!getStoredRadiusCredential()?.access || !!process.env.RADIUS_API_KEY;
}

export class RadiusPresence {
	private machineHeartbeatTimer?: NodeJS.Timeout;
	private machineHeartbeatIntervalMs = 0;
	private machineConsecutiveNotFoundCount = 0;
	private machineTransientFailureCount = 0;
	private readonly havliand_agentHeartbeatStates = new Map<string, HavliandAgentHeartbeatState>();
	private machine?: MachineRecord;
	private coordinator?: RadiusPresenceCoordinator;

	setCoordinator(coordinator: RadiusPresenceCoordinator): void {
		this.coordinator = coordinator;
	}

	async start(label?: string): Promise<MachineRecord | undefined> {
		if (!isRadiusEnabled()) {
			return undefined;
		}

		const registered = await this.registerMachine(label);
		this.startMachineHeartbeat(registered.heartbeatIntervalMs);
		return this.machine;
	}

	async stop(): Promise<void> {
		if (this.machineHeartbeatTimer) {
			clearTimeout(this.machineHeartbeatTimer);
			this.machineHeartbeatTimer = undefined;
		}
		for (const [instanceId, state] of this.havliand_agentHeartbeatStates) {
			if (state.timer) {
				clearTimeout(state.timer);
			}
			this.havliand_agentHeartbeatStates.delete(instanceId);
		}
		if (!this.machine || !isRadiusEnabled()) {
			return;
		}
		try {
			await maybePost(`machines/${this.machine.id}/disconnect`, {});
		} catch (error) {
			if (!isNotFoundError(error)) {
				throw error;
			}
		}
	}

	async registerHavliandAgent(instance: InstanceRecord): Promise<InstanceRecord> {
		if (!isRadiusEnabled()) {
			return instance;
		}
		const machine = this.machine ?? loadMachine();
		if (!machine) {
			throw new Error("No registered machine available for HavliandAgent registration");
		}
		const registered = await post<RegisterHavliandAgentResponse>("havliand_agent/register", {
			machineId: machine.id,
			label: instance.label,
			cwd: instance.cwd,
			hostname: hostname(),
			pid: process.pid,
			transport: "local-rpc",
			capabilities: { rpc: true, relay: false, iroh: false },
			sessionId: instance.sessionId,
		});
		const registeredInstance = { ...instance, radiusHavliandAgentId: registered.id };
		this.startHavliandAgentHeartbeat(instance.id, registered.heartbeatIntervalMs, registered.id);
		return registeredInstance;
	}

	async disconnectHavliandAgent(instance: InstanceRecord): Promise<void> {
		const state = this.havliand_agentHeartbeatStates.get(instance.id);
		if (state) {
			if (state.timer) {
				clearTimeout(state.timer);
			}
			this.havliand_agentHeartbeatStates.delete(instance.id);
		}
		if (!isRadiusEnabled() || !instance.radiusHavliandAgentId) {
			return;
		}
		try {
			await maybePost(`havliand_agent/${instance.radiusHavliandAgentId}/disconnect`, {});
		} catch (error) {
			if (!isNotFoundError(error)) {
				throw error;
			}
		}
	}

	private async registerMachine(label?: string): Promise<RegisterMachineResponse> {
		const existingMachine = this.machine ?? loadMachine();
		const registered = await post<RegisterMachineResponse>("machines/register", {
			machineId: existingMachine?.id,
			label,
			hostname: hostname(),
			platform: platform(),
			arch: process.arch,
			version: VERSION,
			capabilities: { spawn: true, relay: false, iroh: false },
		});

		const timestamp = new Date().toISOString();
		this.machine = {
			id: registered.id,
			createdAt: existingMachine?.createdAt ?? timestamp,
			lastSeenAt: timestamp,
			label,
		};
		saveMachine(this.machine);
		this.machineConsecutiveNotFoundCount = 0;
		this.machineTransientFailureCount = 0;
		return registered;
	}

	private startMachineHeartbeat(intervalMs: number): void {
		this.machineHeartbeatIntervalMs = intervalMs;
		this.scheduleMachineHeartbeat(intervalMs);
	}

	private scheduleMachineHeartbeat(delayMs: number): void {
		if (this.machineHeartbeatTimer) {
			clearTimeout(this.machineHeartbeatTimer);
		}
		this.machineHeartbeatTimer = setTimeout(() => {
			void this.heartbeatMachine();
		}, delayMs);
	}

	private startHavliandAgentHeartbeat(instanceId: string, intervalMs: number, radiusHavliandAgentId: string): void {
		const existingState = this.havliand_agentHeartbeatStates.get(instanceId);
		if (existingState?.timer) {
			clearTimeout(existingState.timer);
		}
		const state: HavliandAgentHeartbeatState = existingState ?? {
			intervalMs,
			radiusHavliandAgentId,
			consecutiveNotFoundCount: 0,
			transientFailureCount: 0,
		};
		state.intervalMs = intervalMs;
		state.radiusHavliandAgentId = radiusHavliandAgentId;
		state.consecutiveNotFoundCount = 0;
		state.transientFailureCount = 0;
		this.havliand_agentHeartbeatStates.set(instanceId, state);
		this.scheduleHavliandAgentHeartbeat(instanceId, intervalMs);
	}

	private scheduleHavliandAgentHeartbeat(instanceId: string, delayMs: number): void {
		const state = this.havliand_agentHeartbeatStates.get(instanceId);
		if (!state) {
			return;
		}
		if (state.timer) {
			clearTimeout(state.timer);
		}
		state.timer = setTimeout(() => {
			void this.heartbeatHavliandAgent(instanceId);
		}, delayMs);
	}

	private async heartbeatMachine(): Promise<void> {
		if (!this.machine || !isRadiusEnabled()) {
			return;
		}

		try {
			await maybePost(`machines/${this.machine.id}/heartbeat`, {
				cwd: getOrchestratorDir(),
				socketPath: getSocketPath(),
			});
			this.machineConsecutiveNotFoundCount = 0;
			this.machineTransientFailureCount = 0;
			this.scheduleMachineHeartbeat(this.machineHeartbeatIntervalMs);
		} catch (error) {
			if (!isNotFoundError(error)) {
				this.machineTransientFailureCount += 1;
				const delayMs = computeBackoffDelayMs(this.machineTransientFailureCount);
				logRadiusRetry("Radius machine", "heartbeat", delayMs, this.machineTransientFailureCount, error);
				this.scheduleMachineHeartbeat(delayMs);
				return;
			}

			this.machineTransientFailureCount = 0;
			this.machineConsecutiveNotFoundCount += 1;
			if (this.machineConsecutiveNotFoundCount < NOT_FOUND_RETRY_THRESHOLD) {
				this.scheduleMachineHeartbeat(this.machineHeartbeatIntervalMs);
				return;
			}

			try {
				await this.reRegisterMachineAndHavliandAgents();
			} catch (recoveryError) {
				this.machineTransientFailureCount += 1;
				const delayMs = computeBackoffDelayMs(this.machineTransientFailureCount);
				logRadiusRetry(
					"Radius machine",
					"re-registration",
					delayMs,
					this.machineTransientFailureCount,
					recoveryError,
				);
				this.scheduleMachineHeartbeat(delayMs);
			}
		}
	}

	private async heartbeatHavliandAgent(instanceId: string): Promise<void> {
		if (!isRadiusEnabled()) {
			return;
		}

		const state = this.havliand_agentHeartbeatStates.get(instanceId);
		if (!state) {
			return;
		}

		try {
			await maybePost(`havliand_agent/${state.radiusHavliandAgentId}/heartbeat`, {});
			state.consecutiveNotFoundCount = 0;
			state.transientFailureCount = 0;
			this.scheduleHavliandAgentHeartbeat(instanceId, state.intervalMs);
		} catch (error) {
			if (!isNotFoundError(error)) {
				state.transientFailureCount += 1;
				const delayMs = computeBackoffDelayMs(state.transientFailureCount);
				logRadiusRetry(
					`Radius HavliandAgent ${instanceId}`,
					"heartbeat",
					delayMs,
					state.transientFailureCount,
					error,
				);
				this.scheduleHavliandAgentHeartbeat(instanceId, delayMs);
				return;
			}

			state.transientFailureCount = 0;
			state.consecutiveNotFoundCount += 1;
			if (state.consecutiveNotFoundCount < NOT_FOUND_RETRY_THRESHOLD) {
				this.scheduleHavliandAgentHeartbeat(instanceId, state.intervalMs);
				return;
			}

			try {
				const recovered = await this.reRegisterHavliandAgent(instanceId);
				if (!recovered) {
					const delayMs = computeBackoffDelayMs(1);
					console.error(`Radius HavliandAgent ${instanceId} re-registration skipped; retrying in ${delayMs}ms`);
					this.scheduleHavliandAgentHeartbeat(instanceId, delayMs);
				}
			} catch (recoveryError) {
				state.transientFailureCount += 1;
				const delayMs = computeBackoffDelayMs(state.transientFailureCount);
				logRadiusRetry(
					`Radius HavliandAgent ${instanceId}`,
					"re-registration",
					delayMs,
					state.transientFailureCount,
					recoveryError,
				);
				this.scheduleHavliandAgentHeartbeat(instanceId, delayMs);
			}
		}
	}

	private async reRegisterMachineAndHavliandAgents(): Promise<void> {
		const registered = await this.registerMachine(this.machine?.label);
		this.startMachineHeartbeat(registered.heartbeatIntervalMs);

		const instances = this.coordinator?.listLiveInstances() ?? [];
		for (const instance of instances) {
			try {
				await this.reRegisterHavliandAgent(instance.id);
			} catch (error) {
				console.error(`Radius HavliandAgent ${instance.id} re-registration failed: ${formatRadiusError(error)}`);
			}
		}
	}

	private async reRegisterHavliandAgent(instanceId: string): Promise<boolean> {
		const instance = this.coordinator?.getLiveInstance(instanceId);
		if (!instance) {
			const state = this.havliand_agentHeartbeatStates.get(instanceId);
			if (state) {
				if (state.timer) {
					clearTimeout(state.timer);
				}
				this.havliand_agentHeartbeatStates.delete(instanceId);
			}
			return false;
		}

		if (!this.machine) {
			await this.reRegisterMachineAndHavliandAgents();
			return true;
		}

		const registeredInstance = await this.registerHavliandAgent(instance);
		this.coordinator?.updateInstance(registeredInstance);
		return true;
	}
}

export const radiusPresence = new RadiusPresence();

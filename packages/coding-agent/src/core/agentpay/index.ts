import { spawnProcess, spawnProcessSync } from "../../utils/child-process.ts";

export type AgentPaySetupMode = "wallet" | "link";

export interface AgentPayCommandResult {
	exitCode: number | null;
	stdout: string;
	stderr: string;
}

export interface AgentPayWalletInfo {
	address?: string;
	solanaAddress?: string;
	agentKeyId?: string;
	policyAttachment?: string;
	policyNote?: string;
	balances?: AgentPayBalanceInfo[];
}

export interface AgentPayBalanceInfo {
	tokenKey?: string;
	symbol?: string;
	chainKey?: string;
	chainName?: string;
	chainId?: number;
	formatted?: string;
	error?: string;
}

export interface AgentPayStatus {
	installed: boolean;
	version?: string;
	ready: boolean;
	walletAvailable: boolean;
	linkAuthenticated?: boolean;
	daemonSocket?: string;
	stateFile?: string;
	defaultChain?: string;
	defaultChainId?: number;
	evmAddress?: string;
	solanaAddress?: string;
	warnings: string[];
	errors: string[];
}

export interface AgentPayRuntime {
	getVersion(): Promise<string | undefined>;
	inspect(): Promise<AgentPayStatus>;
	getWallet(): Promise<AgentPayWalletInfo>;
	install(): Promise<number | null>;
	setup(mode: AgentPaySetupMode): Promise<number | null>;
	openPolicyTui(): Promise<number | null>;
	runPassthrough(args: string[]): Promise<number | null>;
}

function parseJsonObject(value: string): unknown | undefined {
	try {
		return JSON.parse(value) as unknown;
	} catch {
		return undefined;
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function stringValue(value: unknown): string | undefined {
	return typeof value === "string" ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
	return typeof value === "number" ? value : undefined;
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
	return isRecord(value) ? value : undefined;
}

function arrayValue(value: unknown): unknown[] {
	return Array.isArray(value) ? value : [];
}

export class CliAgentPayRuntime implements AgentPayRuntime {
	private command: string;

	constructor(command = "agentpay") {
		this.command = command;
	}

	async getVersion(): Promise<string | undefined> {
		const result = this.runSync(["--version"]);
		if (result.exitCode !== 0) return undefined;
		return result.stdout.trim() || undefined;
	}

	async inspect(): Promise<AgentPayStatus> {
		const version = await this.getVersion();
		if (!version) {
			return {
				installed: false,
				ready: false,
				walletAvailable: false,
				warnings: [],
				errors: ["agentpay command was not found or did not run"],
			};
		}

		const statusResult = this.runSync(["status", "--json"]);
		const walletResult = this.runSync(["wallet", "--json"]);
		const statusJson = parseJsonObject(statusResult.stdout);
		const walletJson = parseJsonObject(walletResult.stdout);
		const status = recordValue(statusJson);
		const config = recordValue(recordValue(status?.config)?.values);
		const security = recordValue(status?.security);
		const chain = recordValue(status?.chain);
		const wallet = walletResult.exitCode === 0 ? this.parseWallet(walletJson) : undefined;
		const linkAuthenticated = this.readLinkAuthenticated();

		return {
			installed: true,
			version,
			ready: security?.ready === true,
			walletAvailable: walletResult.exitCode === 0,
			linkAuthenticated,
			daemonSocket: stringValue(recordValue(config?.paths)?.daemonSocket ?? config?.daemonSocket),
			stateFile: stringValue(recordValue(config?.paths)?.stateFile ?? config?.stateFile),
			defaultChain: stringValue(chain?.chainName ?? config?.chainName),
			defaultChainId: numberValue(chain?.chainId ?? config?.chainId),
			evmAddress: wallet?.address,
			solanaAddress: wallet?.solanaAddress,
			warnings: arrayValue(security?.warnings).filter((value): value is string => typeof value === "string"),
			errors: [statusResult.stderr, walletResult.exitCode === 0 ? "" : walletResult.stderr || walletResult.stdout]
				.map((value) => value.trim())
				.filter((value) => value.length > 0),
		};
	}

	async getWallet(): Promise<AgentPayWalletInfo> {
		const result = this.runSync(["wallet", "--json"]);
		if (result.exitCode !== 0) {
			throw new Error(result.stderr.trim() || result.stdout.trim() || "agentpay wallet failed");
		}
		return this.parseWallet(parseJsonObject(result.stdout));
	}

	async install(): Promise<number | null> {
		return this.runInteractive("bash", ["-lc", "curl -fsSL https://wlfi.sh | bash"]);
	}

	async setup(mode: AgentPaySetupMode): Promise<number | null> {
		if (mode === "link") {
			return this.runInteractive(this.command, ["link", "onboard"]);
		}
		return this.runInteractive(this.command, ["admin", "setup"]);
	}

	async openPolicyTui(): Promise<number | null> {
		return this.runInteractive(this.command, ["admin", "tui"]);
	}

	async runPassthrough(args: string[]): Promise<number | null> {
		return this.runInteractive(this.command, args);
	}

	private runSync(args: string[]): AgentPayCommandResult {
		const result = spawnProcessSync(this.command, args, {
			encoding: "utf-8",
			stdio: ["ignore", "pipe", "pipe"],
		});
		return {
			exitCode: result.status,
			stdout: result.stdout ?? "",
			stderr: result.stderr ?? result.error?.message ?? "",
		};
	}

	private async runInteractive(command: string, args: string[]): Promise<number | null> {
		const child = spawnProcess(command, args, {
			stdio: "inherit",
			env: process.env,
		});
		return new Promise((resolve, reject) => {
			child.once("error", reject);
			child.once("exit", resolve);
		});
	}

	private readLinkAuthenticated(): boolean | undefined {
		const result = this.runSync(["link", "status", "--json"]);
		if (result.exitCode !== 0) return undefined;
		const json = recordValue(parseJsonObject(result.stdout));
		const authenticated = json?.authenticated ?? json?.isAuthenticated ?? json?.linked;
		return typeof authenticated === "boolean" ? authenticated : undefined;
	}

	private parseWallet(value: unknown): AgentPayWalletInfo {
		const wallet = recordValue(value) ?? {};
		return {
			address: stringValue(wallet.address),
			solanaAddress: stringValue(wallet.solanaAddress),
			agentKeyId: stringValue(wallet.agentKeyId),
			policyAttachment: stringValue(wallet.policyAttachment),
			policyNote: stringValue(wallet.policyNote),
			balances: arrayValue(wallet.balances).map((entry) => {
				const balance = recordValue(entry) ?? {};
				return {
					tokenKey: stringValue(balance.tokenKey),
					symbol: stringValue(balance.symbol),
					chainKey: stringValue(balance.chainKey),
					chainName: stringValue(balance.chainName),
					chainId: numberValue(balance.chainId),
					formatted: stringValue(recordValue(balance.balance)?.formatted),
					error: stringValue(balance.error),
				};
			}),
		};
	}
}

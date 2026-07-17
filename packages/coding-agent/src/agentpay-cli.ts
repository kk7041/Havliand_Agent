import chalk from "chalk";
import { APP_NAME } from "./config.ts";
import { type AgentPayRuntime, type AgentPaySetupMode, CliAgentPayRuntime } from "./core/agentpay/index.ts";

type AgentPayCommand = "status" | "install" | "setup" | "link" | "wallet" | "policy" | "run" | "help";

interface AgentPayCommandOptions {
	command: AgentPayCommand;
	args: string[];
	help: boolean;
	invalid?: string;
}

function printAgentPayHelp(): void {
	console.log(`${chalk.bold(`${APP_NAME} agentpay`)} - manage the bundled AgentPay payment runtime

${chalk.bold("Usage:")}
  ${APP_NAME} agentpay status
  ${APP_NAME} agentpay install
  ${APP_NAME} agentpay setup
  ${APP_NAME} agentpay link
  ${APP_NAME} agentpay wallet
  ${APP_NAME} agentpay policy
  ${APP_NAME} agentpay run -- <agentpay args...>

${chalk.bold("Commands:")}
  status   Inspect AgentPay CLI, daemon, wallet, Link, and policy readiness
  install  Run the official AgentPay one-click installer
  setup    Run local crypto wallet setup through AgentPay
  link     Start AgentPay Link fiat onboarding
  wallet   Show non-secret wallet addresses and balances
  policy   Open AgentPay policy TUI
  run      Pass arguments through to the local agentpay CLI

${chalk.bold("Examples:")}
  ${APP_NAME} agentpay status
  ${APP_NAME} agentpay setup
  ${APP_NAME} agentpay run -- transfer --help`);
}

function parseAgentPayCommand(args: string[]): AgentPayCommandOptions | undefined {
	if (args[0] !== "agentpay") return undefined;
	const rawCommand = args[1];
	if (!rawCommand || rawCommand === "--help" || rawCommand === "-h" || rawCommand === "help") {
		return { command: "help", args: [], help: true };
	}
	const commandAliases = new Map<string, AgentPayCommand>([
		["status", "status"],
		["install", "install"],
		["setup", "setup"],
		["wallet", "wallet"],
		["link", "link"],
		["policy", "policy"],
		["tui", "policy"],
		["run", "run"],
	]);
	const command = commandAliases.get(rawCommand);
	if (!command) {
		return { command: "help", args: [], help: false, invalid: rawCommand };
	}
	const commandArgs = args.slice(2);
	return {
		command,
		args: command === "run" && commandArgs[0] === "--" ? commandArgs.slice(1) : commandArgs,
		help: commandArgs.includes("--help") || commandArgs.includes("-h"),
	};
}

function formatAvailable(value: boolean | undefined): string {
	if (value === undefined) return chalk.dim("unknown");
	return value ? chalk.green("yes") : chalk.yellow("no");
}

async function printStatus(runtime: AgentPayRuntime): Promise<{ installed: boolean }> {
	const status = await runtime.inspect();
	console.log(chalk.bold("AgentPay"));
	console.log(`  installed: ${formatAvailable(status.installed)}`);
	if (status.version) console.log(`  version: ${status.version}`);
	console.log(`  runtime ready: ${formatAvailable(status.ready)}`);
	console.log(`  wallet available: ${formatAvailable(status.walletAvailable)}`);
	console.log(`  Link authenticated: ${formatAvailable(status.linkAuthenticated)}`);
	if (status.defaultChain)
		console.log(`  default chain: ${status.defaultChain} (${status.defaultChainId ?? "unknown"})`);
	if (status.evmAddress) console.log(`  EVM address: ${status.evmAddress}`);
	if (status.solanaAddress) console.log(`  Solana address: ${status.solanaAddress}`);
	if (status.daemonSocket) console.log(`  daemon socket: ${status.daemonSocket}`);
	if (status.stateFile) console.log(`  state file: ${status.stateFile}`);
	if (status.warnings.length > 0) {
		console.log(chalk.yellow("\nWarnings:"));
		for (const warning of status.warnings) console.log(`  - ${warning}`);
	}
	if (status.errors.length > 0) {
		console.log(chalk.red("\nDiagnostics:"));
		for (const error of status.errors) console.log(`  - ${error}`);
	}
	return { installed: status.installed };
}

async function printWallet(runtime: AgentPayRuntime): Promise<void> {
	const wallet = await runtime.getWallet();
	console.log(chalk.bold("AgentPay wallet"));
	if (wallet.address) console.log(`  EVM address: ${wallet.address}`);
	if (wallet.solanaAddress) console.log(`  Solana address: ${wallet.solanaAddress}`);
	if (wallet.agentKeyId) console.log(`  agent key id: ${wallet.agentKeyId}`);
	if (wallet.policyAttachment) console.log(`  policy attachment: ${wallet.policyAttachment}`);
	if (wallet.policyNote) console.log(chalk.yellow(`  policy note: ${wallet.policyNote}`));

	const balances = wallet.balances ?? [];
	if (balances.length === 0) return;
	console.log(chalk.bold("\nBalances:"));
	for (const balance of balances) {
		const asset = [balance.chainKey, balance.symbol].filter(Boolean).join(" ");
		if (balance.error) {
			console.log(`  ${asset}: ${chalk.yellow("unavailable")} (${balance.error.split("\n")[0]})`);
		} else {
			console.log(`  ${asset}: ${balance.formatted ?? "unknown"}`);
		}
	}
}

export async function handleAgentPayCommand(
	args: string[],
	options: { runtime?: AgentPayRuntime } = {},
): Promise<boolean> {
	const parsed = parseAgentPayCommand(args);
	if (!parsed) return false;
	const runtime = options.runtime ?? new CliAgentPayRuntime();

	if (parsed.invalid) {
		console.error(chalk.red(`Unknown agentpay command: ${parsed.invalid}`));
		printAgentPayHelp();
		process.exitCode = 1;
		return true;
	}

	if (parsed.help) {
		printAgentPayHelp();
		return true;
	}

	try {
		switch (parsed.command) {
			case "help":
				printAgentPayHelp();
				return true;
			case "status": {
				const status = await printStatus(runtime);
				if (!status.installed) {
					process.exitCode = 1;
				}
				return true;
			}
			case "install":
				process.exitCode = (await runtime.install()) ?? 1;
				return true;
			case "setup":
			case "link": {
				const mode: AgentPaySetupMode = parsed.command === "link" ? "link" : "wallet";
				process.exitCode = (await runtime.setup(mode)) ?? 1;
				return true;
			}
			case "wallet":
				await printWallet(runtime);
				return true;
			case "policy":
				process.exitCode = (await runtime.openPolicyTui()) ?? 1;
				return true;
			case "run":
				if (parsed.args.length === 0) {
					console.error(chalk.red(`Usage: ${APP_NAME} agentpay run -- <agentpay args...>`));
					process.exitCode = 1;
					return true;
				}
				process.exitCode = (await runtime.runPassthrough(parsed.args)) ?? 1;
				return true;
		}
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		console.error(chalk.red(`Error: ${message}`));
		process.exitCode = 1;
		return true;
	}
}

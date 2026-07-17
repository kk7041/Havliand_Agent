import { compare, valid } from "semver";
import { getHavliandAgentUserAgent } from "./havliand_agent-user-agent.ts";

const LATEST_VERSION_URL = "https://havliand_agent.dev/api/latest-version";
const DEFAULT_VERSION_CHECK_TIMEOUT_MS = 10000;

export interface LatestHavliandAgentRelease {
	version: string;
	packageName?: string;
	note?: string;
}

export function comparePackageVersions(leftVersion: string, rightVersion: string): number | undefined {
	const left = valid(leftVersion.trim());
	const right = valid(rightVersion.trim());
	if (!left || !right) {
		return undefined;
	}
	return compare(left, right);
}

export function isNewerPackageVersion(candidateVersion: string, currentVersion: string): boolean {
	const comparison = comparePackageVersions(candidateVersion, currentVersion);
	if (comparison !== undefined) {
		return comparison > 0;
	}
	return candidateVersion.trim() !== currentVersion.trim();
}

export async function getLatestHavliandAgentRelease(
	currentVersion: string,
	options: { timeoutMs?: number } = {},
): Promise<LatestHavliandAgentRelease | undefined> {
	if (process.env.HAVLIAND_AGENT_SKIP_VERSION_CHECK || process.env.HAVLIAND_AGENT_OFFLINE) return undefined;

	const response = await fetch(LATEST_VERSION_URL, {
		headers: {
			"User-Agent": getHavliandAgentUserAgent(currentVersion),
			accept: "application/json",
		},
		signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_VERSION_CHECK_TIMEOUT_MS),
	});
	if (!response.ok) return undefined;

	const data = (await response.json()) as {
		packageName?: unknown;
		version?: unknown;
		note?: unknown;
	};
	if (typeof data.version !== "string" || !data.version.trim()) {
		return undefined;
	}
	const packageName =
		typeof data.packageName === "string" && data.packageName.trim() ? data.packageName.trim() : undefined;
	const note = typeof data.note === "string" && data.note.trim() ? data.note.trim() : undefined;
	return {
		version: data.version.trim(),
		packageName,
		...(note ? { note } : {}),
	};
}

export async function getLatestHavliandAgentVersion(
	currentVersion: string,
	options: { timeoutMs?: number } = {},
): Promise<string | undefined> {
	return (await getLatestHavliandAgentRelease(currentVersion, options))?.version;
}

export async function checkForNewHavliandAgentVersion(
	currentVersion: string,
): Promise<LatestHavliandAgentRelease | undefined> {
	try {
		const latestRelease = await getLatestHavliandAgentRelease(currentVersion);
		if (latestRelease && isNewerPackageVersion(latestRelease.version, currentVersion)) {
			return latestRelease;
		}
		return undefined;
	} catch {
		return undefined;
	}
}

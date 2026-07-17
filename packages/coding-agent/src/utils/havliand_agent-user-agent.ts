export function getHavliandAgentUserAgent(version: string): string {
	const runtime = process.versions.bun ? `bun/${process.versions.bun}` : `node/${process.version}`;
	return `havliand_agent/${version} (${process.platform}; ${runtime}; ${process.arch})`;
}

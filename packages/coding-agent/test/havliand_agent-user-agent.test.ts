import { describe, expect, it } from "vitest";
import { getHavliandAgentUserAgent } from "../src/utils/havliand_agent-user-agent.ts";

describe("getHavliandAgentUserAgent", () => {
	it("formats the user agent expected by havliand_agent", () => {
		const runtime = process.versions.bun ? `bun/${process.versions.bun}` : `node/${process.version}`;
		const userAgent = getHavliandAgentUserAgent("1.2.3");

		expect(userAgent).toBe(`havliand_agent/1.2.3 (${process.platform}; ${runtime}; ${process.arch})`);
		expect(userAgent).toMatch(/^havliand_agent\/[^\s()]+ \([^;()]+;\s*[^;()]+;\s*[^()]+\)$/);
	});
});

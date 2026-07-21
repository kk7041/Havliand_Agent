import { describe, expect, test } from "vitest";
import { UserMessageComponent } from "../src/modes/interactive/components/user-message.ts";
import { initTheme } from "../src/modes/interactive/theme/theme.ts";
import { formatUserMessageForDisplay } from "../src/utils/image-labels.ts";

const OSC133_ZONE_START = "\x1b]133;A\x07";
const OSC133_ZONE_END = "\x1b]133;B\x07";
const OSC133_ZONE_FINAL = "\x1b]133;C\x07";

describe("UserMessageComponent", () => {
	test("keeps closing OSC markers after opening markers for single-line messages", () => {
		initTheme("dark");

		const component = new UserMessageComponent("hello");
		const lines = component.render(20);

		expect(lines).toHaveLength(2);
		expect(lines[0]).toContain(OSC133_ZONE_START);
		expect(lines[0]).not.toContain(OSC133_ZONE_END);
		expect(lines[0]).toContain("hello");
		expect(lines[1]).toBe(OSC133_ZONE_END + OSC133_ZONE_FINAL);
	});

	test("formats image content as stable compact labels for display", () => {
		const text = formatUserMessageForDisplay({
			role: "user",
			timestamp: 1000,
			content: [
				{ type: "text", text: "look at this" },
				{ type: "image", mimeType: "image/png", data: "abc" },
				{ type: "image", mimeType: "image/jpeg", data: "def" },
			],
		});

		expect(text).toBe("look at this\n[image1] [image2]");
		expect(text).not.toContain("abc");
	});

	test("replaces image file tags and image URLs in display text", () => {
		const text = formatUserMessageForDisplay({
			role: "user",
			timestamp: 1000,
			content: [
				{
					type: "text",
					text: '<file name="/tmp/havliand_agent-clipboard-long-name.png"></file>\nhttps://example.com/very/long/screenshot.jpeg',
				},
				{ type: "image", mimeType: "image/png", data: "abc" },
			],
		});

		expect(text).toContain("[image1]");
		expect(text).toContain("[image2]");
		expect(text).not.toContain("havliand_agent-clipboard-long-name.png");
		expect(text).not.toContain("https://example.com/very/long/screenshot.jpeg");
	});
});

import assert from "node:assert";
import { describe, it } from "node:test";
import { Loader } from "../src/components/loader.ts";
import type { TUI } from "../src/tui.ts";

describe("Loader", () => {
	it("uses built-in indicator presets when frames are not provided", () => {
		const tui = { requestRender: () => {} } as unknown as TUI;
		const loader = new Loader(
			tui,
			(text) => text,
			(text) => text,
			"Loading...",
			{ preset: "wave", intervalMs: 80 },
		);

		const firstFrame = loader.render(40).join("\n");
		loader.setIndicator({ preset: "wave", frames: ["▂▃▄"] });
		const secondFrame = loader.render(40).join("\n");

		assert.ok(firstFrame.includes("▁▂▃"));
		assert.ok(secondFrame.includes("▂▃▄"));

		loader.stop();
	});

	it("prefers explicit frames over a preset", () => {
		const tui = { requestRender: () => {} } as unknown as TUI;
		const loader = new Loader(
			tui,
			(text) => text,
			(text) => text,
			"Loading...",
			{
				preset: "scanner",
				frames: ["x"],
			},
		);

		assert.ok(loader.render(40).join("\n").includes("x Loading..."));

		loader.stop();
	});
});

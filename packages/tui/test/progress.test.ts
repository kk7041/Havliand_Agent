import assert from "node:assert";
import { describe, it } from "node:test";
import { Progress } from "../src/components/progress.ts";
import { visibleWidth } from "../src/utils.ts";

describe("Progress", () => {
	it("renders smooth partial blocks with percent and count", () => {
		const progress = new Progress({
			value: 0.375,
			count: { done: 3, total: 8 },
			width: 8,
		});

		const [line] = progress.render(30);

		assert.ok(line.includes("███"));
		assert.ok(line.includes("38%"));
		assert.ok(line.includes("3/8"));
		assert.equal(visibleWidth(line), 30);
	});

	it("accounts for CJK label width when padding", () => {
		const progress = new Progress({
			value: 0.5,
			label: "任务",
			count: { done: 1, total: 2 },
			width: 10,
		});

		const [line] = progress.render(28);

		assert.ok(line.includes("任务"));
		assert.equal(visibleWidth(line), 28);
	});
});

import type { ExtensionAPI } from "@havliand_agent/coding-agent";

export default function widgetPlacementExtension(havliand_agent: ExtensionAPI) {
	havliand_agent.on("session_start", (_event, ctx) => {
		if (!ctx.hasUI) return;
		ctx.ui.setWidget("widget-above", ["Above editor widget"]);
		ctx.ui.setWidget("widget-below", ["Below editor widget"], { placement: "belowEditor" });
	});
}

import {
	Container,
	type Focusable,
	type SelectItem,
	SelectList,
	type SelectListLayoutOptions,
	Spacer,
	Text,
} from "@havliand_agent/tui";
import type { AgentConfig } from "../../../core/subagent/index.ts";
import { getSelectListTheme, theme } from "../theme/theme.ts";
import { DynamicBorder } from "./dynamic-border.ts";

const AGENT_SELECT_LIST_LAYOUT: SelectListLayoutOptions = {
	minPrimaryColumnWidth: 12,
	maxPrimaryColumnWidth: 24,
};

function formatAgentDescription(agent: AgentConfig): string {
	const model = agent.model || "session model";
	return `${agent.source} · ${model}`;
}

export class AgentSelectorComponent extends Container implements Focusable {
	private selectList: SelectList;
	private _focused = false;

	get focused(): boolean {
		return this._focused;
	}

	set focused(value: boolean) {
		this._focused = value;
	}

	constructor(agents: AgentConfig[], onSelect: (agent: AgentConfig) => void, onCancel: () => void) {
		super();

		this.addChild(new DynamicBorder());
		this.addChild(new Spacer(1));
		this.addChild(new Text(theme.bold(theme.fg("accent", "Subagent Models")), 0, 0));
		this.addChild(new Text(theme.fg("muted", "Choose an agent to configure."), 0, 0));
		this.addChild(new Spacer(1));

		const agentByName = new Map(agents.map((agent) => [agent.name, agent]));
		const items: SelectItem[] = agents.map((agent) => ({
			value: agent.name,
			label: agent.name,
			description: formatAgentDescription(agent),
		}));

		this.selectList = new SelectList(
			items,
			Math.min(items.length, 10),
			getSelectListTheme(),
			AGENT_SELECT_LIST_LAYOUT,
		);
		this.selectList.onSelect = (item) => {
			const agent = agentByName.get(item.value);
			if (agent) onSelect(agent);
		};
		this.selectList.onCancel = onCancel;
		this.addChild(this.selectList);

		this.addChild(new Spacer(1));
		this.addChild(new Text(theme.fg("dim", "  Enter to select · Esc to cancel"), 0, 0));
		this.addChild(new DynamicBorder());
	}

	handleInput(data: string): void {
		this.selectList.handleInput(data);
	}
}

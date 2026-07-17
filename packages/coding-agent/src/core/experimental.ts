export function areExperimentalFeaturesEnabled(): boolean {
	return process.env.HAVLIAND_AGENT_EXPERIMENTAL === "1";
}

import type { ProviderStreams } from "../types.ts";
import { lazyApi } from "./lazy.ts";

export const havliand_agentMessagesApi = (): ProviderStreams => lazyApi(() => import("./havliand_agent-messages.ts"));

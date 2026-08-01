import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { RefreshModelsContext } from "@earendil-works/pi-ai";
import { loadSettings, resolveApiKeys } from "./settings.js";
import { fetchPricing } from "./fetch.js";
import { fetchModelsDev } from "./fetch.js";
import { computeModels } from "./computeModels.js";
import { agentrouterConfigCommand } from "./command.js";

export default async function (pi: ExtensionAPI) {
  const settings = loadSettings(process.cwd());

  if (settings.debug) {
    console.log("[agentrouter] settings loaded:", JSON.stringify(settings, null, 2));
  }

  const apiKeys = resolveApiKeys(settings);

  if (settings.debug) {
    console.log("[agentrouter] api keys:", JSON.stringify(apiKeys, null, 2));
  }

  // If no API keys are configured, register a command to configure them
  if (apiKeys.length === 0) {
    pi.registerCommand("agentrouter-config", {
      description: "Configure Agent Router settings",
      handler: async (args, ctx) => {
        await agentrouterConfigCommand(args, ctx);
      },
    });
    return;
  }

  // Fetch initial models at startup
  let initialModels: Array<{
    id: string;
    name: string;
    api?: "anthropic-messages" | "openai-completions";
    baseUrl?: string;
    reasoning: boolean;
    input: string[];
    cost: { input: number; output: number; cacheRead: number; cacheWrite: number };
    contextWindow: number;
    maxTokens: number;
  }> = [];

  try {
    const pricing = await fetchPricing();
    const modelsDev = await fetchModelsDev();
    initialModels = computeModels(pricing, modelsDev, settings);
  } catch (err) {
    console.error("[agentrouter] initial model fetch failed:", err);
  }

  const providerCommon = {
    baseUrl: settings.api_base,
    api: "anthropic-messages",
    models: initialModels,
    authHeader: true
  }

  // Register a provider for each API key
  const singleKey = apiKeys.length === 1;
  for (const { id, key } of apiKeys) {
    const providerName = singleKey ? "agentrouter" : `agentrouter_${id}`;
    if (settings.debug) {
      console.log(`[agentrouter] registering provider ${providerName}`);
    }
    pi.registerProvider(providerName, {
      ...providerCommon,
      name: singleKey ? "Agent Router" : `Agent Router (${id})`,
      apiKey: key,
      async refreshModels(_context: RefreshModelsContext) {
        try {
          const pricing = await fetchPricing();
          const modelsDev = await fetchModelsDev();
          return computeModels(pricing, modelsDev, settings);
        } catch (err) {
          console.error(`[agentrouter] refreshModels failed for ${providerName}:`, err);
          return [];
        }
      },
    });
  }

  // Register the config command
  pi.registerCommand("agentrouter-config", {
    description: "Configure Agent Router settings",
    handler: async (args, ctx) => {
      await agentrouterConfigCommand(args, ctx);
    },
  });
}

import type { PricingResponse, ModelsDevResponse } from "./fetch.js";
import type { Settings } from "./settings.js";

const TOKEN_TO_COST_RATIO = 500_000;

export function computeModels(
  pricing: PricingResponse,
  modelsDev: ModelsDevResponse,
  settings: Settings
): Array<{
  id: string;
  name: string;
  api?: "anthropic-messages" | "openai-completions";
  baseUrl?: string;
  reasoning: boolean;
  input: string[];
  cost: { input: number; output: number; cacheRead: number; cacheWrite: number };
  contextWindow: number;
  maxTokens: number;
}> {
  const groupRatio = pricing.group_ratio["default"] ?? 1;

  return pricing.data.map((basicInfo) => {
    const modelDetail = getModelsDevDetail(basicInfo.model_name, modelsDev);

    const id = basicInfo.model_name;
    const name = modelDetail ? modelDetail.name : basicInfo.model_name;

    const supportsAnthropic = basicInfo.supported_endpoint_types.includes("anthropic");
    const api = supportsAnthropic ? "anthropic-messages" : "openai-completions";
    const baseUrl = api === "openai-completions" ? `${settings.api_base}/v1` : undefined;

    const reasoning = modelDetail?.reasoning ?? false;
    const input = modelDetail?.modalities.input.filter((m) => m !== "pdf") ?? ["text"];

    const cost = {
      input: (groupRatio * basicInfo.model_ratio * 1_000_000) / TOKEN_TO_COST_RATIO,
      output: (groupRatio * basicInfo.completion_ratio * 1_000_000) / TOKEN_TO_COST_RATIO,
      cacheRead: 0,
      cacheWrite: 0,
    };

    const contextWindow = modelDetail?.limit?.context ?? 128_000;
    const maxTokens = modelDetail?.limit?.output ?? 4096;

    return {
      id,
      name,
      api,
      baseUrl,
      reasoning,
      input,
      cost,
      contextWindow,
      maxTokens,
    };
  });
}

function getModelsDevDetail(
  modelName: string,
  modelsDev: ModelsDevResponse
) {
  for (const [id, entry] of Object.entries(modelsDev)) {
    const parts = id.split("/");
    const name = parts[parts.length - 1];
    if (name === modelName) {
      return entry;
    }
  }
  return null;
}

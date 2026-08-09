import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";

const PRICING_URL = "https://agentrouter.org/api/pricing";
const MODELSDEV_URL = "https://models.dev/models.json";

export interface PricingModel {
  model_name: string;
  quota_type: number;
  model_ratio: number;
  model_price: number;
  owner_by: string;
  completion_ratio: number;
  enable_groups: string[];
  supported_endpoint_types: string[];
}

export interface PricingResponse {
  data: PricingModel[];
  group_ratio: Record<string, number>;
  success: boolean;
  usable_group: Record<string, string>;
}

export async function fetchPricing(): Promise<PricingResponse> {
  const res = await fetch(PRICING_URL);
  if (!res.ok) {
    throw new Error(`Pricing API error: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

export interface ModelsDevEntry {
  id: string;
  name: string;
  description?: string;
  family?: string;
  attachment: boolean;
  reasoning: boolean;
  tool_call: boolean;
  structured_output: boolean;
  temperature: boolean;
  release_date: string;
  last_updated: string;
  modalities: { input: string[]; output: string[] };
  open_weights: boolean;
  limit?: { context?: number; output?: number };
  weights?: Array<{ label: string; url: string }>;
  benchmarks?: Array<{
    name: string;
    score: number;
    metric: string;
    source?: string;
    date?: string;
    harness?: string;
    version?: string;
  }>;
}

export interface ModelsDevResponse {
  [key: string]: ModelsDevEntry;
}

export function modelsCachePath(): string {
  return join(homedir(), ".agentrouter", ".models-cache.json");
}
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export async function fetchModelsDev(): Promise<ModelsDevResponse> {
  const cachePath = modelsCachePath();
  if (existsSync(cachePath)) {
    const stat = statSync(cachePath);
    if (Date.now() - stat.mtimeMs < CACHE_TTL_MS) {
      try {
        return JSON.parse(readFileSync(cachePath, "utf-8"));
      } catch {
        // cache corrupted, re-fetch
      }
    }
  }

  const res = await fetch(MODELSDEV_URL);
  if (!res.ok) {
    throw new Error(`models.dev error: ${res.status} ${res.statusText}`);
  }
  const data = (await res.json()) as ModelsDevResponse;

  const cacheDir = dirname(cachePath);
  if (!existsSync(cacheDir)) {
    mkdirSync(cacheDir, { recursive: true });
  }
  writeFileSync(cachePath, JSON.stringify(data));

  return data;
}

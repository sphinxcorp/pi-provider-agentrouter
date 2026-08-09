import { test } from "vitest";
import assert from "node:assert/strict";

import { computeModels } from "../computeModels.js";
import type { PricingResponse, ModelsDevResponse } from "../fetch.js";
import type { Settings } from "../settings.js";

const SETTINGS: Settings = {
  api_base: "https://agentrouter.org",
  debug: false,
};

const pricing = (data: PricingResponse["data"]): PricingResponse => ({
  data,
  group_ratio: { default: 1 },
  success: true,
  usable_group: {},
});

const entry = (name: string, types: string[], ratio = 3, completion = 15): PricingResponse["data"][0] => ({
  model_name: name,
  quota_type: 0,
  model_ratio: ratio,
  model_price: 0,
  owner_by: "test",
  completion_ratio: completion,
  enable_groups: ["default"],
  supported_endpoint_types: types,
});

const modelsDev = (m: ModelsDevResponse): ModelsDevResponse => m;

// ── basic single-endpoint (anthropic) ─────────────────────────────────────

test("computeModels: anthropic-only model has no api/baseUrl override", () => {
  const result = computeModels(
    pricing([entry("claude-sonnet-4", ["anthropic"])]),
    modelsDev({ "test/claude-sonnet-4": {
      id: "test/claude-sonnet-4", name: "Claude Sonnet 4",
      attachment: false, reasoning: false, tool_call: true, structured_output: false,
      temperature: true, release_date: "2025-01-01", last_updated: "2025-01-01",
      modalities: { input: ["text", "image"], output: ["text"] },
      open_weights: false, limit: { context: 200000, output: 8192 },
    } }),
    SETTINGS
  );
  assert.equal(result.length, 1);
  assert.equal(result[0].id, "claude-sonnet-4");
  assert.equal(result[0].name, "Claude Sonnet 4");
  assert.equal(result[0].api, undefined);
  assert.equal(result[0].baseUrl, undefined);
});

// ── openai-only ───────────────────────────────────────────────────────────

test("computeModels: openai-only model gets openai-completions api and baseUrl", () => {
  const result = computeModels(
    pricing([entry("gpt-5", ["openai"])]),
    modelsDev({ "test/gpt-5": {
      id: "test/gpt-5", name: "GPT-5",
      attachment: false, reasoning: false, tool_call: true, structured_output: false,
      temperature: true, release_date: "2025-01-01", last_updated: "2025-01-01",
      modalities: { input: ["text"], output: ["text"] },
      open_weights: false, limit: { context: 128000, output: 16384 },
    } }),
    SETTINGS
  );
  assert.equal(result.length, 1);
  assert.equal(result[0].api, "openai-completions");
  assert.equal(result[0].baseUrl, "https://agentrouter.org/v1");
});

// ── dual endpoint ─────────────────────────────────────────────────────────

test("computeModels: model supporting both endpoints yields two entries", () => {
  const result = computeModels(
    pricing([entry("claude-opus", ["anthropic", "openai"])]),
    modelsDev({ "test/claude-opus": {
      id: "test/claude-opus", name: "Claude Opus",
      attachment: false, reasoning: false, tool_call: true, structured_output: false,
      temperature: true, release_date: "2025-01-01", last_updated: "2025-01-01",
      modalities: { input: ["text"], output: ["text"] },
      open_weights: false, limit: { context: 200000, output: 4096 },
    } }),
    SETTINGS
  );
  assert.equal(result.length, 2);
  // anthropic entry first, openai second
  const anthropic = result.find((r) => r.api === undefined);
  const openai = result.find((r) => r.api === "openai-completions");
  assert.ok(anthropic);
  assert.ok(openai);
  assert.equal(openai!.name, "Claude Opus via OpenAI Completions");
  assert.equal(anthropic!.name, "Claude Opus");
});

// ── unsupported endpoint filtered out ──────────────────────────────────────

test("computeModels: model with only unsupported endpoint yields no entries", () => {
  const result = computeModels(
    pricing([entry("weird-model", ["google"])]),
    modelsDev({}),
    SETTINGS
  );
  assert.equal(result.length, 0);
});

// ── missing models.dev entry ──────────────────────────────────────────────

test("computeModels: missing models.dev entry uses pricing name and defaults", () => {
  const result = computeModels(
    pricing([entry("new-model", ["anthropic"])]),
    modelsDev({}),
    SETTINGS
  );
  assert.equal(result.length, 1);
  assert.equal(result[0].name, "new-model");
  assert.equal(result[0].reasoning, false);
  assert.deepEqual(result[0].input, ["text"]);
  assert.equal(result[0].contextWindow, 128000);
  assert.equal(result[0].maxTokens, 4096);
});

// ── pdf filtered from input modalities ────────────────────────────────────

test("computeModels: pdf is filtered from input modalities", () => {
  const result = computeModels(
    pricing([entry("pdf-model", ["anthropic"])]),
    modelsDev({ "test/pdf-model": {
      id: "test/pdf-model", name: "PDF Model",
      attachment: false, reasoning: false, tool_call: true, structured_output: false,
      temperature: true, release_date: "2025-01-01", last_updated: "2025-01-01",
      modalities: { input: ["text", "pdf", "image"], output: ["text"] },
      open_weights: false, limit: { context: 200000, output: 8192 },
    } }),
    SETTINGS
  );
  assert.deepEqual(result[0].input, ["text", "image"]);
});

// ── cost calculation ──────────────────────────────────────────────────────

test("computeModels: cost calculated correctly with default group_ratio", () => {
  const result = computeModels(
    pricing([entry("cost-model", ["anthropic"], 5, 25)]),
    modelsDev({}),
    SETTINGS
  );
  // input: (1 * 5 * 1_000_000) / 500_000 = 10
  // output: (1 * 25 * 1_000_000) / 500_000 = 50
  assert.equal(result[0].cost.input, 10);
  assert.equal(result[0].cost.output, 50);
  assert.equal(result[0].cost.cacheRead, 0);
  assert.equal(result[0].cost.cacheWrite, 0);
});

test("computeModels: cost scales with non-default group_ratio", () => {
  const result = computeModels(
    {
      data: [entry("cost-model", ["anthropic"], 2, 10)],
      group_ratio: { default: 3 },
      success: true,
      usable_group: {},
    },
    modelsDev({}),
    SETTINGS
  );
  // input: (3 * 2 * 1_000_000) / 500_000 = 12
  assert.equal(result[0].cost.input, 12);
});

test("computeModels: cost when group_ratio default missing falls back to 1", () => {
  const result = computeModels(
    {
      data: [entry("cost-model", ["anthropic"], 4, 8)],
      group_ratio: {},
      success: true,
      usable_group: {},
    },
    modelsDev({}),
    SETTINGS
  );
  // input: (1 * 4 * 1_000_000) / 500_000 = 8
  assert.equal(result[0].cost.input, 8);
});

// ── reasoning passthrough ─────────────────────────────────────────────────

test("computeModels: reasoning flag carried from models.dev", () => {
  const result = computeModels(
    pricing([entry("think-model", ["anthropic"])]),
    modelsDev({ "test/think-model": {
      id: "test/think-model", name: "Think Model",
      attachment: false, reasoning: true, tool_call: true, structured_output: false,
      temperature: true, release_date: "2025-01-01", last_updated: "2025-01-01",
      modalities: { input: ["text"], output: ["text"] },
      open_weights: false, limit: { context: 128000, output: 16384 },
    } }),
    SETTINGS
  );
  assert.equal(result[0].reasoning, true);
});

// ── contextWindow / maxTokens from models.dev limits ──────────────────────

test("computeModels: contextWindow and maxTokens from models.dev limit", () => {
  const result = computeModels(
    pricing([entry("limit-model", ["anthropic"])]),
    modelsDev({ "test/limit-model": {
      id: "test/limit-model", name: "Limit Model",
      attachment: false, reasoning: false, tool_call: true, structured_output: false,
      temperature: true, release_date: "2025-01-01", last_updated: "2025-01-01",
      modalities: { input: ["text"], output: ["text"] },
      open_weights: false, limit: { context: 500000, output: 32000 },
    } }),
    SETTINGS
  );
  assert.equal(result[0].contextWindow, 500000);
  assert.equal(result[0].maxTokens, 32000);
});

// ── empty pricing ──────────────────────────────────────────────────────────

test("computeModels: empty pricing data returns empty array", () => {
  const result = computeModels(pricing([]), modelsDev({}), SETTINGS);
  assert.deepEqual(result, []);
});

// ── multiple models ───────────────────────────────────────────────────────

test("computeModels: multiple models each produce entries", () => {
  const result = computeModels(
    pricing([
      entry("model-a", ["anthropic"]),
      entry("model-b", ["openai"]),
    ]),
    modelsDev({}),
    SETTINGS
  );
  assert.equal(result.length, 2);
  assert.equal(result[0].id, "model-a");
  assert.equal(result[1].id, "model-b");
});

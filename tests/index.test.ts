import { test, beforeEach, afterEach } from "vitest";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { loadSettings } from "../settings.js";

// Mock fetch before importing index (index calls fetchPricing/fetchModelsDev).
const realFetch = globalThis.fetch;
const mockPricing = {
  data: [
    {
      model_name: "claude-sonnet-4",
      quota_type: 0,
      model_ratio: 3,
      model_price: 0,
      owner_by: "anthropic",
      completion_ratio: 15,
      enable_groups: ["default"],
      supported_endpoint_types: ["anthropic", "openai"],
    },
  ],
  group_ratio: { default: 1 },
  success: true,
  usable_group: {},
};
const mockModelsDev = {
  "anthropic/claude-sonnet-4": {
    id: "anthropic/claude-sonnet-4",
    name: "Claude Sonnet 4",
    attachment: false,
    reasoning: false,
    tool_call: true,
    structured_output: false,
    temperature: true,
    release_date: "2025-01-01",
    last_updated: "2025-01-01",
    modalities: { input: ["text", "image"], output: ["text"] },
    open_weights: false,
    limit: { context: 200000, output: 8192 },
  },
};

beforeEach(() => {
  globalThis.fetch = async (url: any) => {
    const u = String(url);
    if (u.includes("agentrouter.org/api/pricing")) {
      return { ok: true, status: 200, statusText: "OK", json: async () => mockPricing } as any;
    }
    if (u.includes("models.dev")) {
      return { ok: true, status: 200, statusText: "OK", json: async () => mockModelsDev } as any;
    }
    return { ok: false, status: 404, statusText: "Not Found", json: async () => ({}) } as any;
  };
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

function makeHome() {
  const home = mkdtempSync(join(tmpdir(), "ar-test-"));
  const orig = {
    HOME: process.env.HOME,
    API_KEY: process.env.AGENT_ROUTER_API_KEY,
    API_BASE: process.env.AGENT_ROUTER_API_BASE,
  };
  process.env.HOME = home;
  delete process.env.AGENT_ROUTER_API_KEY;
  delete process.env.AGENT_ROUTER_API_BASE;
  return {
    home,
    cleanup: () => {
      if (orig.HOME === undefined) delete process.env.HOME;
      else process.env.HOME = orig.HOME;
      if (orig.API_KEY === undefined) delete process.env.AGENT_ROUTER_API_KEY;
      else process.env.AGENT_ROUTER_API_KEY = orig.API_KEY;
      if (orig.API_BASE === undefined) delete process.env.AGENT_ROUTER_API_BASE;
      else process.env.AGENT_ROUTER_API_BASE = orig.API_BASE;
      rmSync(home, { recursive: true, force: true });
    },
  };
}

function makePi() {
  const providers: Record<string, any> = {};
  const commands: Record<string, any> = {};
  return {
    providers,
    commands,
    registerProvider: (name: string, config: any) => { providers[name] = config; },
    registerCommand: (name: string, config: any) => { commands[name] = config; },
  };
}

// ── no keys: only config command registered ─────────────────────────────────

test("index: no keys → registers only config command, no providers", async () => {
  const { cleanup } = makeHome();
  process.env.AGENT_ROUTER_API_KEY = ""; // ensure env key absent
  delete process.env.AGENT_ROUTER_API_KEY;
  try {
    const pi = makePi();
    const ext = (await import("../index.js")).default;
    await ext(pi as any);

    assert.equal(Object.keys(pi.providers).length, 0, "no providers");
    assert.ok(pi.commands["agentrouter-config"], "config command registered");
  } finally {
    cleanup();
  }
});

// ── single key: registers one provider ──────────────────────────────────────

test("index: single key → registers provider named 'agentrouter'", async () => {
  const { cleanup } = makeHome();
  process.env.AGENT_ROUTER_API_KEY = "sk-single1234567890";
  try {
    const pi = makePi();
    const ext = (await import("../index.js")).default;
    await ext(pi as any);

    const provider = pi.providers["agentrouter"];
    assert.ok(provider, "agentrouter provider registered");
    assert.equal(provider.name, "Agent Router");
    assert.equal(provider.apiKey, "sk-single1234567890");
    assert.equal(provider.api, "anthropic-messages");
    assert.equal(provider.baseUrl, "https://agentrouter.org");
    assert.equal(provider.authHeader, true);
    assert.ok(Array.isArray(provider.models));
    assert.ok(provider.models.length > 0, "models fetched at startup");
  } finally {
    cleanup();
  }
});

// ── multiple keys: registers one provider per key ───────────────────────────

test("index: multiple keys → registers one provider per key with distinct names", async () => {
  const { home, cleanup } = makeHome();
  mkdirSync(join(home, ".agentrouter"), { recursive: true });
  writeFileSync(
    join(home, ".agentrouter", "settings.json"),
    JSON.stringify({ api_keys: ["sk-key-one1111111111111111", "sk-key-two22222222222222"] })
  );
  try {
    const pi = makePi();
    const ext = (await import("../index.js")).default;
    await ext(pi as any);

    const names = Object.keys(pi.providers).sort();
    assert.deepEqual(names, ["agentrouter_0", "agentrouter_1"]);
    assert.equal(pi.providers["agentrouter_0"].name, "Agent Router (0)");
    assert.equal(pi.providers["agentrouter_1"].name, "Agent Router (1)");
  } finally {
    cleanup();
  }
});

// ── refreshModels: returns computed models ──────────────────────────────────

test("index: refreshModels returns fresh model list", async () => {
  const { cleanup } = makeHome();
  process.env.AGENT_ROUTER_API_KEY = "sk-refresh1234567890abc";
  try {
    const pi = makePi();
    const ext = (await import("../index.js")).default;
    await ext(pi as any);

    const provider = pi.providers["agentrouter"];
    const refreshed = await provider.refreshModels({} as any);
    assert.ok(Array.isArray(refreshed));
    assert.ok(refreshed.length > 0);
    assert.equal(refreshed[0].id, "claude-sonnet-4");
  } finally {
    cleanup();
  }
});

// ── config command always registered ─────────────────────────────────────────

test("index: config command registered even with keys present", async () => {
  const { cleanup } = makeHome();
  process.env.AGENT_ROUTER_API_KEY = "sk-cmd1234567890abcdef";
  try {
    const pi = makePi();
    const ext = (await import("../index.js")).default;
    await ext(pi as any);

    assert.ok(pi.commands["agentrouter-config"]);
    assert.equal(pi.commands["agentrouter-config"].description, "Configure Agent Router settings");
  } finally {
    cleanup();
  }
});

// ── custom api_base propagated ───────────────────────────────────────────────

test("index: custom api_base propagated to provider baseUrl", async () => {
  const { cleanup } = makeHome();
  process.env.AGENT_ROUTER_API_KEY = "sk-base1234567890abcdef";
  process.env.AGENT_ROUTER_API_BASE = "https://my-proxy.example.com";
  try {
    const pi = makePi();
    const ext = (await import("../index.js")).default;
    await ext(pi as any);

    assert.equal(pi.providers["agentrouter"].baseUrl, "https://my-proxy.example.com");
  } finally {
    cleanup();
  }
});

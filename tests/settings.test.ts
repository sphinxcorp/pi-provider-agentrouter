import { test, beforeEach, afterEach } from "vitest";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  loadSettings,
  resolveApiKey,
  resolveApiKeys,
  type Settings,
} from "../settings.js";

let home: string;
let origHome: string | undefined;

function writeSettings(path: string, s: Settings) {
  mkdirSync(join(path, ".agentrouter"), { recursive: true });
  writeFileSync(join(path, ".agentrouter", "settings.json"), JSON.stringify(s));
}

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "ar-test-"));
  origHome = process.env.HOME;
  process.env.HOME = home;
});

afterEach(() => {
  if (origHome === undefined) delete process.env.HOME;
  else process.env.HOME = origHome;
  rmSync(home, { recursive: true, force: true });
  delete process.env.AGENT_ROUTER_API_KEY;
  delete process.env.AGENT_ROUTER_API_BASE;
});

// ── resolveApiKey ────────────────────────────────────────────────────────

test("resolveApiKey: string key gets numeric id", () => {
  assert.deepEqual(resolveApiKey("sk-abc", 0), { id: "0", key: "sk-abc" });
});

test("resolveApiKey: string key uses given index", () => {
  assert.deepEqual(resolveApiKey("sk-abc", 3), { id: "3", key: "sk-abc" });
});

test("resolveApiKey: object without id falls back to index", () => {
  assert.deepEqual(resolveApiKey({ key: "sk-x" }, 2), { id: "2", key: "sk-x" });
});

test("resolveApiKey: object with explicit id keeps it", () => {
  assert.deepEqual(resolveApiKey({ key: "sk-x", id: "work" }, 2), {
    id: "work",
    key: "sk-x",
  });
});

// ── resolveApiKeys ───────────────────────────────────────────────────────

test("resolveApiKeys: empty settings returns empty", () => {
  assert.deepEqual(resolveApiKeys({} as Settings), []);
});

test("resolveApiKeys: maps string keys with sequential ids", () => {
  const keys = resolveApiKeys({ api_keys: ["a", "b"] });
  assert.deepEqual(keys, [
    { id: "0", key: "a" },
    { id: "1", key: "b" },
  ]);
});

test("resolveApiKeys: mixed string and object keys", () => {
  const keys = resolveApiKeys({ api_keys: ["a", { key: "b", id: "custom" }] });
  assert.deepEqual(keys, [
    { id: "0", key: "a" },
    { id: "custom", key: "b" },
  ]);
});

// ── loadSettings: defaults ───────────────────────────────────────────────

test("loadSettings: applies defaults when nothing is configured", () => {
  const s = loadSettings(process.cwd());
  assert.equal(s.api_base, "https://agentrouter.org");
  assert.equal(s.debug, false);
  assert.deepEqual(s.api_keys, []);
});

// ── loadSettings: global file ────────────────────────────────────────────

test("loadSettings: reads global settings from home", () => {
  writeSettings(home, {
    api_base: "https://custom.example.com",
    debug: true,
    api_keys: ["sk-global"],
  });
  const s = loadSettings(process.cwd());
  assert.equal(s.api_base, "https://custom.example.com");
  assert.equal(s.debug, true);
  assert.equal(s.api_keys!.length, 1);
  assert.equal((s.api_keys![0] as any).key ?? s.api_keys![0], "sk-global");
});

// ── loadSettings: env api_base override ──────────────────────────────────

test("loadSettings: AGENT_ROUTER_API_BASE overrides file setting", () => {
  writeSettings(home, { api_base: "https://file.example.com" });
  process.env.AGENT_ROUTER_API_BASE = "https://env.example.com";
  const s = loadSettings(process.cwd());
  assert.equal(s.api_base, "https://env.example.com");
});

test("loadSettings: AGENT_ROUTER_API_BASE overrides default", () => {
  process.env.AGENT_ROUTER_API_BASE = "https://env.example.com";
  const s = loadSettings(process.cwd());
  assert.equal(s.api_base, "https://env.example.com");
});

// ── loadSettings: env api_key ────────────────────────────────────────────

test("loadSettings: AGENT_ROUTER_API_KEY is prepended with id=env", () => {
  process.env.AGENT_ROUTER_API_KEY = "sk-from-env";
  const s = loadSettings(process.cwd());
  assert.equal(s.api_keys!.length, 1);
  const first = s.api_keys![0] as { key: string; id: string };
  assert.equal(first.key, "sk-from-env");
  assert.equal(first.id, "env");
});

test("loadSettings: project settings file overrides global api_base", () => {
  writeSettings(home, { api_base: "https://global.example.com" });
  const cwd = mkdtempSync(join(tmpdir(), "ar-proj-"));
  writeSettings(cwd, { api_base: "https://project.example.com" });
  const s = loadSettings(cwd);
  assert.equal(s.api_base, "https://project.example.com");
});

// ── loadSettings: dedup ──────────────────────────────────────────────────

test("loadSettings: deduplicates keys keeping first occurrence", () => {
  writeSettings(home, { api_keys: ["sk-dupe", "sk-dupe", "sk-unique"] });
  const s = loadSettings(process.cwd());
  assert.equal(s.api_keys!.length, 2);
});

test("loadSettings: env key deduped against identical file key", () => {
  process.env.AGENT_ROUTER_API_KEY = "sk-same";
  writeSettings(home, { api_keys: ["sk-same"] });
  const s = loadSettings(process.cwd());
  assert.equal(s.api_keys!.length, 1);
});

// ── loadSettings: debug flag merge ──────────────────────────────────────

test("loadSettings: global debug true is preserved without project file", () => {
  writeSettings(home, { debug: true });
  const s = loadSettings(process.cwd());
  assert.equal(s.debug, true);
});

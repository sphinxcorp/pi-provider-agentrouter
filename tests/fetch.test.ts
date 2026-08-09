import { test, beforeEach, afterEach } from "vitest";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, utimesSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { fetchPricing, fetchModelsDev } from "../fetch.js";

let home: string;
let origHome: string | undefined;
const realFetch = globalThis.fetch;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "ar-test-"));
  origHome = process.env.HOME;
  process.env.HOME = home;
});

afterEach(() => {
  if (origHome === undefined) delete process.env.HOME;
  else process.env.HOME = origHome;
  rmSync(home, { recursive: true, force: true });
  globalThis.fetch = realFetch;
});

function cachePath() {
  return join(home, ".agentrouter", ".models-cache.json");
}

// ── fetchPricing ──────────────────────────────────────────────────────────

test("fetchPricing: returns parsed JSON on success", async () => {
  globalThis.fetch = async () =>
    ({ ok: true, status: 200, statusText: "OK", json: async () => ({ success: true, data: [] }) }) as any;

  const result = await fetchPricing();
  assert.deepEqual(result, { success: true, data: [] });
});

test("fetchPricing: throws on non-ok response", async () => {
  globalThis.fetch = async () =>
    ({ ok: false, status: 500, statusText: "Server Error", json: async () => ({}) }) as any;

  await assert.rejects(() => fetchPricing(), /Pricing API error: 500 Server Error/);
});

test("fetchPricing: throws on 404", async () => {
  globalThis.fetch = async () =>
    ({ ok: false, status: 404, statusText: "Not Found", json: async () => ({}) }) as any;

  await assert.rejects(() => fetchPricing(), /Pricing API error: 404 Not Found/);
});

// ── fetchModelsDev: network fetch ─────────────────────────────────────────

test("fetchModelsDev: fetches and parses on cache miss", async () => {
  globalThis.fetch = async () =>
    ({ ok: true, status: 200, statusText: "OK", json: async () => ({ "test/m": { id: "test/m", name: "M" } }) }) as any;

  const result = await fetchModelsDev();
  assert.deepEqual(result, { "test/m": { id: "test/m", name: "M" } });
});

test("fetchModelsDev: throws on non-ok response", async () => {
  globalThis.fetch = async () =>
    ({ ok: false, status: 503, statusText: "Unavailable", json: async () => ({}) }) as any;

  await assert.rejects(() => fetchModelsDev(), /models.dev error: 503 Unavailable/);
});

// ── fetchModelsDev: cache write ───────────────────────────────────────────

test("fetchModelsDev: writes response to cache file", async () => {
  globalThis.fetch = async () =>
    ({ ok: true, status: 200, statusText: "OK", json: async () => ({ cached: true }) }) as any;

  await fetchModelsDev();
  assert.ok(existsSync(cachePath()), "cache file should exist");
  const raw = readFileSync(cachePath(), "utf-8");
  assert.deepEqual(JSON.parse(raw), { cached: true });
});

test("fetchModelsDev: creates .agentrouter cache dir if missing", async () => {
  globalThis.fetch = async () =>
    ({ ok: true, status: 200, statusText: "OK", json: async () => ({ fresh: 1 }) }) as any;

  // home/.agentrouter does not exist yet
  await fetchModelsDev();
  assert.ok(existsSync(cachePath()));
});

// ── fetchModelsDev: cache hit (valid mtime) ───────────────────────────────

test("fetchModelsDev: returns cached data without hitting network on fresh cache", async () => {
  // pre-populate cache
  mkdirSync(join(home, ".agentrouter"), { recursive: true });
  writeFileSync(cachePath(), JSON.stringify({ fromCache: "yes" }));

  let called = false;
  globalThis.fetch = async () => {
    called = true;
    return { ok: true, status: 200, statusText: "OK", json: async () => ({ fromCache: "no" }) } as any;
  };

  const result = await fetchModelsDev();
  assert.deepEqual(result, { fromCache: "yes" });
  assert.equal(called, false, "network fetch should not be called on cache hit");
});

// ── fetchModelsDev: cache expired (old mtime) ─────────────────────────────

test("fetchModelsDev: refetches when cache is older than 24h", async () => {
  mkdirSync(join(home, ".agentrouter"), { recursive: true });
  writeFileSync(cachePath(), JSON.stringify({ stale: true }));
  // set mtime to 25 hours ago
  const old = Date.now() - (25 * 60 * 60 * 1000);
  utimesSync(cachePath(), new Date(old), new Date(old));

  globalThis.fetch = async () =>
    ({ ok: true, status: 200, statusText: "OK", json: async () => ({ fresh: true }) }) as any;

  const result = await fetchModelsDev();
  assert.deepEqual(result, { fresh: true });
});

// ── fetchModelsDev: cache corrupted ───────────────────────────────────────

test("fetchModelsDev: refetches when cache JSON is corrupt", async () => {
  mkdirSync(join(home, ".agentrouter"), { recursive: true });
  writeFileSync(cachePath(), "{not valid json");

  globalThis.fetch = async () =>
    ({ ok: true, status: 200, statusText: "OK", json: async () => ({ recovered: true }) }) as any;

  const result = await fetchModelsDev();
  assert.deepEqual(result, { recovered: true });
});

// ── fetchModelsDev: cache miss + network error propagates ──────────────────

test("fetchModelsDev: cache miss with network failure throws", async () => {
  globalThis.fetch = async () =>
    ({ ok: false, status: 500, statusText: "Error", json: async () => ({}) }) as any;

  await assert.rejects(() => fetchModelsDev(), /models.dev error: 500 Error/);
  assert.ok(!existsSync(cachePath()), "no cache file on failure");
});

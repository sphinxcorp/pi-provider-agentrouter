import { test, beforeEach, afterEach } from "vitest";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { agentrouterConfigCommand } from "../command.js";

let home: string;
let origHome: string | undefined;

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

function captureNotify(): { messages: string[]; ctx: any } {
  const messages: string[] = [];
  return {
    messages,
    ctx: {
      cwd: process.cwd(),
      ui: {
        notify: (msg: string) => messages.push(msg),
      },
    },
  };
}

// ── no keys configured ─────────────────────────────────────────────────────

test("command: reports zero keys when none configured", async () => {
  const { messages, ctx } = captureNotify();
  await agentrouterConfigCommand("", ctx as any);
  const msg = messages[0];
  assert.match(msg, /Agent Router Configuration/);
  assert.match(msg, /API Base: https:\/\/agentrouter\.org/);
  assert.match(msg, /Debug: false/);
  assert.match(msg, /API Keys: 0 configured/);
});

// ── env key counted ─────────────────────────────────────────────────────────

test("command: counts env-provided key", async () => {
  process.env.AGENT_ROUTER_API_KEY = "sk-testkey1234567890";
  const { messages, ctx } = captureNotify();
  await agentrouterConfigCommand("", ctx as any);
  assert.match(messages[0], /API Keys: 1 configured/);
  // env key stored as { id: "env", key: ... } → displayed as id=env, key=<masked>
  assert.match(messages[0], /id=env, key=sk-testk\.\.\./);
});

// ── custom api_base reflected ───────────────────────────────────────────────

test("command: reflects custom api_base", async () => {
  process.env.AGENT_ROUTER_API_BASE = "https://custom.example.com";
  const { messages, ctx } = captureNotify();
  await agentrouterConfigCommand("", ctx as any);
  assert.match(messages[0], /API Base: https:\/\/custom\.example\.com/);
});

// ── debug flag reflected ────────────────────────────────────────────────────

test("command: reflects debug true from file", async () => {
  mkdirSync(join(home, ".agentrouter"), { recursive: true });
  writeFileSync(
    join(home, ".agentrouter", "settings.json"),
    JSON.stringify({ debug: true })
  );
  const { messages, ctx } = captureNotify();
  await agentrouterConfigCommand("", ctx as any);
  assert.match(messages[0], /Debug: true/);
});

// ── multiple keys listed ────────────────────────────────────────────────────

test("command: lists multiple keys with indices", async () => {
  mkdirSync(join(home, ".agentrouter"), { recursive: true });
  writeFileSync(
    join(home, ".agentrouter", "settings.json"),
    JSON.stringify({ api_keys: ["sk-firstkey1111111111111111", { key: "sk-secondkey222222222222", id: "work" }] })
  );
  const { messages, ctx } = captureNotify();
  await agentrouterConfigCommand("", ctx as any);
  assert.match(messages[0], /\[0\] sk-first\.\.\./);
  assert.match(messages[0], /id=work, key=sk-secon\.\.\./);
});

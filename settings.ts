import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";

export type ApiKey = string | {
  key: string;
  id?: string;
};

export type Settings = {
  api_base?: string;
  debug?: boolean;
  api_keys?: ApiKey[];
};

export function globalSettingsPath(): string {
  return join(homedir(), ".agentrouter", "settings.json");
}

export function loadSettings(cwd: string): Settings {
  const globalSettings = loadSettingsFile(globalSettingsPath());
  const projectSettings = loadSettingsFile(join(cwd, ".agentrouter", "settings.json"));

  // Project settings override global settings
  const merged: Settings = { ...globalSettings };

  if (projectSettings) {
    if (projectSettings.api_base !== undefined) {
      merged.api_base = projectSettings.api_base;
    }
    if (projectSettings.debug !== undefined) {
      merged.debug = projectSettings.debug;
    }
  }

  // AGENT_ROUTER_API_BASE overrides the default api_base
  if (process.env.AGENT_ROUTER_API_BASE !== undefined) {
    merged.api_base = process.env.AGENT_ROUTER_API_BASE;
  }

  // Apply defaults
  merged.api_base = merged.api_base ?? "https://agentrouter.org";
  merged.debug = merged.debug ?? false;

  // Build api_keys list: env key (id: "env") first, then project + global
  const projectKeys = projectSettings?.api_keys ?? [];
  const globalKeys = globalSettings?.api_keys ?? [];
  let keys: ApiKey[] = [];

  // Prepend env key if AGENT_ROUTER_API_KEY is set
  if (process.env.AGENT_ROUTER_API_KEY !== undefined) {
    keys.push({ key: process.env.AGENT_ROUTER_API_KEY, id: "env" });
  }

  keys = [...keys, ...projectKeys, ...globalKeys];

  // Deduplicate by key value, keeping first occurrence
  const seen = new Set<string>();
  merged.api_keys = keys.filter((k) => {
    const keyValue = typeof k === "string" ? k : k.key;
    if (seen.has(keyValue)) return false;
    seen.add(keyValue);
    return true;
  });

  return merged;
}

function loadSettingsFile(path: string): Settings | null {
  if (!existsSync(path)) return null;
  try {
    const raw = readFileSync(path, "utf-8");
    return JSON.parse(raw) as Settings;
  } catch {
    return null;
  }
}

export function resolveApiKey(key: ApiKey, index: number): { id: string; key: string } {
  if (typeof key === "string") {
    return { id: String(index), key };
  }
  return { id: key.id ?? String(index), key: key.key };
}

export function resolveApiKeys(settings: Settings): Array<{ id: string; key: string }> {
  const keys = settings.api_keys ?? [];
  return keys.map((key, index) => resolveApiKey(key, index));
}

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

const GLOBAL_SETTINGS_PATH = join(homedir(), ".agentrouter", "settings.json");

export function loadSettings(cwd: string): Settings {
  const globalSettings = loadSettingsFile(GLOBAL_SETTINGS_PATH);
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
    // Merge keys: project keys + global keys, project keys first
    const globalKeys = globalSettings?.api_keys ?? [];
    const projectKeys = projectSettings?.api_keys ?? [];
    merged.api_keys = [...projectKeys, ...globalKeys];
  }

  // Apply defaults
  merged.api_base = merged.api_base ?? "https://agentrouter.org";
  merged.debug = merged.debug ?? false;
  merged.api_keys = merged.api_keys ?? resolveDefaultApiKeys();

  return merged;
}

function resolveDefaultApiKeys(): ApiKey[] {
  if (process.env.AGENT_ROUTER_API_KEY !== undefined) {
    return [process.env.AGENT_ROUTER_API_KEY];
  }
  return [];
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

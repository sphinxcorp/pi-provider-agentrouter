import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { loadSettings } from "./settings.js";

export async function agentrouterConfigCommand(
  _args: string,
  ctx: ExtensionCommandContext
): Promise<void> {
  const settings = loadSettings(ctx.cwd);

  const lines: string[] = [];
  lines.push(`Agent Router Configuration`);
  lines.push(`========================`);
  lines.push(``);
  lines.push(`API Base: ${settings.api_base}`);
  lines.push(`Debug: ${settings.debug}`);
  lines.push(`API Keys: ${settings.api_keys?.length ?? 0} configured`);
  lines.push(``);

  if (settings.api_keys) {
    lines.push(`Keys:`);
    settings.api_keys.forEach((key, i) => {
      if (typeof key === "string") {
        const display = key === "$AGENT_ROUTER_API_KEY" ? "$AGENT_ROUTER_API_KEY" : key.slice(0, 8) + "...";
        lines.push(`  [${i}] ${display}`);
      } else {
        lines.push(`  [${i}] id=${key.id ?? i}, key=${key.key.slice(0, 8)}...`);
      }
    });
  }

  ctx.ui.notify(lines.join("\n"), "info");
}

# pi-provider-agentrouter

A pi extension that registers Agent Router providers based on API keys from settings files.

## Setup

Place the extension directory at `~/.pi/agent/extensions/pi-provider-agentrouter/`:

```
~/.pi/agent/extensions/pi-provider-agentrouter/
├── index.ts
├── settings.ts
├── fetch.ts
├── computeModels.ts
├── command.ts
├── package.json
└── README.md
```

Or install via npm/git as a pi package.

## Configuration

Settings are loaded from two locations:

- **Global**: `~/.agentrouter/settings.json`
- **Project**: `<project_dir>/.agentrouter/settings.json`

Project settings override global settings. API keys from both files are merged (project keys first).

### Settings Structure

```json
{
  "api_base": "https://agentrouter.org",
  "debug": false,
  "api_keys": ["$AGENT_ROUTER_API_KEY"]
}
```

- `api_base` - Agent Router API base URL (default: `https://agentrouter.org`)
- `debug` - Enable debug logging (default: `false`)
- `api_keys` - Array of API keys (string or `{ key, id }` objects). Default: resolved from the `AGENT_ROUTER_API_KEY` environment variable; empty array if unset.

### API Key Formats

```json
{
  "api_keys": [
    "$AGENT_ROUTER_API_KEY",
    { "key": "sk-...", "id": "my-key" }
  ]
}
```

Each key can be either:

- A plain string (used directly as the API key, with the array index as its id)
- An object `{ key: string, id?: string }` (with an optional id for naming the provider)

### Default API Key Resolution

If `api_keys` is not specified in any settings file, the extension falls back to the `AGENT_ROUTER_API_KEY` environment variable. If that is also unset, no API keys are resolved and no providers are registered (only the config command is available).

## Commands

- `/agentrouter-config` - Display current Agent Router configuration (API base, debug flag, and configured API keys)

## How It Works

1. **Startup**: The extension loads settings, resolves API keys, and—if at least one key is present—fetches the pricing API (`https://agentrouter.org/api/pricing`, uncached) and models.dev (`https://models.dev/models.json`, cached 24h at `~/.agentrouter/.models-cache.json`) to compute the initial model list.
2. **No API keys**: If no API keys are resolved, only the `agentrouter-config` command is registered (no providers).
3. **Provider registration**: A provider is registered for each API key, named `agentrouter_<key_id>`. Each provider is named `Agent Router (<key_id>)`.
4. **Shared provider config**: All providers share `baseUrl` (from `api_base`), `api` set to `anthropic-messages`, `authHeader: true`, and the computed initial model list.
5. **Model refresh**: Each provider's `refreshModels` re-fetches pricing and models.dev, then recomputes models via `computeModels`. Errors are logged and an empty array is returned.
6. **API selection**: Models whose `supported_endpoint_types` include `"anthropic"` use the `anthropic-messages` API; all others use `openai-completions` with a `/v1` base URL appended to `api_base`.
7. **Cost computation**: Input and output costs are derived from Agent Router pricing using the formula `(group_ratio * model_ratio * 1_000_000) / 500_000` (input) and `(group_ratio * completion_ratio * 1_000_000) / 500_000` (output), where `group_ratio` comes from the pricing response's `group_ratio["default"]` (defaulting to `1`). Cache read/write costs default to `0`.
8. **Model metadata**: Context window defaults to `128_000` and max output tokens default to `4096` when not available from models.dev. Reasoning support and input modalities are sourced from models.dev when available.

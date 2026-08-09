# pi-provider-agentrouter

A [pi](https://github.com/earendil-works/pi-coding-agent) extension that registers [AgentRouter](https://agentrouter.org/register?aff=VSOC) models as providers, with pricing and model metadata resolved automatically at startup.

---
## About AgentRouter

[AgentRouter](https://agentrouter.org/register?aff=VSOC) unifies multiple `LLM` providers under a single `API key`, offering virtually free access to frontier models like `Claude Opus 5` or `GPT-5.6-Sol`.

* 🔑 **Unified Access:** Query multiple `LLM` providers using one single `API key`.
* 🎁 **Welcome Bonus:** Get a complimentary `$100` credit upon initial sign-up.
* ⏳ **Daily Credits:** Earn a `$25` credit just for logging in each day.
* 👥 **Referral Perks:** Receive `$100` per invite, and your friend gets `$50`.

> 💡 **Support a fellow dev:** If you are building with `LLMs` and want to test this platform, I would be genuinely grateful if you used my [referral link](https://agentrouter.org/register?aff=VSOC). It is a kind way for us to share these development credits and support each other's projects.
---

## Quick Start

**1. Install**

```bash
pi install npm:@sphinxcorp/pi-provider-agentrouter
```

<details>
<summary>Alternative: manual install</summary>

Clone or copy the extension so that it lives at `~/.pi/agent/extensions/pi-provider-agentrouter/` (containing `index.ts`, `settings.ts`, `fetch.ts`, `computeModels.ts`, `command.ts`, `package.json`).

</details>

**2. Set your API key**

```bash
echo 'export AGENT_ROUTER_API_KEY="sk-..."' >> ~/.zshrc
source ~/.zshrc
```

**3. Verify**

Run `/agentrouter-config` inside pi. You should see your API base and one configured key.

That's it — Agent Router models are now available in the model picker.

---

## Configuration

Most users only need `AGENT_ROUTER_API_KEY`. Use settings files when you need **multiple keys** or a **custom API base**.

### Environment variables

| Variable                 | Purpose                        | Default                   |
| ------------------------ | ------------------------------ | ------------------------- |
| `AGENT_ROUTER_API_KEY`   | API key (registered as id `env`) | — |
| `AGENT_ROUTER_API_BASE`  | Override the API base URL      | `https://agentrouter.org` |

### Settings files

Both files are optional, and both are read:

| Scope       | Path                              | Applies to        |
| ----------- | --------------------------------- | ----------------- |
| **Global**  | `~/.agentrouter/settings.json`     | Every project     |
| **Project** | `<cwd>/.agentrouter/settings.json` | The current directory |

```jsonc
{
  "api_base": "https://agentrouter.org",  // optional
  "debug": false,                         // optional
  "api_keys": [
    "sk-plain-key",                       // id becomes the array index
    { "key": "sk-...", "id": "work" }     // id names the provider
  ]
}
```

| Field      | Description                                       | Default                   |
| ---------- | ------------------------------------------------- | ------------------------- |
| `api_base` | Agent Router API base URL                          | `https://agentrouter.org` |
| `debug`    | Log resolved settings and keys at startup          | `false`                   |
| `api_keys` | Array of strings or `{ key, id }` objects          | `[]`                      |

> **Note:** `api_keys` entries are used **literally**. A string like `"$AGENT_ROUTER_API_KEY"` is *not* expanded — it would be sent as the key itself. Use the environment variable directly instead.

Example — two keys available in every project:

```bash
mkdir -p ~/.agentrouter
cat > ~/.agentrouter/settings.json << 'EOF'
{
  "api_keys": [
    { "key": "sk-...", "id": "personal" },
    { "key": "sk-...", "id": "work" }
  ]
}
EOF
```

### Precedence

- **`api_base` / `debug`** — project file overrides global file; `AGENT_ROUTER_API_BASE` overrides both.
- **`api_keys`** — *merged, not overridden*, in this order: env key → project keys → global keys, then **deduplicated by key value** (first occurrence wins).

### Provider naming

| Keys resolved | Provider id            | Display name           |
| ------------- | ---------------------- | ---------------------- |
| Exactly one   | `agentrouter`          | `Agent Router`         |
| Two or more   | `agentrouter_<id>`     | `Agent Router (<id>)`  |

If no keys are resolved anywhere, **no providers are registered** — only the `/agentrouter-config` command is available.

---

## Commands

| Command               | Description                                                     |
| --------------------- | --------------------------------------------------------------- |
| `/agentrouter-config` | Show the API base, debug flag, and configured keys (truncated). |

---

## How It Works

1. **Startup** — settings are loaded from the global and project files, then keys are resolved and deduplicated.
2. **Data sources** — the extension fetches Agent Router pricing (`/api/pricing`, always fresh) and [models.dev](https://models.dev/models.json) metadata (cached 24h at `~/.agentrouter/.models-cache.json`).
3. **Registration** — one provider per resolved key, all sharing the same base URL, the `anthropic-messages` API, and the computed model list.
4. **Refresh** — each provider re-fetches pricing and models.dev on `refreshModels`. On error it logs and returns an empty list.

### Model list construction

Each pricing entry is matched to models.dev by the **last path segment** of the models.dev id (e.g. `anthropic/claude-sonnet-4` matches `claude-sonnet-4`), then expanded by its `supported_endpoint_types`:

| Endpoint types      | Entries produced                                                             |
| ------------------- | ---------------------------------------------------------------------------- |
| `anthropic`         | One entry using the provider default `anthropic-messages` API                 |
| `openai`            | One entry using `openai-completions` against `<api_base>/v1`                  |
| both                | **Two** entries; the OpenAI one is suffixed `via OpenAI Completions`          |
| neither             | None — the model is skipped                                                   |

### Derived values

| Value                | Source                                                                 |
| -------------------- | ---------------------------------------------------------------------- |
| Input cost           | `group_ratio × model_ratio × 1_000_000 / 500_000`                       |
| Output cost          | `group_ratio × completion_ratio × 1_000_000 / 500_000`                  |
| Cache read/write     | `0`                                                                     |
| Context window       | models.dev `limit.context`, else `128_000`                              |
| Max output tokens    | models.dev `limit.output`, else `4096`                                  |
| Reasoning            | models.dev `reasoning`, else `false`                                    |
| Input modalities     | models.dev `modalities.input` minus `pdf`, else `["text"]`              |

`group_ratio` is taken from the pricing response's `group_ratio.default` (falling back to `1`).

---

## Troubleshooting

| Symptom                          | Check                                                                     |
| -------------------------------- | ------------------------------------------------------------------------- |
| No Agent Router models appear    | Run `/agentrouter-config` — if it reports `0 configured`, the key isn't being picked up. |
| Only some models are listed      | Models without an `anthropic` or `openai` endpoint type are skipped by design. |
| Stale model metadata             | Delete `~/.agentrouter/.models-cache.json` to force a refetch.             |
| Need more detail                 | Set `"debug": true` in a settings file to log resolved settings and keys.  |

---

## Project Layout

| File                | Responsibility                                                          |
| ------------------- | ------------------------------------------------------------------------ |
| `index.ts`          | Entry point — resolves keys, registers providers and the config command. |
| `settings.ts`       | Loads and merges global/project settings; resolves and dedupes keys.     |
| `fetch.ts`          | Fetches Agent Router pricing and models.dev metadata (with caching).     |
| `computeModels.ts`  | Maps pricing + models.dev into pi model definitions.                     |
| `command.ts`        | Implements `/agentrouter-config`.                                        |

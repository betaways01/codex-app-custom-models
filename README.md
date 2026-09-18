# Codex App custom models

Run MiMo, DeepSeek, Grok, and GLM inside the Codex desktop app through a local OpenCodex proxy.

This repository is a portable template. It contains no live API keys and no machine-specific paths. Setup writes configs under your home directory on whatever computer you use.

## What you get

| Picker name | Provider model | Typical use |
|---|---|---|
| Grok 4.6 | grok-4.6 | Quick tasks (xAI OAuth) |
| DeepSeek V4.1 Flash | deepseek-flash | Daily coding, 1M context, vision |
| MiMo V2.5 | mimo-v2.5 | Coding + screenshots |
| MiMo V2.5 Pro | mimo-v2.5-pro | Flat-rate daily coding |
| GLM 5.3 | glm-5.3 | Hard reasoning |
| GLM 5.3 Flash | glm-5.3-flash | Volume work |

Path: Codex App -> OpenCodex on 127.0.0.1:10100 -> provider API. One hop. No extra router.

See PROVIDERS.md for other vendors you can add yourself.

## For coding agents

1. npm i -g @bitkyc08/opencodex
2. git clone https://github.com/betaways01/codex-app-custom-models.git
3. cd codex-app-custom-models && chmod +x scripts/*.sh install.sh && ./scripts/setup.sh
4. When prompted, paste keys into the script, never into chat.
5. opencodex restart
6. Tell the user to quit Codex fully and reopen it.

Do not copy ~/.opencodex/config.json back into this repo. That file holds secrets.

## For humans

### 1. Prerequisites

- Node.js from https://nodejs.org
- Codex desktop app
- At least one provider account (MiMo, DeepSeek, xAI, or Z.AI)

### 2. Install

    npm i -g @bitkyc08/opencodex
    git clone https://github.com/betaways01/codex-app-custom-models.git
    cd codex-app-custom-models
    chmod +x scripts/*.sh
    ./scripts/setup.sh

The script copies templates to:

- ~/.opencodex/config.json (keys, mode 600)
- ~/.codex/opencodex.config.toml (points Codex at the proxy)

It does not overwrite your Codex app settings, project list, or plugins.

Or:

    curl -fsSL https://raw.githubusercontent.com/betaways01/codex-app-custom-models/main/install.sh | bash

### 3. Keys (optional per provider)

| Provider | How |
|---|---|
| MiMo | Dedicated API Key from your token-plan page (starts with tp-sk) |
| DeepSeek | Key from https://platform.deepseek.com/api_keys, or opencodex login deepseek |
| GLM | Key from https://z.ai/manage-apikey/apikey-list |
| Grok | opencodex login xai (browser OAuth, no key in the file) |

Skip any provider you do not use.

### 4. Restart Codex

    opencodex restart

Quit Codex completely, reopen, pick a model.

## Which model

- Daily coding: MiMo V2.5 Pro (flat plan) or DeepSeek V4.1 Flash (cheap cache-heavy API).
- Screenshots: MiMo V2.5 or DeepSeek V4.1 Flash. Keep image threads short; old screenshots bloat the HTTP body.
- Hard reasoning: GLM 5.3, or DeepSeek at effort max for one turn, then back to high.
- Quick / free: Grok 4.6.

Default effort in this template is high except GLM 5.3 (max).
## Screenshot-heavy threads (upstream 413)

Codex resends every screenshot in a thread on every turn. Providers cap the **request body**, not
the token window, so a thread full of screenshots can die with 413 Payload Too Large long before
it runs out of context. Measured against DeepSeek: 47.9 MiB accepted, 48 MiB rejected.

patches/opencodex-image-budget/ applies the resize ladder OpenCodex already ships for Anthropic
to every routed vision provider, so the image payload stays under the provider limit while every
screenshot still reaches the model. See patches/opencodex-image-budget/README.md.

    python3 patches/opencodex-image-budget/apply.py
    opencodex restart

setup.sh applies it automatically. Re-run after every opencodex update.

## Adding another provider

Edit ~/.opencodex/config.json (not the copy in this repo). Add a providers entry with adapter, baseUrl, authMode, optional apiKey, models. Then:

    opencodex restart
    opencodex sync

## Security

- Keys live only in ~/.opencodex/config.json with chmod 600.
- Placeholders in git: YOUR_MIMO_API_KEY_HERE, YOUR_DEEPSEEK_API_KEY_HERE, YOUR_GLM_API_KEY_HERE.
- Proxy binds to localhost.
- See SECURITY.md.

Never copy ~/.opencodex/config.json into configs/ and push. That publishes your keys.

## Troubleshooting

| Symptom | Check |
|---|---|
| Reconnecting / 502 | opencodex status then opencodex restart. Confirm the key is not a placeholder. |
| Model missing | opencodex sync. Quit and reopen Codex. |
| 401 | New key at the provider site; paste into ~/.opencodex/config.json. |
| 413 payload too large | Apply patches/opencodex-image-budget (bounds image bytes automatically). |
| Port in use | lsof -i :10100 |

Run ./scripts/validate.sh and ./scripts/health-check.sh after setup.

## Files

| Path | Role |
|---|---|
| configs/opencodex/config.json | Provider template (placeholders only) |
| configs/codex/opencodex.config.toml | Proxy pointer |
| scripts/setup.sh | Portable installer |
| scripts/validate.sh | Config check |
| scripts/health-check.sh | Live proxy ping |
| scripts/claude-mimo* | Optional Claude Code wrappers (read key from env or local config) |
| install.sh | curl installer |

The live model catalog is generated on your machine by opencodex sync. It is not stored here.

## License

MIT

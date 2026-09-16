# Security

This repo is a **template**. Real API keys must never be committed.

## What belongs here

- Provider URLs, model ids, effort maps
- Placeholder strings such as YOUR_MIMO_API_KEY_HERE
- Install scripts that write keys into ~/.opencodex/config.json on the user machine

## What must never be here

- Live API keys (sk-..., tp-sk..., GLM keys)
- A personal ~/.codex/config.toml (it lists local project paths)
- Generated opencodex-catalog.json
- Usage logs, sqlite DBs, screenshots of dashboards with keys

## If a key was committed

1. Revoke it at the provider dashboard immediately.
2. Create a new key.
3. Put the new key only in ~/.opencodex/config.json (mode 600).
4. Do not copy that file back into this repository.

History of this repo was rewritten to drop previously committed secrets. Anyone who cloned an older copy still has those values locally and must treat them as leaked.

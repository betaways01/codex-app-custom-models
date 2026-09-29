# Patch: Grok 4.7 effort ladder

Codex hides the effort slider when a catalog entry has an empty supported_reasoning_levels list.

OpenCodex OAuth reconcile copies the xAI registry preset into config.json on every start.
The bundled preset still only declares grok-4.6 and grok-4.5 ladders, so any grok-4.7
efforts written with ocx config set are deleted on restart. The Grok 4.7 combo then
publishes with no levels.

This patch adds grok-4.7 and grok-4.7-build-fast to the xAI registry seed:
low / medium / high / xhigh (default high), matching docs.x.ai reasoning docs.

    python3 patches/opencodex-xai-grok47-efforts/apply.py
    opencodex restart
    opencodex sync

Quit Codex fully afterwards.

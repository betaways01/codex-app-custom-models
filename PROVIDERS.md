# Supported Providers

All providers below are built into opencodex. You do not need to install anything extra. Just add the provider config and restart.

## Already configured in this repo

| Provider | Models | Auth | Cost |
|---|---|---|---|
| MiMo | mimo-v2.5, mimo-v2.5-pro | API key | $6-100/mo subscription |
| DeepSeek | deepseek-flash, deepseek-v4-pro | API key | Pay-per-token |
| Grok | grok-4.6, grok-4.5 | OAuth | Free with X account |
| GLM (Z.AI) | glm-5.3, glm-5.3-flash, glm-5-turbo | API key | $18/mo Lite subscription |

## Free providers (no payment needed)

### Groq
Ultra-fast inference. Free tier with generous limits.
- Dashboard: https://console.groq.com/keys
- Base URL: https://api.groq.com/openai/v1
- Auth: API key
- Models: llama-3.3-70b, mixtral-8x7b, gemma-7b
- Best for: Fast iteration, quick tasks

### Google Gemini (AI Studio)
Free tier with 1M token context.
- Dashboard: https://aistudio.google.com/apikey
- Base URL: https://generativelanguage.googleapis.com
- Auth: API key
- Models: gemini-3.5-flash, gemini-3.6-flash, gemini-3.7-flash
- Best for: Long context, image input, free coding

### Cerebras
Fast inference on custom hardware. Free tier available.
- Dashboard: https://cloud.cerebras.ai/platform/apikeys
- Base URL: https://api.cerebras.ai/v1
- Auth: API key
- Models: gpt-oss-120b
- Best for: Fast responses, bulk processing

### MiMo Free
No key needed. Rate-limited but works.
- Built into opencodex as mimo-free
- No configuration needed
- Best for: Quick tasks, exploration

## Subscription plans (flat monthly fee)

### MiMo Token Plan ($6-100/mo)
- Dashboard: https://xiaomimimo.com
- Base URL: https://token-plan-sgp.xiaomimimo.com/v1
- Plans: Lite $6, Standard $16, Pro $50, Max $100
- No weekly cap, no 5-hour cap
- Best for: Daily coding, agent loops

### GLM Coding Plan ($18-168/mo)
- Dashboard: https://z.ai/manage-apikey/apikey-list
- Base URL: https://api.z.ai/api/coding/paas/v4
- Plans: Lite $18, Pro $72, Max $168
- 10K-140K credits/week
- Best for: Heavy coding, reasoning tasks

### Kimi Coding Plan
- Dashboard: https://platform.kimi.ai
- Base URL: https://api.kimi.com/coding/v1
- Auth: OAuth (login via browser)
- Models: kimi-k3, kimi-k2.7-code
- Best for: Long context coding, 1M token window

### Alibaba Qwen Token Plan
- Dashboard: https://modelstudio.console.alibabacloud.com
- Base URL: https://token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1
- Auth: API key
- Models: qwen3.7-max, qwen3.7-plus, qwen3.8-max
- Best for: Chinese-language coding, multi-model access

## Pay-per-token (flexible, pay for what you use)

### Anthropic (Claude)
- Dashboard: https://console.anthropic.com
- Base URL: https://api.anthropic.com
- Auth: API key
- Models: claude-sonnet-5, claude-opus-5, claude-haiku-4.5
- Best for: Complex reasoning, code review, architecture

### OpenAI API
- Dashboard: https://platform.openai.com/api-keys
- Base URL: https://api.openai.com/v1
- Auth: API key
- Models: gpt-5.6-sol, gpt-5.6-terra, gpt-5.6-luna, gpt-5.5
- Best for: When you need OpenAI models directly

### Mistral
- Dashboard: https://console.mistral.ai
- Base URL: https://api.mistral.ai/v1
- Auth: API key
- Models: codestral-latest, mistral-large
- Best for: European hosting, code-specialized models

### Together AI
- Dashboard: https://api.together.xyz/settings/api-keys
- Base URL: https://api.together.xyz/v1
- Auth: API key
- Models: Many open-source models (Llama, Mixtral, etc.)
- Best for: Access to many open-source models

### Fireworks AI
- Dashboard: https://fireworks.ai/account/api-keys
- Base URL: https://api.fireworks.ai/inference/v1
- Auth: API key
- Models: Various open-source models
- Best for: Fast inference, competitive pricing

### DeepInfra
- Dashboard: https://deepinfra.com/dash/api_keys
- Base URL: https://api.deepinfra.com/v1/openai
- Auth: API key
- Models: Many open-source models, live discovery
- Best for: Cheap inference, wide model selection

### OpenRouter
Access to 100+ models with one key.
- Dashboard: https://openrouter.ai/keys
- Base URL: https://openrouter.ai/api/v1
- Auth: API key
- Models: Claude, GPT, Gemini, Llama, and many more
- Best for: One key to access everything

## Local models (no API key, no cost)

### Ollama
Run models on your own machine.
- Install: https://ollama.ai
- Base URL: http://localhost:11434/v1
- Auth: None (local)
- Models: Any model you download (llama, mistral, qwen, etc.)
- Best for: Privacy, offline work, no API costs

### LM Studio
GUI for running local models.
- Install: https://lmstudio.ai
- Base URL: http://localhost:1234/v1
- Auth: None (local)
- Models: Any GGUF model
- Best for: Easy local model management

### vLLM
High-performance local inference server.
- Install: https://github.com/vllm-project/vllm
- Base URL: http://localhost:8000/v1
- Auth: None (local)
- Models: Any HuggingFace model
- Best for: Production local inference

## How to add a provider

1. Edit ~/.opencodex/config.json
2. Add under providers:

    {
      "my-provider": {
        "adapter": "openai-chat",
        "baseUrl": "https://api.example.com/v1",
        "authMode": "key",
        "apiKey": "YOUR_KEY",
        "defaultModel": "model-name",
        "models": ["model-name", "model-name-fast"]
      }
    }

3. Restart: opencodex restart
4. The model appears in the Codex picker automatically.

## Provider comparison for coding

| Provider | Speed | Quality | Cost | Context | Best for |
|---|---|---|---|---|---|
| MiMo Pro | Fast | Good | $50/mo flat | 1M | Daily coding |
| GLM-5.3 | Medium | Great | $18/mo | 1M | Hard reasoning |
| DeepSeek V4 Pro | Fast | Great | Pay-per-token | 1M | Complex tasks |
| Grok 4.6 | Fast | Good | Free | 500K | Quick tasks |
| Claude Sonnet | Fast | Great | Pay-per-token | 200K | Code review |
| Gemini Flash | Fast | Good | Free | 1M | Long context |
| Groq | Very fast | Good | Free | 32K | Quick iteration |
| Ollama | Varies | Varies | Free | Varies | Privacy |

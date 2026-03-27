# UPDATES_TODO.md — Sources Audit Report (March 2026)

> **Generated:** 2026-03-27
> **Methodology:** Cross-referenced `sources.js` models against official provider docs, live API catalogs, and community reports via Exa web search.
> **Status legend:** ✅ Still available | ❌ Removed/Deprecated | 🆕 New model (not in sources.js) | ⚠️ Updated/Changed | 🔍 Needs verification

---

## Summary

| Provider | In sources.js | Still Valid | Removed | New Available | Action Needed |
|---|---|---|---|---|---|
| **Groq** | 10 | 6 | 4 | 2 | 🔴 HIGH — 4 models removed |
| **OpenRouter** | 11 | 11 | 0 | 16+ | 🟡 MEDIUM — many new free models |
| **Cloudflare** | 6 | 6 | 0 | 5+ | 🟡 MEDIUM — new flagship models |
| **Scaleway** | 7 | 5 | 0 | 5+ | 🟡 MEDIUM — major catalog expansion |
| **Rovo Dev CLI** | 1 | 0 | 1 | 2 | 🔴 HIGH — model upgraded |
| **Google AI** | 3 | 3 | 0 | 4+ | 🟡 MEDIUM — new Gemma 3n family |
| **DeepInfra** | 2 | 2 | 0 | many | 🟡 MEDIUM — catalog hugely expanded |
| **Hyperbolic** | 10 | 10 | 0 | 3 | 🟢 LOW — new models available |
| **Together AI** | 7 | 7 | 0 | 6+ | 🟡 MEDIUM — major new models |
| **HuggingFace** | 2 | 🔍 | 🔍 | many | 🔴 HIGH — models likely outdated |
| **Replicate** | 1 | 🔍 | 🔍 | many | 🔴 HIGH — only old model listed |
| **Fireworks** | 2 | 🔍 | 0 | many | 🟡 MEDIUM — catalog expanded |
| **SambaNova** | 12 | 12 | 0 | 0 | 🟢 OK — up to date |
| **NVIDIA NIM** | 31 | 31 | 0 | few | 🟢 OK — mostly current |
| **Cerebras** | 7 | 7 | 0 | 0 | 🟢 OK — up to date |
| **Codestral/Mistral** | 1 | ⚠️ | 0 | 2 | 🟡 MEDIUM — Codestral version updated |
| **ZAI** | 7 | 7 | 0 | 0 | 🟢 OK — up to date |
| **SiliconFlow** | 6 | 6 | 0 | 0 | 🟢 OK — up to date |
| **Perplexity** | 4 | 4 | 0 | 0 | 🟢 OK — up to date |
| **Qwen/DashScope** | 8 | 8 | 0 | 0 | 🟢 OK — up to date |
| **iFlow** | 10 | 10 | 0 | 0 | 🟢 OK — up to date |
| **Gemini CLI** | 3 | 3 | 0 | 0 | 🟢 OK — up to date |
| **OpenCode Zen** | 5 | 5 | 0 | 0 | 🟢 OK — up to date |

---

## 1. 🔴 Groq — 4 Models REMOVED

**Source:** https://console.groq.com/docs/models (official docs, March 2026)

### ❌ REMOVED from Groq (no longer listed):

| Model ID (in sources.js) | Status | Notes |
|---|---|---|
| `deepseek-r1-distill-llama-70b` | ❌ Removed | No longer in Groq model catalog |
| `qwen-qwq-32b` | ❌ Removed | No longer in Groq model catalog |
| `moonshotai/kimi-k2-instruct` | ❌ Removed | No longer in Groq model catalog |
| `meta-llama/llama-4-maverick-17b-128e-preview` | ❌ Removed | No longer in Groq preview models |

### ✅ Still available on Groq:

| Model ID | Tier | Status |
|---|---|---|
| `llama-3.3-70b-versatile` | A- | ✅ Production |
| `meta-llama/llama-4-scout-17b-16e-preview` | A | ✅ Preview (was already in sources.js) |
| `llama-3.1-8b-instant` | B | ✅ Production |
| `openai/gpt-oss-120b` | S | ✅ Production |
| `openai/gpt-oss-20b` | A | ✅ Production |
| `qwen/qwen3-32b` | A+ | ✅ Preview |

### 🆕 NEW on Groq (not in sources.js):

| Model ID | Name | Notes |
|---|---|---|
| `groq/compound` | Groq Compound | 🆕 Agentic system w/ web search + code execution, ~450 tps |
| `groq/compound-mini` | Groq Compound Mini | 🆕 Lighter agentic system |

### 📋 TODO:

- [ ] Remove `deepseek-r1-distill-llama-70b` from Groq array
- [ ] Remove `qwen-qwq-32b` from Groq array
- [ ] Remove `moonshotai/kimi-k2-instruct` from Groq array
- [ ] Remove `meta-llama/llama-4-maverick-17b-128e-preview` from Groq array
- [ ] Consider adding `groq/compound` and `groq/compound-mini` as new models

---

## 2. 🟡 OpenRouter — 16+ New Free Models

**Source:** https://costgoat.com/pricing/openrouter-free-models (updated March 26, 2026) — 27 free models listed

### ✅ All 11 models in sources.js still available

All existing entries confirmed live on OpenRouter.

### 🆕 NEW free models on OpenRouter (not in sources.js):

| Model ID | Name | Tier (est.) | Notes |
|---|---|---|---|
| `nvidia/nemotron-3-super-120b-a12b:free` | Nemotron 3 Super 120B | A+ | 🆕 S-tier MoE model, 262K ctx |
| `minimax/minimax-m2.5:free` | MiniMax M2.5 | S+ | 🆕 Frontier model, 197K ctx |
| `openrouter/free` | OpenRouter Free Router | — | 🆕 Auto-selects best free model, 200K ctx, vision+tools |
| `arcee-ai/trinity-mini:free` | Arcee Trinity Mini | B | 🆕 Small model, 131K ctx |
| `meta-llama/llama-3.2-3b-instruct:free` | Llama 3.2 3B | C | 🆕 Edge model, 131K ctx |
| `nousresearch/hermes-3-llama-3.1-405b:free` | Hermes 3 405B | A | 🆕 Large model, 131K ctx |
| `arcee-ai/trinity-large-preview:free` | Arcee Trinity Large | A- | 🆕 Reasoning model, 131K ctx |
| `nvidia/nemotron-nano-12b-v2-vl:free` | Nemotron Nano 12B VL | B+ | 🆕 Vision model, 128K ctx |
| `nvidia/nemotron-nano-9b-v2:free` | Nemotron Nano 9B | B | 🆕 Small model, 128K ctx |
| `qwen/qwen3-4b:free` | Qwen3 4B | C | 🆕 Small model, 41K ctx |
| `liquid/lfm-2.5-1.2b-thinking:free` | Liquid LFM 2.5 Thinking | C | 🆕 Reasoning model, 33K ctx |
| `liquid/lfm-2.5-1.2b-instruct:free` | Liquid LFM 2.5 Instruct | C | 🆕 Small model, 33K ctx |
| `cognitivecomputations/dolphin-mistral-24b-venice-edition:free` | Dolphin Mistral 24B | B | 🆕 Uncensored, 33K ctx |
| `google/gemma-3-4b-it:free` | Gemma 3 4B | C | 🆕 Vision model, 33K ctx |
| `google/gemma-3n-e2b-it:free` | Gemma 3n E2B | C | 🆕 New Gemma 3n family, 8K ctx |
| `google/gemma-3n-e4b-it:free` | Gemma 3n E4B | C | 🆕 New Gemma 3n family, 8K ctx |

### 📋 TODO:

- [ ] Evaluate which new models are worth adding (prioritize S+/S/A+ tier)
- [ ] **Strong candidates:** `nvidia/nemotron-3-super-120b-a12b:free` (A+), `minimax/minimax-m2.5:free` (S+), `nousresearch/hermes-3-llama-3.1-405b:free` (A)
- [ ] Note: OpenRouter free tier is now 200 req/day (up from 50), no CC required

---

## 3. 🟡 Cloudflare Workers AI — 5+ New Models

**Source:** https://developers.cloudflare.com/workers-ai/models/ + https://blog.cloudflare.com/workers-ai-large-models/ (March 19, 2026)

Cloudflare now runs **large models** including Kimi K2.5! Major upgrade.

### ✅ All 6 models in sources.js still available

### 🆕 NEW on Cloudflare Workers AI (not in sources.js):

| Model ID | Name | Tier (est.) | Notes |
|---|---|---|---|
| `@cf/moonshotai/kimi-k2.5` | Kimi K2.5 | S+ | 🆕 Flagship addition! 256K ctx, vision, reasoning |
| `@cf/zhipu/glm-4.7-flash` | GLM-4.7-Flash | S | 🆕 Fast multilingual model, 131K ctx |
| `@cf/meta/llama-4-scout-17b-16e-instruct` | Llama 4 Scout | A | 🆕 MoE model, multimodal |
| `@cf/nvidia/nemotron-3-120b-a12b` | Nemotron 3 Super 120B | A+ | 🆕 Agentic MoE model |
| `@cf/qwen/qwen3-30b-a3b-fp8` | Qwen3 30B | A | 🆕 MoE coding model |
| `@cf/google/gemma-3-12b-it` | Gemma 3 12B | C | 🆕 Already in sources.js via googleai |

### 📋 TODO:

- [ ] Add `@cf/moonshotai/kimi-k2.5` — high-value S+ model
- [ ] Add `@cf/zhipu/glm-4.7-flash` — competitive S-tier
- [ ] Add `@cf/meta/llama-4-scout-17b-16e-instruct` — multimodal
- [ ] Add `@cf/nvidia/nemotron-3-120b-a12b` — agentic
- [ ] Add `@cf/qwen/qwen3-30b-a3b-fp8` — good coding model
- [ ] Note: Cloudflare blog post (Mar 19, 2026) confirms large model support is GA

---

## 4. 🟡 Scaleway — Major Catalog Expansion

**Source:** https://www.scaleway.com/en/docs/managed-inference/reference-content/model-catalog/

Scaleway now has a comprehensive catalog with many new models.

### ✅ Models in sources.js still available:

| Model ID (sources.js) | Status |
|---|---|
| `devstral-2-123b-instruct-2512` | ✅ Listed |
| `qwen3-235b-a22b-instruct-2507` | ✅ Listed |
| `gpt-oss-120b` | ✅ Listed |
| `qwen3-coder-30b-a3b-instruct` | ✅ Listed |
| `llama-3.3-70b-instruct` | ✅ Listed |
| `deepseek-r1-distill-llama-70b` | ✅ Listed |
| `mistral-small-3.2-24b-instruct-2506` | ✅ Listed |

### 🆕 NEW on Scaleway (not in sources.js):

| Model ID | Name | Tier (est.) | Notes |
|---|---|---|---|
| `qwen3.5-397b-a17b` | Qwen3.5 400B VLM | S | 🆕 Frontier VLM, 250K ctx, vision |
| `mistral-large-3-675b-instruct-2512` | Mistral Large 675B | A+ | 🆕 Frontier model, 250K ctx |
| `gemma-3-27b-it` | Gemma 3 27B | B | 🆕 Vision model |
| `magistral-small-2506` | Magistral Small | A | 🆕 Reasoning model |
| `devstral-small-2505` | Devstral Small | A- | 🆕 Lighter coding model |

### 📋 TODO:

- [ ] Add `qwen3.5-397b-a17b` — S-tier VLM
- [ ] Add `mistral-large-3-675b-instruct-2512` — A+ frontier model
- [ ] Consider adding other models based on relevance to coding

---

## 5. 🔴 Rovo Dev CLI — Model Upgraded

**Source:** Atlassian Community posts (Feb 2026)

### ❌ OUTDATED:

| Model ID (sources.js) | Status | Replacement |
|---|---|---|
| `anthropic/claude-sonnet-4` | ⚠️ Outdated | Now has Claude **Sonnet 4.6** and **Opus 4.6** |

### 🆕 NEW on Rovo Dev CLI:

| Model | Notes |
|---|---|
| `anthropic/claude-sonnet-4.6` | 🆕 Upgraded from Sonnet 4, better coding/agent performance |
| `anthropic/claude-opus-4.6` | 🆕 Now available on Rovo Dev Standard tier |

### 📋 TODO:

- [ ] Update `anthropic/claude-sonnet-4` → `anthropic/claude-sonnet-4.6` in Rovo array
- [ ] Add `anthropic/claude-opus-4.6` as new entry
- [ ] Update SWE-bench score (Sonnet 4.6 likely higher than 72.7%)
- [ ] Verify free tier still 5M tokens/day

---

## 6. 🟡 Google AI Studio — New Gemma 3n Family

**Source:** https://aistudio.google.com + https://ai.google.dev/gemma/docs/core

### ✅ Models in sources.js still valid:

| Model ID | Status |
|---|---|
| `gemma-3-27b-it` | ✅ Available |
| `gemma-3-12b-it` | ✅ Available |
| `gemma-3-4b-it` | ✅ Available |

### 🆕 NEW on Google AI Studio (not in sources.js):

| Model ID | Name | Tier (est.) | Notes |
|---|---|---|---|
| `gemma-3n-e4b-it` | Gemma 3n E4B | C | 🆕 New efficient family, on-device |
| `gemma-3n-e2b-it` | Gemma 3n E2B | C | 🆕 Smallest Gemma 3n |

### ⚠️ Note: Google AI Studio also has Gemini models for free API use:

| Model | Free Tier | Notes |
|---|---|---|
| `gemini-2.5-pro` | 5 RPM / 100 req/day | Not in sources.js (might be worth adding) |
| `gemini-2.5-flash` | 10 RPM / 250 req/day | Not in sources.js |
| `gemini-2.5-flash-lite` | 15 RPM / 1000 req/day | Not in sources.js |

### 📋 TODO:

- [ ] Add `gemma-3n-e4b-it` and `gemma-3n-e2b-it` if relevant
- [ ] Consider adding Gemini models (`gemini-2.5-flash`, etc.) as a separate provider or under googleai — they are FREE and competitive (S+ tier)
- [ ] Free tier reduced: Gemini 2.5 Pro at 100 req/day (down from previous), Flash at 250 req/day

---

## 7. 🟡 DeepInfra — Catalog Massively Expanded

**Source:** https://deepinfra.com/models + https://deepinfra.com/models/text-generation

DeepInfra now features NVIDIA Nemotron 3 Super and many more models. Sources.js only has 2 old models.

### ⚠️ Models in sources.js may be outdated:

| Model ID (sources.js) | Status |
|---|---|
| `mistralai/Mixtral-8x22B-Instruct-v0.1` | 🔍 Likely still available but outdated |
| `meta-llama/Meta-Llama-3.1-70B-Instruct` | 🔍 Likely still available |

### 🆕 Notable models now on DeepInfra (not in sources.js):

| Model ID | Name | Tier (est.) | Notes |
|---|---|---|---|
| `nvidia/Nemotron-3-Super` | Nemotron 3 Super 120B | A+ | 🆕 Featured model, agentic |
| `deepseek-ai/DeepSeek-V3.2` | DeepSeek V3.2 | S+ | 🆕 Latest DeepSeek |
| `Qwen/Qwen3-235B-A22B` | Qwen3 235B | S+ | 🆕 |
| Many more | — | — | Full catalog not fully verified |

### 📋 TODO:

- [ ] Refresh DeepInfra models — remove old ones, add current best models
- [ ] Verify exact model IDs via `https://api.deepinfra.com/v1/openai/models`
- [ ] Consider adding Nemotron 3 Super, DeepSeek V3.2, Qwen3 235B

---

## 8. 🟡 Hyperbolic — New Models Added

**Source:** https://app.hyperbolic.ai/models (live catalog)

### ✅ All 10 models in sources.js still available

### 🆕 NEW on Hyperbolic (not in sources.js):

| Model ID | Name | Tier (est.) | Notes |
|---|---|---|---|
| `Qwen3-Next-80B-A3B-Thinking` | Qwen3 Next 80B Thinking | S | 🆕 Thinking variant |
| `Qwen3-Next-80B-A3B-Instruct` | Qwen3 Next 80B Instruct | S | 🆕 Already in sources.js |
| `gpt-oss-20b` | GPT OSS 20B | A | 🆕 Small variant |
| `Qwen3-8B` | Qwen3 8B | B+ | 🆕 Small dense model |

### 📋 TODO:

- [ ] Add `Qwen3-Next-80B-A3B-Thinking` — thinking variant of existing model
- [ ] Add `gpt-oss-20b` — smaller variant of gpt-oss-120b already listed
- [ ] Consider if `Qwen3-8B` is worth adding (B+ tier)

---

## 9. 🟡 Together AI — Major New Models

**Source:** https://www.together.ai/models (live catalog)

### ✅ All 7 models in sources.js still available

### 🆕 NEW on Together AI (not in sources.js):

| Model ID | Name | Tier (est.) | Notes |
|---|---|---|---|
| `nvidia/Nemotron-3-Super` | Nemotron 3 Super 120B | A+ | 🆕 Agentic MoE |
| `Qwen/Qwen3.5-397B-A17B` | Qwen3.5 400B VLM | S | 🆕 Frontier VLM, $0.60/$3.60 per 1M |
| `MiniMaxAI/MiniMax-M2.5` | MiniMax M2.5 | S+ | 🆕 Frontier, $0.30/$1.20 per 1M |
| `zai-org/GLM-5` | GLM-5 | S+ | 🆕 Frontier, $1.00/$3.20 per 1M |
| `Qwen/Qwen3.5-9B` | Qwen3.5 9B | B+ | 🆕 Small model, vision |
| `DeepSeek-AI/DeepSeek-V3-2-Exp` | DeepSeek V3.2 Exp | S+ | 🆕 Experimental variant |

### 📋 TODO:

- [ ] Add `Qwen/Qwen3.5-397B-A17B` — S-tier VLM, competitive pricing
- [ ] Add `MiniMaxAI/MiniMax-M2.5` — S+ frontier, excellent pricing
- [ ] Add `zai-org/GLM-5` — S+ frontier model
- [ ] Note: Together AI has NO free tier ($5 min credit required) — verify if this should still be listed as "free"

---

## 10. 🔴 HuggingFace — Models Likely Outdated

**Source:** https://huggingface.co/models?inference_provider=hf-inference

### ⚠️ Only 2 models in sources.js, both may be stale:

| Model ID (sources.js) | Status |
|---|---|
| `deepseek-ai/DeepSeek-V3-Coder` | 🔍 May not exist — DeepSeek V3 Coder is not a standard model name |
| `bigcode/starcoder2-15b` | 🔍 Available but very outdated (2024 model) |

### 📋 TODO:

- [ ] Verify `deepseek-ai/DeepSeek-V3-Coder` exists — may need to be `deepseek-ai/DeepSeek-V3-0324` or similar
- [ ] Replace `bigcode/starcoder2-15b` with more current model
- [ ] Consider adding newer popular free models from HF Inference API
- [ ] Note: HF free tier has very small credits, cold starts for unpopular models

---

## 11. 🔴 Replicate — Only Old Model Listed

**Source:** https://replicate.com (now part of Cloudflare)

### ⚠️ Only 1 model in sources.js:

| Model ID (sources.js) | Status |
|---|---|
| `codellama/CodeLlama-70b-Instruct-hf` | 🔍 Very outdated (2023 model) |

### 📋 TODO:

- [ ] Verify if CodeLlama 70B is still available on Replicate
- [ ] Consider replacing with more current model (e.g., DeepSeek V3, Qwen3)
- [ ] Note: Replicate has joined Cloudflare — may affect availability
- [ ] Consider if Replicate is still relevant as a provider given its paid-only nature

---

## 12. 🟡 Fireworks AI — Catalog Expanded

**Source:** https://fireworks.ai/models + https://fireworks.ai/deepseek

### ✅ Both models likely still available:

| Model ID (sources.js) | Status |
|---|---|
| `accounts/fireworks/models/deepseek-v3` | ✅ Available |
| `accounts/fireworks/models/deepseek-r1` | ✅ Available |

### 📋 TODO:

- [ ] Verify model IDs are current (Fireworks may have updated model versioning)
- [ ] Consider adding newer models (Llama 4, Qwen3) if available on Fireworks
- [ ] Note: Free tier at 10 RPM without CC, 6000 RPM with CC

---

## 13. 🟡 Codestral/Mistral — Version Updated

**Source:** https://docs.mistral.ai/guides/model-selection/

### ⚠️ Codestral has been updated:

| Model ID (sources.js) | Current Latest | Notes |
|---|---|---|
| `codestral-latest` | Points to `codestral-2508` | ⚠️ sources.js uses generic alias — should still work |

### 🆕 New Mistral models not in sources.js:

| Model ID | Name | Notes |
|---|---|---|
| `codestral-2508` | Codestral 2508 | 🆕 Latest version (Jul 2025), 256K ctx |
| `devstral-medium-2507` | Devstral Medium | 🆕 Enterprise coding model, 128K ctx |

### 📋 TODO:

- [ ] `codestral-latest` alias should still work, but consider pinning to `codestral-2508`
- [ ] Consider adding `devstral-medium-2507` as a premium coding model
- [ ] Note: Mistral free tier = 2 RPM, 1B tokens/month (Experiment tier)

---

## 14. ✅ SambaNova — Up to Date

**Source:** https://docs.sambanova.ai/docs/en/models/sambacloud-models

### All 12 models in sources.js confirmed in SambaNova docs.

### Production models: MiniMax-M2.5, DeepSeek-R1-0528, DeepSeek-V3-0324, DeepSeek-V3.1, DeepSeek-R1-Distill-Llama-70B, Meta-Llama-3.3-70B-Instruct, Meta-Llama-3.1-8B-Instruct

### Preview models: DeepSeek-V3.1-Terminus, DeepSeek-V3.2, Llama-4-Maverick-17B-128E-Instruct, gpt-oss-120b, Qwen3-235B-A22B-Instruct-2507, Qwen3-32B

### 📋 TODO:

- [ ] No changes needed
- [ ] Note: Qwen3-32B context is 32K (not 128K as in sources.js) — ⚠️ verify ctx size

---

## 15. ✅ NVIDIA NIM — Mostly Current

**Source:** https://build.nvidia.com/models — 92 free endpoint models

### All 31 models in sources.js appear to still be available on NIM.

### 📋 TODO:

- [ ] Spot-check a few model IDs via API to confirm availability
- [ ] Consider adding any new coding-relevant models from the 92 free endpoints

---

## 16. ✅ Cerebras — Up to Date

**Source:** https://cloud.cerebras.ai — 12 models available

### All 7 models in sources.js confirmed.

### 📋 TODO:

- [ ] No changes needed

---

## 17. ✅ ZAI — Up to Date

**Source:** https://z.ai/blog/glm-5 — GLM-5 released Feb 2026

### All 7 models in sources.js confirmed.

### 📋 TODO:

- [ ] No changes needed

---

## 18. ✅ SiliconFlow — Up to Date

**Source:** https://docs.siliconflow.com/quickstart/models

### All 6 models in sources.js confirmed (note: these are paid models, not the free tier).

### 📋 TODO:

- [ ] No changes needed
- [ ] Note: SiliconFlow free tier only has small/old models (Qwen2-7B, Mistral-7B, etc.)

---

## 19. ✅ Perplexity — Up to Date

**Source:** https://docs.perplexity.ai/docs/sonar/models

### All 4 Sonar models in sources.js still available.

### 📋 TODO:

- [ ] No changes needed
- [ ] Note: Perplexity is NOT free — API requires paid credits. Consider if it should be in a "free coding models" tool.

---

## 20. ✅ Qwen/DashScope — Up to Date

**Source:** https://dashscope-intl.aliyuncs.com

### All 8 models in sources.js appear current.

### 📋 TODO:

- [ ] No changes needed

---

## 21. ✅ iFlow — Up to Date

**Source:** https://platform.iflow.cn + community reports

### All 10 models in sources.js appear current.

### 📋 TODO:

- [ ] No changes needed
- [ ] Note: iFlow API keys expire every 7 days (refresh required)

---

## 22. ✅ Gemini CLI — Up to Date

**Source:** https://github.com/google-gemini/gemini-cli

### All 3 models in sources.js confirmed.

### 📋 TODO:

- [ ] No changes needed
- [ ] Note: Gemini 3 Pro is now available — consider adding if not already listed

---

## 23. ✅ OpenCode Zen — Up to Date

**Source:** https://opencode.ai

### All 5 models in sources.js confirmed.

### 📋 TODO:

- [ ] No changes needed

---

## Priority Action Items (Ranked)

### 🔴 Critical — Do First

1. **Groq: Remove 4 deprecated models** (`deepseek-r1-distill-llama-70b`, `qwen-qwq-32b`, `moonshotai/kimi-k2-instruct`, `meta-llama/llama-4-maverick-17b-128e-preview`)
2. **Rovo Dev CLI: Update Claude model** from Sonnet 4 → Sonnet 4.6, add Opus 4.6
3. **HuggingFace: Verify/fix model IDs** (`deepseek-ai/DeepSeek-V3-Coder` may not exist)
4. **Replicate: Replace outdated CodeLlama 70B** (2023 model)

### 🟡 Important — Do Soon

5. **OpenRouter: Add best new free models** (MiniMax M2.5, Nemotron 3 Super, Hermes 3 405B)
6. **Cloudflare: Add Kimi K2.5, GLM-4.7-Flash** and other new models
7. **Scaleway: Add Qwen3.5 400B, Mistral Large 675B**
8. **DeepInfra: Refresh entire model list** (replace old models with current ones)
9. **Together AI: Add GLM-5, Qwen3.5, MiniMax M2.5** — verify if "free" status still applies
10. **Google AI Studio: Consider adding Gemini models** (2.5 Flash/Pro are free and competitive)
11. **Fireworks: Verify model IDs and add newer models**

### 🟢 Nice to Have

12. **Groq: Add Compound/Compound Mini** (agentic systems)
13. **Hyperbolic: Add Qwen3 Next Thinking variant**
14. **Codestral: Pin version to `codestral-2508`**
15. **Google AI: Add Gemma 3n models**
16. **Perplexity: Re-evaluate if it belongs in "free coding models"** (not actually free)

---

## Sources & References

- Groq: https://console.groq.com/docs/models
- OpenRouter Free: https://costgoat.com/pricing/openrouter-free-models (27 models, updated Mar 26, 2026)
- Cloudflare: https://developers.cloudflare.com/workers-ai/models/ + https://blog.cloudflare.com/workers-ai-large-models/
- Scaleway: https://www.scaleway.com/en/docs/managed-inference/reference-content/model-catalog/
- SambaNova: https://docs.sambanova.ai/docs/en/models/sambacloud-models
- Mistral: https://docs.mistral.ai/guides/model-selection/
- Together AI: https://www.together.ai/models
- Hyperbolic: https://app.hyperbolic.ai/models
- Rovo: https://community.atlassian.com/forums/Rovo-for-Software-Teams-Beta/
- Free AI API Guide 2026: https://awesomeagents.ai/tools/free-ai-inference-providers-2026/
- NVIDIA NIM: https://build.nvidia.com/models
- Cerebras: https://cloud.cerebras.ai
- ZAI: https://z.ai/blog/glm-5
- Google AI: https://aistudio.google.com + https://ai.google.dev/gemma/docs/core

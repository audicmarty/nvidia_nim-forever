/**
 * @file sources.js
 * @description NVIDIA NIM models for free-coding-models.
 * 
 * @details
 * This file contains ONLY NVIDIA NIM model definitions.
 * Focused fork for NVIDIA's free tier with GLM thinking proxy support.
 * 
 * @exports nvidiaNim — model array for NVIDIA
 * @exports sources — map of { nvidia } with { name, url, models }
 * @exports MODELS — flat array of [modelId, label, tier, sweScore, ctx, providerKey]
 */

// 📖 NVIDIA NIM source - https://build.nvidia.com
export const nvidiaNim = [
  // ── S+ tier — SWE-bench Verified ≥70% ──
  ['deepseek-ai/deepseek-v3.2', 'DeepSeek V3.2', 'S+', '73.1%', '128k'],
  ['moonshotai/kimi-k2.5', 'Kimi K2.5', 'S+', '76.8%', '128k'],
  ['z-ai/glm5', 'GLM 5', 'S+', '77.8%', '128k'],
  ['z-ai/glm-5.1', 'GLM 5.1', 'S+', '58.4%', '131k'],
  ['z-ai/glm-5.1-thinking', 'GLM 5.1 Thinking', 'S+', '58.4%', '131k'],
  ['z-ai/glm4.7', 'GLM 4.7', 'S+', '73.8%', '200k'],
  ['moonshotai/kimi-k2-thinking', 'Kimi K2 Thinking', 'S+', '71.3%', '256k'],
  ['minimaxai/minimax-m2.1', 'MiniMax M2.1', 'S+', '74.0%', '200k'],
  ['minimaxai/minimax-m2.5', 'MiniMax M2.5', 'S+', '80.2%', '200k'],
  ['minimaxai/minimax-m2.7', 'MiniMax M2.7', 'S+', '56.2%', '204k'],
  ['stepfun-ai/step-3.5-flash', 'Step 3.5 Flash', 'S+', '74.4%', '256k'],
  ['qwen/qwen3-coder-480b-a35b-instruct', 'Qwen3 Coder 480B', 'S+', '70.6%', '256k'],
  ['qwen/qwen3-235b-a22b', 'Qwen3 235B', 'S+', '70.0%', '128k'],
  ['mistralai/devstral-2-123b-instruct-2512', 'Devstral 2 123B', 'S+', '72.2%', '256k'],
  // ── S tier — SWE-bench Verified 60–70% ──
  ['deepseek-ai/deepseek-v3.1-terminus', 'DeepSeek V3.1 Term', 'S', '68.4%', '128k'],
  ['moonshotai/kimi-k2-instruct-0905', 'Kimi K2 Instruct 0905', 'S', '65.8%', '256k'],
  ['moonshotai/kimi-k2-instruct', 'Kimi K2 Instruct', 'S', '65.8%', '128k'],
  ['minimaxai/minimax-m2', 'MiniMax M2', 'S', '69.4%', '128k'],
  ['qwen/qwen3-next-80b-a3b-thinking', 'Qwen3 80B Thinking', 'S', '68.0%', '128k'],
  ['qwen/qwen3-next-80b-a3b-instruct', 'Qwen3 80B Instruct', 'S', '65.0%', '128k'],
  ['qwen/qwen3.5-397b-a17b', 'Qwen3.5 400B VLM', 'S', '68.0%', '128k'],
  ['openai/gpt-oss-120b', 'GPT OSS 120B', 'S', '60.0%', '128k'],
  ['meta/llama-4-maverick-17b-128e-instruct', 'Llama 4 Maverick', 'S', '62.0%', '1M'],
  ['deepseek-ai/deepseek-v3.1', 'DeepSeek V3.1', 'S', '62.0%', '128k'],
  // ── A+ tier — SWE-bench Verified 50–60% ──
  ['nvidia/llama-3.1-nemotron-ultra-253b-v1', 'Nemotron Ultra 253B', 'A+', '56.0%', '128k'],
  ['mistralai/mistral-large-3-675b-instruct-2512', 'Mistral Large 675B', 'A+', '58.0%', '256k'],
  ['qwen/qwq-32b', 'QwQ 32B', 'A+', '50.0%', '131k'],
  ['igenius/colosseum_355b_instruct_16k', 'Colosseum 355B', 'A+', '52.0%', '16k'],
  // ── A tier — SWE-bench Verified 40–50% ──
  ['mistralai/mistral-medium-3-instruct', 'Mistral Medium 3', 'A', '48.0%', '128k'],
  ['mistralai/magistral-small-2506', 'Magistral Small', 'A', '45.0%', '32k'],
  ['nvidia/llama-3.3-nemotron-super-49b-v1.5', 'Nemotron Super 49B', 'A', '49.0%', '128k'],
  ['meta/llama-4-scout-17b-16e-instruct', 'Llama 4 Scout', 'A', '44.0%', '10M'],
  ['nvidia/nemotron-3-nano-30b-a3b', 'Nemotron Nano 30B', 'A', '43.0%', '128k'],
  ['deepseek-ai/deepseek-r1-distill-qwen-32b', 'R1 Distill 32B', 'A', '43.9%', '128k'],
  ['openai/gpt-oss-20b', 'GPT OSS 20B', 'A', '42.0%', '128k'],
  ['qwen/qwen2.5-coder-32b-instruct', 'Qwen2.5 Coder 32B', 'A', '46.0%', '32k'],
  ['meta/llama-3.1-405b-instruct', 'Llama 3.1 405B', 'A', '44.0%', '128k'],
  // ── A- tier — SWE-bench Verified 35–40% ──
  ['meta/llama-3.3-70b-instruct', 'Llama 3.3 70B', 'A-', '39.5%', '128k'],
  ['deepseek-ai/deepseek-r1-distill-qwen-14b', 'R1 Distill 14B', 'A-', '37.7%', '64k'],
  ['bytedance/seed-oss-36b-instruct', 'Seed OSS 36B', 'A-', '38.0%', '32k'],
  ['stockmark/stockmark-2-100b-instruct', 'Stockmark 100B', 'A-', '36.0%', '32k'],
  // ── B+ tier — SWE-bench Verified 30–35% ──
  ['mistralai/mixtral-8x22b-instruct-v0.1', 'Mixtral 8x22B', 'B+', '32.0%', '64k'],
  ['mistralai/ministral-14b-instruct-2512', 'Ministral 14B', 'B+', '34.0%', '32k'],
  ['ibm/granite-34b-code-instruct', 'Granite 34B Code', 'B+', '30.0%', '32k'],
  // ── B tier — SWE-bench Verified 20–30% ──
  ['deepseek-ai/deepseek-r1-distill-llama-8b', 'R1 Distill 8B', 'B', '28.2%', '32k'],
  ['deepseek-ai/deepseek-r1-distill-qwen-7b', 'R1 Distill 7B', 'B', '22.6%', '32k'],
  // ── C tier — SWE-bench Verified <20% or lightweight edge models ──
  ['google/gemma-2-9b-it', 'Gemma 2 9B', 'C', '18.0%', '8k'],
  ['microsoft/phi-3.5-mini-instruct', 'Phi 3.5 Mini', 'C', '12.0%', '128k'],
  ['microsoft/phi-4-mini-instruct', 'Phi 4 Mini', 'C', '14.0%', '128k'],
]

// 📖 Sources map - NVIDIA NIM only
export const sources = {
  nvidia: {
    name: 'NIM',
    url: 'https://integrate.api.nvidia.com/v1/chat/completions',
    models: nvidiaNim,
  },
}

// 📖 Flattened MODELS array with providerKey
export const MODELS = nvidiaNim.map(([modelId, label, tier, sweScore, ctx]) => [
  modelId,
  label,
  tier,
  sweScore,
  ctx,
  'nvidia',
])

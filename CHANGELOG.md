## [0.3.60] - 2026-04-23

### Fixed
- **NVIDIA NIM Key Testing Accuracy**: Removed hallucinated model names (`deepseek-ai/deepseek-v3.1-terminus`, `openai/gpt-oss-120b`) from the NVIDIA test model override list that were causing valid NIM keys to consistently return a `403 Forbidden` error. Tests now use the stable `meta/llama-3.1-8b-instruct` model to guarantee accurate validation.
- **Provider Authentication Diagnostics**: Updated the internal key-testing logic to correctly distinguish between `401 Unauthorized` (invalid API key) and `403 Forbidden` (valid key, but out of credits or missing model permissions).
- **Settings Dashboard UI**: Added a dedicated `[Forbidden ⛔]` status badge in the Settings menu with clear guidance when an account runs out of credits, preventing the misleading "Auth Error" label for valid but exhausted keys.

## [1.0.2] - 2026-04-23

### Fixed

- **GLM Proxy: Smart per-key rate limit cooldown** — The GLM proxy now tracks per-key 429 rate limit responses. When a key gets rate-limited by NVIDIA NIM, it is parked for 60 seconds before being retried. This prevents the proxy from hammering a rate-limited key on every attempt (up to 20 attempts), which was burning through quota and causing the second key to also hit its limit. Keys that are cooling down are automatically skipped in favor of available ones.

- **GLM Proxy: Fixed blind round-robin wasting both keys** — The previous implementation used a simple round-robin that would alternate between two keys even when one was rate-limited. With two keys at 40 RPM each, a large 368KB context request would trigger a 429 on key 1, then succeed on key 2 — but on the next request, key 1 would be tried again immediately (still rate-limited), then key 2 would handle it again, burning through key 2's RPM budget twice as fast. Now the system skips rate-limited keys entirely.

- **GLM Proxy: Proper wait when ALL keys are rate-limited** — When every configured API key is in cooldown, the proxy now waits intelligently for the soonest-expiring key (rather than spinning through 20 immediate attempts that all fail and return error to the user). A keepalive SSE comment is sent to OpenCode while waiting so the connection stays alive.

- **GLM Proxy: Full 429 response body logging** — The 429 error body from NVIDIA NIM (previously silently discarded) is now logged to `glm-proxy.log` for debugging. Response headers are also logged on every non-2xx response, making it much easier to diagnose rate limit vs authentication vs quota exhaustion issues.

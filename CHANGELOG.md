## [0.3.55] - 2026-04-22

### Added

- **Smart Model Router daemon** — Added the first production slice of the FCM Router: a localhost OpenAI-compatible daemon that can run in the background, expose `/v1/chat/completions`, and route `model: "fcm"` requests through a persistent model set.
- **Router lifecycle CLI flags** — Added `--daemon`, `--daemon-bg`, `--daemon-status`, and `--daemon-stop` so users can run the router in foreground service mode, start it detached, inspect it from scripts, or shut it down cleanly.
- **Model sets and named routing endpoints** — Added persisted router config under `router` in `~/.free-coding-models.json`, auto-created the default `fast-coding` set, and exposed `/v1/sets/:name/chat/completions` plus `/v1/models` virtual model discovery for tool compatibility.
- **Health probes, scoring, and failover** — Added cold-start probing, rolling health windows, priority-aware scoring, auth-error detection, stale-model detection, retryable upstream error handling, and per-model circuit breaker state.
- **Token and request stats** — Added metadata-only token usage tracking in `~/.free-coding-models-tokens.json`, `/health`, `/stats`, `/stats/tokens`, and SSE events for future TUI dashboard integration.
- **Router hardening integration tests** — Added deterministic fake-provider tests for success routing, non-streaming failover, streaming failover before first byte, partial stream failures, auth handling, all-models-down `503` payloads, malformed upstream responses, timeouts, connection refused, and client disconnects.

### Changed

- **Config persistence now preserves router data** — The config normalizer now understands the router schema, clamps timing and circuit-breaker settings, normalizes model priorities, and avoids dropping router sets when unrelated settings are saved.
- **Documentation now includes router setup** — README usage examples now explain how to start the daemon, configure coding tools with `http://localhost:19280/v1`, inspect status, and stop the service.
- **Router auth and quota behavior is stricter** — A `401` or `403` now skips remaining candidates from the same provider for the current request, and final router `503` responses include structured quota details such as retry and rate-limit headers when providers expose them.
- **Daemon restart API is intentionally hidden** — Removed the placeholder `/daemon/restart` behavior until a real launchd/systemd/TUI service-manager restart path exists.

### Fixed

- **Daemon-safe process handling** — The CLI fatal error handlers now defer to the router daemon when `--daemon` is active, allowing the daemon's own recovery and logging path to keep long-running sessions alive.
- **Upstream response hardening** — HTML maintenance pages and malformed successful JSON are now treated as retryable provider failures instead of being forwarded to coding tools.
- **Client disconnect cleanup** — If a coding tool disconnects mid-request, the daemon now aborts the upstream request without marking the provider unhealthy.
- **Package safety coverage** — Added a package sanity test that keeps `src/router-daemon.js` protected by the npm `files` allowlist.

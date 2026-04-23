## [1.1.0] - 2026-04-23

### Changed

- **Complete Technical Rebranding** — The project has been renamed from `nvidia-nim-forever` to `free-coding-models` across the entire codebase. This includes the CLI binary, TUI headers, help text, and internal module documentation.
- **Config & Data Migration** — Introduced an automatic migration system that moves existing user settings, API keys, and internal data from `~/.nvidia-nim-forever.json` and `~/.nvidia-nim-forever/` to the new canonical locations (`~/.free-coding-models.json` and `~/.free-coding-models/`). This ensures a seamless transition for existing users without data loss.
- **Improved Tool Compatibility** — Restored the full tool compatibility matrix for all models. Models are no longer restricted to a subset of tools and are now verified to work with Aider, OpenClaw, Goose, and other supported coding assistants by default.
- **Unified Project Identity** — Updated all external links, GitHub repository references, and headers to point to the new `free-coding-models` identity while maintaining support for existing environment variables.

### Fixed

- **Router Integration Stability** — Resolved a discrepancy in model discovery tests where mock providers were being skipped by routeability checks. Fixed the test harness to ensure reliable validation of the Smart Router failover logic.
- **Test Suite Alignment** — Fixed model count assertions in the integration test suite to align with the latest project registry, ensuring 335 tests pass consistently across the rebranded codebase.
- **Rebranding Leftovers** — Cleaned up several dozen stale "nvidia-nim-forever" references in security helpers, shell environment scripts, and the web dashboard components.

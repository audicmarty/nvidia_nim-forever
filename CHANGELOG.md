## [0.3.59] - 2026-04-23

### Fixed
- **Test Suite Env Poisoning**: Fixed a critical issue where running `pnpm test` would permanently overwrite the user's `~/.free-coding-models.env` file with `NVIDIA_API_KEY='nvapi-test'`. This caused the app to secretly load `nvapi-test` as the NVIDIA API key on startup via the shell environment, completely rejecting valid keys whenever the user pressed `T` to test models. The test suite now strictly uses isolated temporary directories for shell environment tests.

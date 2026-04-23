## [1.0.1] - 2026-04-23

### Fixed
- Fixed an issue where the API key configuration could be corrupted and overwritten with a stale `nvapi-test` value during the endpoint catalog refresh process.
- Fixed a bug in `resolveApiKeys` where trailing whitespace or newlines in pasted API keys were not trimmed, causing legitimate keys to be rejected with `403 Forbidden` errors by NVIDIA NIM.
- Fixed the router onboarding wizard to correctly save the `onboardingSeen` preference, preventing the prompt from reappearing on every startup.
- Fixed the router onboarding wizard Enter key behavior to correctly respect the cursor selection instead of always enabling the router.
- Updated all "FCM" branding in the router overlay to correctly display the full "free-coding-models" project name.
